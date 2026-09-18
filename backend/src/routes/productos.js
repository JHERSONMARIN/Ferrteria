import express from 'express';
import { prisma } from '../db.js';
import { quantityProblem } from '../utils/quantities.js';

const router = express.Router();

// Precio mayorista opcional: vacío = sin precio mayorista (null); false = valor inválido.
function parseWholesalePrice(value) {
  if (value === undefined || value === null || value === '') return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : false;
}

// GET /api/productos
router.get('/', async (req, res) => {
  try {
    const products = await prisma.producto.findMany({
      where: { active: true },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        allowsFractions: true,
        stock: true,
        reserved: true,
        wholesalePrice: true,
        minStock: true,
        price: true,
        category: true,
      },
      orderBy: { name: 'asc' }
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar productos.' });
  }
});

// GET /api/productos/categorias
router.get('/categorias', async (req, res) => {
  try {
    const dbCategories = await prisma.categoria.findMany({
      where: { active: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    const distinctProductCategories = await prisma.producto.findMany({
      where: { active: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    const set = new Set([
      ...dbCategories.map(c => c.name),
      ...distinctProductCategories.map(p => p.category).filter(Boolean),
    ]);

    res.json(Array.from(set));
  } catch (error) {
    console.error('[productos.js] Error al listar categorías:', error);
    res.status(500).json({ error: 'Error al listar categorías.' });
  }
});

// POST /api/productos
router.post('/', async (req, res) => {
  try {
    const { code, name, unit, stock, price, category, categoriaId, minStock } = req.body;
    const usuarioId = req.user.id;
    if (!code || !name || isNaN(stock) || isNaN(price)) {
      return res.status(400).json({ error: 'Completa todos los campos obligatorios.' });
    }

    const allowsFractions = req.body.allowsFractions === true;
    const wholesale = parseWholesalePrice(req.body.wholesalePrice);
    if (wholesale === false) return res.status(400).json({ error: 'El precio mayorista debe ser mayor a 0.' });
    const stockNum = Number(stock);
    const priceNum = parseFloat(price);
    const minStockNum = minStock === undefined || minStock === '' ? 10 : Number(minStock);
    if (stockNum !== 0) {
      const problem = quantityProblem(stockNum, allowsFractions);
      if (problem) return res.status(400).json({ error: `El stock inicial ${problem}.` });
    }
    if (!Number.isFinite(minStockNum) || minStockNum < 0) {
      return res.status(400).json({ error: 'El stock mínimo no es válido.' });
    }
    const categoryName = category && category.trim() ? category.trim() : 'General';

    // Resolver Categoria relacional
    let resolvedCatId = categoriaId ? parseInt(categoriaId, 10) : null;
    if (!resolvedCatId && categoryName) {
      let catRecord = await prisma.categoria.findUnique({
        where: { name: categoryName },
      });
      if (!catRecord) {
        catRecord = await prisma.categoria.create({
          data: { name: categoryName },
        });
      }
      resolvedCatId = catRecord.id;
    }

    // Operación atómica para registrar producto y stock inicial en Kardex
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.producto.create({
        data: {
          code: code.trim(),
          name: name.trim(),
          unit: unit || 'Unidad',
          allowsFractions,
          wholesalePrice: wholesale,
          stock: stockNum,
          minStock: minStockNum,
          price: priceNum,
          category: categoryName,
          categoriaId: resolvedCatId,
        },
      });

      if (stockNum > 0) {
        await tx.movimientoKardex.create({
          data: {
            productoId: p.id,
            type: 'ENTRADA',
            qty: stockNum,
            stockAfter: stockNum,
            ref: 'Stock Inicial al Registrar',
            usuarioId: usuarioId ? parseInt(usuarioId, 10) : null,
          },
        });
      }

      return p;
    });

    res.status(201).json(product);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Ya existe un producto registrado con este código.' });
    }
    console.error('[productos.js] Error al registrar producto:', error);
    res.status(500).json({ error: 'Error al registrar producto.' });
  }
});

// PUT /api/productos/:id (Editar datos del producto; el stock se ajusta vía Kardex)
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { code, name, unit, price, category, categoriaId, minStock, allowsFractions } = req.body;

    if (!code || !code.trim() || !name || !name.trim()) {
      return res.status(400).json({ error: 'El código y el nombre son obligatorios.' });
    }
    if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      return res.status(400).json({ error: 'El precio debe ser un número mayor a 0.' });
    }

    const categoryName = category && category.trim() ? category.trim() : 'General';
    let resolvedCatId = categoriaId ? parseInt(categoriaId, 10) : null;

    if (!resolvedCatId && categoryName) {
      let catRecord = await prisma.categoria.findUnique({
        where: { name: categoryName },
      });
      if (!catRecord) {
        catRecord = await prisma.categoria.create({
          data: { name: categoryName },
        });
      }
      resolvedCatId = catRecord.id;
    }

    const wholesale = parseWholesalePrice(req.body.wholesalePrice);
    if (wholesale === false) return res.status(400).json({ error: 'El precio mayorista debe ser mayor a 0.' });

    // No se puede dejar de vender fraccionado si el stock actual tiene decimales.
    if (allowsFractions === false) {
      const current = await prisma.producto.findUnique({ where: { id }, select: { stock: true, reserved: true } });
      if (current && (!Number.isInteger(current.stock) || !Number.isInteger(current.reserved))) {
        return res.status(400).json({ error: 'El stock actual tiene decimales: ajústelo en Kardex antes de venderlo solo por unidades.' });
      }
    }

    const updated = await prisma.producto.update({
      where: { id },
      data: {
        code: code.trim(),
        name: name.trim(),
        unit: unit || 'Unidad',
        allowsFractions: typeof allowsFractions === 'boolean' ? allowsFractions : undefined,
        wholesalePrice: req.body.wholesalePrice === undefined ? undefined : wholesale,
        price: parseFloat(price),
        category: categoryName,
        categoriaId: resolvedCatId,
        minStock: minStock !== undefined && minStock !== '' && Number(minStock) >= 0 ? Number(minStock) : undefined,
      },
      select: {
        id: true, code: true, name: true, unit: true, allowsFractions: true, wholesalePrice: true,
        stock: true, minStock: true, price: true, category: true, categoriaId: true,
      },
    });

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Ya existe otro producto con este código.' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    console.error('[productos.js] Error al actualizar producto:', error);
    res.status(500).json({ error: 'Error al actualizar producto.' });
  }
});

// GET /api/productos/barcode/:code (Proxy a OpenFoodFacts o DB)
router.get('/barcode/:code', async (req, res) => {
  try {
    const barcode = req.params.code.trim();
    // 1. Buscar primero en base de datos local
    const local = await prisma.producto.findUnique({
      where: { code: barcode },
      select: { id: true, code: true, name: true, unit: true, allowsFractions: true, stock: true, reserved: true, price: true, category: true }
    });

    if (local) {
      return res.json({ foundInDb: true, product: local });
    }

    // 2. Si no está en DB local, buscar en API pública (OpenFoodFacts)
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();

    if (data.status === 1 && data.product && data.product.product_name) {
      return res.json({ foundInDb: false, name: data.product.product_name });
    }

    res.status(404).json({ error: 'Producto no encontrado.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar código de barras.' });
  }
});

export default router;
