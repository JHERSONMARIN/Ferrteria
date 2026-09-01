import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/compras
router.get('/', async (req, res) => {
  try {
    const list = await prisma.compra.findMany({
      select: {
        id: true,
        numDoc: true,
        total: true,
        createdAt: true,
        proveedor: {
          select: { name: true, ruc: true }
        },
        detalles: {
          select: {
            quantity: true,
            unitPrice: true,
            subtotal: true,
            producto: { select: { name: true, code: true } }
          }
        }
      },
      orderBy: { id: 'desc' }
    });

    const formatted = list.map(c => ({
      id: c.id,
      numDoc: c.numDoc,
      provider: c.proveedor.name,
      providerRuc: c.proveedor.ruc,
      total: c.total,
      date: new Date(c.createdAt).toLocaleString('es-PE'),
      detalles: c.detalles,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar compras.' });
  }
});

// POST /api/compras (Registrar Compra a Proveedor -> Aumenta Stock y Kardex ENTRADA)
router.post('/', async (req, res) => {
  try {
    const { proveedorId, numDoc, items } = req.body;

    if (!proveedorId || !numDoc || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Proveedor, número de documento y al menos un producto requeridos.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      let totalCompra = 0;
      for (const item of items) {
        totalCompra += (parseFloat(item.cost) || 0) * (parseInt(item.qty) || 0);
      }

      const compra = await tx.compra.create({
        data: {
          proveedorId: parseInt(proveedorId),
          numDoc: numDoc.trim(),
          total: totalCompra,
        }
      });

      for (const item of items) {
        const prodId = parseInt(item.id);
        const qtyNum = parseInt(item.qty);
        const costNum = parseFloat(item.cost);

        await tx.detalleCompra.create({
          data: {
            compraId: compra.id,
            productoId: prodId,
            quantity: qtyNum,
            unitPrice: costNum,
            subtotal: qtyNum * costNum,
          }
        });

        // Incrementar Stock en Almacén
        const updatedProd = await tx.producto.update({
          where: { id: prodId },
          data: { stock: { increment: qtyNum } }
        });

        // Registrar ENTRADA en Kardex
        await tx.movimientoKardex.create({
          data: {
            productoId: prodId,
            type: 'ENTRADA',
            qty: qtyNum,
            stockAfter: updatedProd.stock,
            ref: `Compra a Proveedor (Doc: ${numDoc.trim()})`,
          }
        });
      }

      return compra;
    });

    res.status(201).json({ success: true, compra: result });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al registrar compra.' });
  }
});

export default router;
