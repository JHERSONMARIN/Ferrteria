// Casos de uso de categorías. Los productos guardan el nombre de su categoría como texto (además de la
// relación): al renombrar o reasignar se actualizan los dos, en la misma transacción.
import type { prisma } from '../../../db.ts';
import {
  CategoryError, MAX_CATEGORY_IMPORT_ROWS, categoryMetrics, checkImportRows, parseCategoryImportRow,
  parseCategoryName,
} from '../domain/catalog.ts';

type Client = typeof prisma;

const optionalText = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// Con sus métricas: productos activos, unidades, valor del inventario y cuántos están bajo el mínimo.
export async function listCategories(client: Client, includeInactive: boolean) {
  const categories = await client.categoria.findMany({
    where: includeInactive ? {} : { active: true },
    include: { productos: { where: { active: true }, select: { id: true, stock: true, minStock: true, price: true } } },
    orderBy: { name: 'asc' },
  });
  return categories.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    icon: c.icon || 'fa-tag',
    color: c.color || 'orange',
    active: c.active,
    createdAt: c.createdAt,
    ...categoryMetrics(c.productos.map(p => ({ stock: Number(p.stock), minStock: p.minStock === null ? null : Number(p.minStock), price: Number(p.price) }))),
  }));
}

export async function createCategory(client: Client, input: Record<string, unknown>) {
  return client.categoria.create({
    data: {
      name: parseCategoryName(input.name, true)!,
      description: optionalText(input.description),
      icon: optionalText(input.icon) ?? 'fa-tag',
      color: optionalText(input.color) ?? 'orange',
    },
  });
}

export async function updateCategory(client: Client, id: number, input: Record<string, unknown>) {
  const name = parseCategoryName(input.name, false);
  const current = await client.categoria.findUnique({ where: { id } });
  if (!current) throw new CategoryError('Categoría no encontrada.', 404);

  return client.$transaction(async (tx) => {
    const updated = await tx.categoria.update({
      where: { id },
      data: {
        name,
        description: input.description !== undefined ? optionalText(input.description) : undefined,
        icon: optionalText(input.icon) ?? undefined,
        color: optionalText(input.color) ?? undefined,
        active: typeof input.active === 'boolean' ? input.active : undefined,
      },
    });
    if (name && name !== current.name) {
      await tx.producto.updateMany({ where: { categoriaId: id }, data: { category: name } });
    }
    return updated;
  });
}

// Con productos, solo se borra si se indica a qué categoría pasan.
export async function deleteCategory(client: Client, id: number, targetId: number | null) {
  const category = await client.categoria.findUnique({ where: { id }, include: { _count: { select: { productos: true } } } });
  if (!category) throw new CategoryError('Categoría no encontrada.', 404);
  const count = category._count.productos;
  if (count > 0 && !targetId) {
    throw new CategoryError(
      `No se puede eliminar: la categoría contiene ${count} producto(s). Seleccione una categoría de destino para reasignarlos.`,
      400, null, { hasProducts: true, productCount: count },
    );
  }

  await client.$transaction(async (tx) => {
    if (count > 0 && targetId) {
      if (targetId === id) throw new CategoryError('La categoría de destino no puede ser la misma que se desea eliminar.');
      const target = await tx.categoria.findUnique({ where: { id: targetId } });
      if (!target) throw new CategoryError('La categoría de destino especificada no existe.');
      await tx.producto.updateMany({ where: { categoriaId: id }, data: { categoriaId: targetId, category: target.name } });
    }
    await tx.categoria.delete({ where: { id } });
  });
  return { success: true, message: 'Categoría eliminada exitosamente.', reassignedCount: targetId ? count : 0 };
}

// Todo o nada: con una fila inválida no se guarda ninguna y se devuelven los errores por fila.
export async function importCategories(client: Client, input: { rows: unknown; onExisting: unknown }) {
  const rows = input.rows;
  const onExisting = input.onExisting === 'update' ? 'update' : 'skip';
  if (!Array.isArray(rows) || rows.length === 0) throw new CategoryError('No hay filas para importar.');
  if (rows.length > MAX_CATEGORY_IMPORT_ROWS) throw new CategoryError(`Se pueden importar hasta ${MAX_CATEGORY_IMPORT_ROWS} filas por vez.`);

  const { valid, errors } = checkImportRows(rows, parseCategoryImportRow, r => r.name, (_r, first) => `La categoría se repite en la fila ${first}.`);
  if (errors.length > 0) throw new CategoryError('Hay filas con problemas: corríjalas antes de importar.', 400, null, { rows: errors });

  const existing = await client.categoria.findMany({ select: { id: true, name: true } });
  const byName = new Map(existing.map(c => [c.name.toLowerCase(), c]));

  return client.$transaction(async (tx) => {
    const summary = { created: 0, updated: 0, skipped: 0 };
    for (const row of valid) {
      const current = byName.get(row.name.toLowerCase());
      if (current && onExisting === 'skip') { summary.skipped++; continue; }
      if (current) {
        // El nombre no se cambia al actualizar: los productos lo usan como texto.
        await tx.categoria.update({
          where: { id: current.id },
          data: {
            active: true,
            ...(row.description !== null && { description: row.description }),
            ...(row.icon && { icon: row.icon }),
            ...(row.color && { color: row.color }),
          },
        });
        summary.updated++;
      } else {
        await tx.categoria.create({ data: { name: row.name, description: row.description, icon: row.icon || 'fa-tag', color: row.color || 'orange' } });
        summary.created++;
      }
    }
    return summary;
  }, { timeout: 60000 });
}

