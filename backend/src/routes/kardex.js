import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/kardex
router.get('/', async (req, res) => {
  try {
    const { productCode } = req.query;

    const where = productCode ? { producto: { code: productCode } } : {};

    const records = await prisma.movimientoKardex.findMany({
      where,
      select: {
        id: true,
        type: true,
        qty: true,
        stockAfter: true,
        ref: true,
        createdAt: true,
        producto: {
          select: {
            code: true,
            name: true,
          }
        }
      },
      orderBy: { id: 'desc' }
    });

    const formatted = records.map(r => ({
      id: r.id,
      date: new Date(r.createdAt).toLocaleString('es-PE'),
      code: r.producto.code,
      name: r.producto.name,
      type: r.type,
      qty: r.qty,
      stockAfter: r.stockAfter,
      ref: r.ref,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener movimientos de Kardex.' });
  }
});

// POST /api/kardex (Movimiento manual)
router.post('/', async (req, res) => {
  try {
    const { productoId, type, qty, ref } = req.body;
    const qtyNum = parseInt(qty);

    if (!productoId || !type || isNaN(qtyNum) || qtyNum <= 0) {
      return res.status(400).json({ error: 'Parámetros inválidos.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const prod = await tx.producto.findUnique({ where: { id: parseInt(productoId) } });
      if (!prod) throw new Error('Producto no encontrado.');

      if (type === 'SALIDA' && qtyNum > prod.stock) {
        throw new Error(`Stock insuficiente. Disponible: ${prod.stock}`);
      }

      const newStock = type === 'ENTRADA' ? prod.stock + qtyNum : prod.stock - qtyNum;

      // Actualizar stock del producto
      await tx.producto.update({
        where: { id: prod.id },
        data: { stock: newStock }
      });

      // Crear registro en Kardex
      const km = await tx.movimientoKardex.create({
        data: {
          productoId: prod.id,
          type: type === 'ENTRADA' ? 'ENTRADA' : 'SALIDA',
          qty: qtyNum,
          stockAfter: newStock,
          ref: ref ? ref.trim() : 'Movimiento Manual',
        }
      });

      return { km, newStock };
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al procesar movimiento de Kardex.' });
  }
});

export default router;
