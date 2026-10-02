// Casos de uso de productos: listar, registrar (con su stock inicial), editar, importar y buscar por código.
import type { Prisma } from '@prisma/client';
import type { prisma, Tx } from '../../../db.ts';
import { changedFields, recordAudit } from '../../audit/index.ts';
import { resolveBranchId } from '../../branches/index.ts';
import { quantityProblem } from '../../../utils/quantities.ts';
import type { SessionUser } from '../../../types/express.d.ts';
import { industryDataOf, parseProductData } from '../../../industries/index.ts';
import {
  DEFAULT_MIN_STOCK, ProductError, assertUnitCodesDiffer, checkImportRows, hasDecimalStock, parseProductImportRow,
} from '../domain/catalog.ts';
import type { z } from '@ferresys/contracts/zod';
import type { CreateProductBody, ProductImportBody, SaleUnitData, UpdateProductBody } from '@ferresys/contracts/catalog';

type Client = typeof prisma;
type Db = Pick<typeof prisma, 'producto' | 'productUnit' | 'categoria'>;

const BRANCH_STOCK_SELECT = { select: { branchId: true, stock: true, reserved: true } } as const;
const SALE_UNITS_SELECT = {
  where: { active: true },
  select: { id: true, name: true, factor: true, price: true, wholesalePrice: true, code: true, allowsFractions: true },
  orderBy: { factor: 'asc' },
} satisfies Prisma.Producto$saleUnitsArgs;

type BranchStockRow = { branchId: number; stock: unknown; reserved: unknown };
const branchStocksOf = (rows: readonly BranchStockRow[]) =>
  rows.map(b => ({ branchId: b.branchId, stock: Number(b.stock), reserved: Number(b.reserved) }));

// stock/reserved son los de la sucursal del usuario (lo que puede vender); totalStock/totalReserved, los de
// toda la empresa, y branches el detalle por sucursal.
function withBranchStock<T extends { branchStocks: BranchStockRow[]; stock: unknown; reserved: unknown }>(product: T, branchId: number) {
  const { branchStocks, stock, reserved, ...rest } = product;
  const branches = branchStocksOf(branchStocks);
  const own = branches.find(b => b.branchId === branchId);
  return { ...rest, stock: own?.stock ?? 0, reserved: own?.reserved ?? 0, totalStock: Number(stock), totalReserved: Number(reserved), branches };
}

export async function listProducts(client: Client, user: SessionUser) {
  const products = await client.producto.findMany({
    where: { active: true },
    select: {
      id: true, code: true, name: true, unit: true, allowsFractions: true, stock: true, reserved: true, wholesalePrice: true,
      minStock: true, price: true, category: true, industryData: true, branchStocks: BRANCH_STOCK_SELECT, saleUnits: SALE_UNITS_SELECT,
    },
    orderBy: { name: 'asc' },
  });
  return products.map(p => ({ ...withBranchStock(p, user.branchId), industryData: industryDataOf(p.industryData) }));
}

// Nombres de categoría para los formularios: las registradas y las que ya usan los productos.
export async function listCategoryNames(client: Client) {
  const [registered, used] = await Promise.all([
    client.categoria.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: 'asc' } }),
    client.producto.findMany({ where: { active: true }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } }),
  ]);
  return [...new Set([...registered.map(c => c.name), ...used.map(p => p.category).filter(Boolean)])];
}

// El código de una presentación no puede ser el de otro producto (el escáner no sabría cuál es).
async function assertUnitCodesFree(db: Db, units: SaleUnitData[] | undefined, productId: number | null = null) {
  const codes = (units ?? []).map(u => u.code).filter((c): c is string => Boolean(c));
  if (codes.length === 0) return;
  const clash = await db.producto.findFirst({
    where: { code: { in: codes }, ...(productId ? { id: { not: productId } } : {}) },
    select: { code: true },
  });
  if (clash) throw new ProductError(`El código ${clash.code} ya es de otro producto.`);
}

// Y al revés: el código del producto no puede ser el de una presentación de otro producto.
async function assertProductCodeFree(db: Db, code: string, productId: number | null = null) {
  const clash = await db.productUnit.findFirst({
    where: { code: code.trim(), ...(productId ? { productoId: { not: productId } } : {}) },
    select: { name: true, producto: { select: { name: true } } },
  });
  if (clash) throw new ProductError(`El código ya es de la presentación ${clash.name} de ${clash.producto.name}.`);
}

// Categoría por nombre: si no existe se crea (el formulario deja escribir una nueva).
async function categoryIdFor(db: Db, categoriaId: number | null, name: string): Promise<number> {
  if (categoriaId) return categoriaId;
  const existing = await db.categoria.findUnique({ where: { name } });
  return (existing ?? await db.categoria.create({ data: { name } })).id;
}

// Deja activas exactamente las presentaciones indicadas. Las quitadas se desactivan (las ventas pasadas
// las siguen referenciando) y una con el nombre de otra desactivada la reactiva.
async function syncSaleUnits(tx: Tx, productId: number, units: SaleUnitData[] | undefined, productCode: string) {
  if (units === undefined) return;
  assertUnitCodesDiffer(units, productCode);
  const existing = await tx.productUnit.findMany({ where: { productoId: productId } });
  const keep = new Set<number>();
  for (const unit of units) {
    const match = existing.find(e => e.id === unit.id) ?? existing.find(e => e.name.toLowerCase() === unit.name.toLowerCase());
    const data = {
      name: unit.name, factor: unit.factor, price: unit.price, wholesalePrice: unit.wholesalePrice,
      code: unit.code, allowsFractions: unit.allowsFractions, active: true,
    };
    if (match) {
      keep.add(match.id);
      await tx.productUnit.update({ where: { id: match.id }, data });
    } else {
      keep.add((await tx.productUnit.create({ data: { ...data, productoId: productId } })).id);
    }
  }
  await tx.productUnit.updateMany({
    where: { productoId: productId, id: { notIn: [...keep] }, active: true },
    data: { active: false, code: null },
  });
}

// El stock inicial entra a la sucursal del usuario (o a la que indique el administrador), con su kardex.
export async function createProduct(client: Client, input: z.infer<typeof CreateProductBody>, user: SessionUser) {
  const branchId: number = await resolveBranchId(client, user, input.branchId);
  const { code, name, unit, category, allowsFractions, stock, price, saleUnits } = input;
  const minStock = input.minStock ?? DEFAULT_MIN_STOCK;
  // Al crear se valida siempre: el paquete completa sus valores por defecto aunque no vengan datos.
  const industryData = parseProductData(input.industryData ?? {}) ?? {};
  await assertUnitCodesFree(client, saleUnits);
  await assertProductCodeFree(client, code);
  const categoriaId = await categoryIdFor(client, input.categoriaId, category);

  return client.$transaction(async (tx) => {
    const product = await tx.producto.create({
      data: { code, name, unit, allowsFractions, wholesalePrice: input.wholesalePrice, stock, minStock, price, category, categoriaId, industryData },
    });
    await tx.branchStock.create({ data: { branchId, productoId: product.id, stock } });
    await syncSaleUnits(tx, product.id, saleUnits, product.code);
    if (stock > 0) {
      await tx.movimientoKardex.create({
        data: { productoId: product.id, type: 'ENTRADA', qty: stock, stockAfter: stock, ref: 'Stock Inicial al Registrar', usuarioId: user.id, branchId },
      });
    }
    return product;
  });
}

// Edita los datos del producto; el stock no se toca aquí (se ajusta con un movimiento de kardex).
export async function updateProduct(client: Client, id: number, input: z.infer<typeof UpdateProductBody>, user: SessionUser) {
  const { code, name, unit, category, price, minStock, saleUnits } = input;
  const categoriaId = await categoryIdFor(client, input.categoriaId, category);
  const industryData = parseProductData(input.industryData);
  await assertUnitCodesFree(client, saleUnits, id);
  await assertProductCodeFree(client, code, id);

  const current = await client.producto.findUnique({
    where: { id },
    select: { code: true, name: true, price: true, wholesalePrice: true, branchStocks: BRANCH_STOCK_SELECT },
  });
  if (!current) throw new ProductError('Producto no encontrado.', 404);
  if (input.allowsFractions === false && hasDecimalStock(branchStocksOf(current.branchStocks))) {
    throw new ProductError('El stock actual tiene decimales: ajústelo en Kardex antes de venderlo solo por unidades.');
  }

  return client.$transaction(async (tx) => {
    const product = await tx.producto.update({
      where: { id },
      data: {
        code, name, unit, price, category, categoriaId, minStock, industryData,
        allowsFractions: input.allowsFractions,
        wholesalePrice: input.wholesalePrice,
      },
      select: {
        id: true, code: true, name: true, unit: true, allowsFractions: true, wholesalePrice: true,
        stock: true, minStock: true, price: true, category: true, categoriaId: true, industryData: true,
      },
    });
    await syncSaleUnits(tx, id, saleUnits, product.code);

    const changes = changedFields(current, product, ['price', 'wholesalePrice']) as
      Record<'price' | 'wholesalePrice', { before: unknown; after: unknown } | undefined> | null;
    if (changes) {
      const describe = (label: string, change: { before: unknown; after: unknown }) =>
        `${label} S/ ${change.before ?? '—'} → S/ ${change.after ?? '—'}`;
      await recordAudit(tx, {
        action: 'PRICE_CHANGED',
        entity: 'Producto',
        entityId: id,
        summary: `${product.code} ${product.name}: ` + [
          changes.price && describe('precio', changes.price),
          changes.wholesalePrice && describe('mayorista', changes.wholesalePrice),
        ].filter(Boolean).join(', '),
        details: changes,
        user,
      });
    }
    return product;
  });
}

// Todo o nada: si una fila tiene problemas no se guarda ninguna y se devuelven los errores por fila.
// A los productos que ya existen nunca se les cambia el stock (eso se hace con un movimiento).
export async function importProducts(client: Client, input: z.infer<typeof ProductImportBody>, user: SessionUser) {
  const { rows, onExisting } = input;
  const branchId: number = await resolveBranchId(client, user, input.branchId);

  const { valid, errors } = checkImportRows(rows, parseProductImportRow, r => r.code,
    (r, first) => `El código ${r.code} se repite en la fila ${first}.`);

  const codes = valid.map(r => r.code);
  const [existing, unitClashes] = await Promise.all([
    client.producto.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, name: true, price: true, wholesalePrice: true, active: true, branchStocks: BRANCH_STOCK_SELECT },
    }),
    client.productUnit.findMany({ where: { code: { in: codes } }, select: { code: true, name: true } }),
  ]);
  const byCode = new Map(existing.map(p => [p.code, p]));
  const clashCodes = new Map(unitClashes.map(u => [u.code, u.name]));
  for (const row of valid) {
    if (clashCodes.has(row.code)) errors.push({ index: row.index, error: `El código ya es de la presentación ${clashCodes.get(row.code)} de otro producto.` });
    const current = byCode.get(row.code);
    if (current && onExisting === 'update' && !row.allowsFractions && hasDecimalStock(branchStocksOf(current.branchStocks))) {
      errors.push({ index: row.index, error: 'El stock actual tiene decimales: no se puede pasar a venta solo por unidades.' });
    }
  }
  if (errors.length > 0) {
    throw new ProductError('Hay filas con problemas: corríjalas antes de importar.', 400, null, { rows: errors.sort((a, b) => a.index - b.index) });
  }

  return client.$transaction(async (tx) => {
    const summary = { created: 0, updated: 0, skipped: 0, categoriesCreated: 0 };
    const categoryIds = new Map<string, number>();
    const categoryFor = async (name: string) => {
      const known = categoryIds.get(name);
      if (known) return known;
      let category = await tx.categoria.findUnique({ where: { name }, select: { id: true } });
      if (!category) {
        category = await tx.categoria.create({ data: { name }, select: { id: true } });
        summary.categoriesCreated++;
      }
      categoryIds.set(name, category.id);
      return category.id;
    };

    for (const row of valid) {
      const current = byCode.get(row.code);
      if (current && onExisting === 'skip') { summary.skipped++; continue; }
      const data = {
        name: row.name, unit: row.unit, allowsFractions: row.allowsFractions, price: row.price,
        wholesalePrice: row.wholesalePrice, minStock: row.minStock, category: row.category, categoriaId: await categoryFor(row.category),
      };

      if (current) {
        await tx.producto.update({ where: { id: current.id }, data: { ...data, active: true } });
        const changes = changedFields(current, row, ['price', 'wholesalePrice']);
        if (changes) {
          await recordAudit(tx, {
            action: 'PRICE_CHANGED', entity: 'Producto', entityId: current.id,
            summary: `${row.code} ${row.name}: precios cambiados por importación`, details: changes, user,
          });
        }
        summary.updated++;
        continue;
      }

      const product = await tx.producto.create({ data: { ...data, code: row.code, stock: row.stock } });
      await tx.branchStock.create({ data: { branchId, productoId: product.id, stock: row.stock } });
      if (row.stock > 0) {
        await tx.movimientoKardex.create({
          data: { productoId: product.id, type: 'ENTRADA', qty: row.stock, stockAfter: row.stock, ref: 'Stock inicial (importación)', usuarioId: user.id, branchId },
        });
      }
      summary.created++;
    }
    return summary;
  }, { timeout: 120000 });
}

// Primero en la base; si no está, en OpenFoodFacts (solo para sugerir el nombre al registrarlo).
export async function findByBarcode(client: Client, rawCode: string, user: SessionUser) {
  const code = rawCode.trim();
  const local = await client.producto.findUnique({
    where: { code },
    select: {
      id: true, code: true, name: true, unit: true, allowsFractions: true, stock: true, reserved: true, price: true, category: true,
      branchStocks: BRANCH_STOCK_SELECT,
    },
  });
  if (local) return { foundInDb: true as const, product: withBranchStock(local, user.branchId) };

  const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`);
  const data = await response.json() as { status?: number; product?: { product_name?: string } };
  if (data.status === 1 && data.product?.product_name) return { foundInDb: false as const, name: data.product.product_name };
  throw new ProductError('Producto no encontrado.', 404);
}
