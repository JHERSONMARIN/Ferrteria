import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/categorias
 * Retorna las categorías registradas con estadísticas calculadas:
 * - productCount: cantidad de productos activos
 * - totalStock: unidades totales en almacén
 * - inventoryValue: valor total monetario en soles (∑ stock * price)
 * - lowStockCount: productos con stock igual o inferior al mínimo
 */
router.get('/', async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true';
    const whereCondition = includeInactive ? {} : { active: true };

    const categories = await prisma.categoria.findMany({
      where: whereCondition,
      include: {
        productos: {
          where: { active: true },
          select: {
            id: true,
            stock: true,
            minStock: true,
            price: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const categoriesWithMetrics = categories.map((cat) => {
      const activeProducts = cat.productos || [];
      const productCount = activeProducts.length;
      const totalStock = activeProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
      const inventoryValue = activeProducts.reduce(
        (sum, p) => sum + ((p.stock || 0) * (p.price || 0)),
        0
      );
      const lowStockCount = activeProducts.filter(
        (p) => (p.stock || 0) <= (p.minStock ?? 10)
      ).length;

      return {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        icon: cat.icon || 'fa-tag',
        color: cat.color || 'orange',
        active: cat.active,
        createdAt: cat.createdAt,
        productCount,
        totalStock,
        inventoryValue: Number(inventoryValue.toFixed(2)),
        lowStockCount,
      };
    });

    res.json(categoriesWithMetrics);
  } catch (error) {
    console.error('[categories.js] Error al listar categorías:', error);
    res.status(500).json({ error: 'Error al obtener la lista de categorías.' });
  }
});

/**
 * POST /api/categorias
 * Crea una nueva categoría con validación de unicidad
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, icon, color } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres.' });
    }

    const newCategory = await prisma.categoria.create({
      data: {
        name: trimmedName,
        description: description ? description.trim() : null,
        icon: icon ? icon.trim() : 'fa-tag',
        color: color ? color.trim() : 'orange',
      },
    });

    res.status(201).json(newCategory);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Ya existe una categoría con este nombre.' });
    }
    console.error('[categories.js] Error al crear categoría:', error);
    res.status(500).json({ error: 'Error al registrar la categoría.' });
  }
});

/**
 * PUT /api/categorias/:id
 * Actualiza los datos de una categoría. Si se modifica el nombre, sincroniza
 * de manera atómica el campo de texto `category` en todos los productos asociados.
 */
router.put('/:id', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'ID de categoría no válido.' });
    }

    const { name, description, icon, color, active } = req.body;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'El nombre de la categoría no puede estar vacío.' });
      }
      if (name.trim().length < 2) {
        return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres.' });
      }
    }

    const existingCategory = await prisma.categoria.findUnique({
      where: { id: categoryId },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }

    const updatedCategory = await prisma.$transaction(async (tx) => {
      const updated = await tx.categoria.update({
        where: { id: categoryId },
        data: {
          name: name ? name.trim() : undefined,
          description: description !== undefined ? (description ? description.trim() : null) : undefined,
          icon: icon ? icon.trim() : undefined,
          color: color ? color.trim() : undefined,
          active: typeof active === 'boolean' ? active : undefined,
        },
      });

      // Si el nombre cambió, sincronizar productos asociados
      if (name && name.trim() !== existingCategory.name) {
        await tx.producto.updateMany({
          where: { categoriaId: categoryId },
          data: { category: name.trim() },
        });
      }

      return updated;
    });

    res.json(updatedCategory);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Ya existe otra categoría con este nombre.' });
    }
    console.error('[categories.js] Error al actualizar categoría:', error);
    res.status(500).json({ error: 'Error al actualizar la categoría.' });
  }
});

/**
 * DELETE /api/categorias/:id
 * Elimina una categoría de forma segura:
 * - Si tiene productos asociados y no se provee targetCategoryId, rechaza con advertencia.
 * - Si se provee targetCategoryId, reasigna los productos en una transacción antes de borrar.
 */
router.delete('/:id', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'ID de categoría no válido.' });
    }

    const targetCategoryId = req.query.targetCategoryId
      ? parseInt(req.query.targetCategoryId, 10)
      : null;

    const category = await prisma.categoria.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: { productos: true },
        },
      },
    });

    if (!category) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }

    const associatedCount = category._count.productos;

    if (associatedCount > 0 && !targetCategoryId) {
      return res.status(400).json({
        error: `No se puede eliminar: la categoría contiene ${associatedCount} producto(s). Seleccione una categoría de destino para reasignarlos.`,
        hasProducts: true,
        productCount: associatedCount,
      });
    }

    await prisma.$transaction(async (tx) => {
      if (associatedCount > 0 && targetCategoryId) {
        if (targetCategoryId === categoryId) {
          throw new Error('La categoría de destino no puede ser la misma que se desea eliminar.');
        }

        const targetCategory = await tx.categoria.findUnique({
          where: { id: targetCategoryId },
        });

        if (!targetCategory) {
          throw new Error('La categoría de destino especificada no existe.');
        }

        // Reasignar productos
        await tx.producto.updateMany({
          where: { categoriaId: categoryId },
          data: {
            categoriaId: targetCategoryId,
            category: targetCategory.name,
          },
        });
      }

      // Eliminar categoría
      await tx.categoria.delete({
        where: { id: categoryId },
      });
    });

    res.json({
      success: true,
      message: 'Categoría eliminada exitosamente.',
      reassignedCount: targetCategoryId ? associatedCount : 0,
    });
  } catch (error) {
    console.error('[categories.js] Error al eliminar categoría:', error);
    res.status(400).json({ error: error.message || 'Error al eliminar la categoría.' });
  }
});

export default router;
