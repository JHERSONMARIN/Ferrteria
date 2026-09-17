import express from 'express';
import { PrismaClient } from '@prisma/client';
import { procesarVenta, responderErrorVenta } from '../services/ventas.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/ventas
router.get('/', async (req, res) => {
  try {
    const sales = await prisma.venta.findMany({
      select: {
        id: true,
        docType: true,
        numDoc: true,
        payMethod: true,
        mixCash: true,
        mixDigital: true,
        payCode: true,
        total: true,
        status: true,
        createdAt: true,
        cliente: { select: { name: true, doc: true, type: true } },
        vendedor: { select: { name: true, role: true } },
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

    const formatted = sales.map(s => ({
      id: s.id,
      time: new Date(s.createdAt).toLocaleString('es-PE'),
      doc: s.docType === 'FACTURA' ? 'Factura' : (s.docType === 'BOLETA' ? 'Boleta' : 'Nota de Venta'),
      numDoc: s.numDoc,
      customer: s.cliente ? s.cliente.name : 'Público General',
      customerDoc: s.cliente ? s.cliente.doc : '00000000',
      seller: s.vendedor ? s.vendedor.name : 'General',
      method: s.payMethod,
      payCode: s.payCode,
      total: s.total,
      detalles: s.detalles,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial de ventas.' });
  }
});

// POST /api/ventas (Venta atómica con Kardex, control de stock y límite de crédito)
router.post('/', async (req, res) => {
  try {
    const venta = await procesarVenta(prisma, req.body);
    res.status(201).json({ success: true, venta });
  } catch (error) {
    responderErrorVenta(res, error, 'ventas.js');
  }
});

export default router;
