import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

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
        stock: true,
        price: true,
      },
      orderBy: { name: 'asc' }
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar productos.' });
  }
});

// POST /api/productos
router.post('/', async (req, res) => {
  try {
    const { code, name, unit, stock, price } = req.body;
    if (!code || !name || isNaN(stock) || isNaN(price)) {
      return res.status(400).json({ error: 'Completa todos los campos obligatorios.' });
    }

    const stockNum = parseInt(stock);
    const priceNum = parseFloat(price);

    // Operación atómica en caso de registrar stock inicial en Kardex
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.producto.create({
        data: {
          code: code.trim(),
          name: name.trim(),
          unit: unit || 'Unidad',
          stock: stockNum,
          price: priceNum,
        }
      });

      if (stockNum > 0) {
        await tx.movimientoKardex.create({
          data: {
            productoId: p.id,
            type: 'ENTRADA',
            qty: stockNum,
            stockAfter: stockNum,
            ref: 'Stock Inicial al Registrar',
          }
        });
      }

      return p;
    });

    res.status(201).json(product);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Ya existe un producto registrado con este código.' });
    }
    res.status(500).json({ error: 'Error al registrar producto.' });
  }
});

// GET /api/productos/barcode/:code (Proxy a OpenFoodFacts o DB)
router.get('/barcode/:code', async (req, res) => {
  try {
    const barcode = req.params.code.trim();
    // 1. Buscar primero en base de datos local
    const local = await prisma.producto.findUnique({
      where: { code: barcode },
      select: { id: true, code: true, name: true, unit: true, stock: true, price: true }
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
