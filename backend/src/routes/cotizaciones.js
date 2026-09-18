import express from 'express';
import { prisma } from '../db.js';
import { recordAudit } from '../services/audit.js';
import { procesarVenta, responderErrorVenta, normalizarCarrito, cargarProductosActivos, priceListFor, unitPriceFor, VentaError } from '../services/ventas.js';

const router = express.Router();

// GET /api/cotizaciones
router.get('/', async (req, res) => {
  try {
    const cotizaciones = await prisma.cotizacion.findMany({
      select: {
        id: true,
        numDoc: true,
        total: true,
        validDays: true,
        status: true,
        createdAt: true,
        cliente: { select: { id: true, name: true, doc: true, phone: true } },
        vendedor: { select: { name: true } },
        detalles: {
          select: {
            quantity: true,
            unitPrice: true,
            subtotal: true,
            producto: { select: { id: true, name: true, code: true, price: true, stock: true, reserved: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formatted = cotizaciones.map(c => ({
      id: c.id,
      numDoc: c.numDoc,
      total: c.total,
      validDays: c.validDays,
      status: c.status,
      date: new Date(c.createdAt).toLocaleString('es-PE'),
      customer: c.cliente ? c.cliente.name : 'Público General',
      customerDoc: c.cliente ? c.cliente.doc : '00000000',
      clienteId: c.clienteId,
      seller: c.vendedor ? c.vendedor.name : 'General',
      detalles: c.detalles,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar cotizaciones.' });
  }
});

// POST /api/cotizaciones (Generar nueva Cotización / Proforma)
router.post('/', async (req, res) => {
  try {
    const { clienteId, validDays } = req.body;
    const vendedorId = req.user.id;

    const items = normalizarCarrito(req.body.cart);
    const productos = await cargarProductosActivos(prisma, items);
    const priceList = await priceListFor(prisma, clienteId ? parseInt(clienteId, 10) : null);

    const detalles = items.map(item => {
      const unitPrice = unitPriceFor(productos.get(item.id), priceList);
      return {
        productoId: item.id,
        quantity: item.qty,
        unitPrice,
        subtotal: Math.round(unitPrice * item.qty * 100) / 100,
      };
    });
    const total = Math.round(detalles.reduce((sum, d) => sum + d.subtotal, 0) * 100) / 100;

    const ultima = await prisma.cotizacion.findFirst({ orderBy: { numDoc: 'desc' }, select: { numDoc: true } });
    const ultimoNumero = ultima ? parseInt(ultima.numDoc.replace('COT-', ''), 10) || 0 : 0;
    const numDoc = `COT-${String(ultimoNumero + 1).padStart(6, '0')}`;

    const cotizacion = await prisma.cotizacion.create({
      data: {
        numDoc,
        total,
        validDays: parseInt(validDays, 10) || 7,
        clienteId: clienteId ? parseInt(clienteId, 10) : null,
        vendedorId: vendedorId ? parseInt(vendedorId, 10) : null,
        detalles: { create: detalles },
      },
      include: {
        cliente: true,
        detalles: { include: { producto: true } }
      }
    });

    res.status(201).json({ success: true, cotizacion });
  } catch (error) {
    if (error instanceof VentaError) return res.status(error.status).json({ error: error.message });
    if (error.code === 'P2002') return res.status(409).json({ error: 'No se pudo generar el número de cotización. Intente nuevamente.' });
    console.error('[cotizaciones.js] Error al generar cotización:', error);
    res.status(500).json({ error: 'Error al generar la cotización.' });
  }
});

// POST /api/cotizaciones/:id/convertir (Convertir Cotización a Venta Real)
router.post('/:id/convertir', async (req, res) => {
  try {
    const cotId = parseInt(req.params.id, 10);
    if (isNaN(cotId)) return res.status(400).json({ error: 'ID de cotización no válido.' });

    const cot = await prisma.cotizacion.findUnique({
      where: { id: cotId },
      include: { detalles: { select: { productoId: true, quantity: true } } }
    });
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada.' });

    const { docType, payMethod, mixCash, mixDigital, payCode, vendedorId } = req.body;
    const usuarioCajaId = req.user.id;

    const venta = await procesarVenta(prisma, {
      docType,
      payMethod,
      mixCash,
      mixDigital,
      payCode,
      usuarioCajaId,
      vendedorId: vendedorId || cot.vendedorId,
      clienteId: cot.clienteId,
      cotizacionId: cot.id,
      cart: cot.detalles.map(d => ({ id: d.productoId, qty: d.quantity })),
    }, req.user);

    res.json({ success: true, venta });
  } catch (error) {
    responderErrorVenta(res, error, 'cotizaciones.js');
  }
});

// DELETE /api/cotizaciones/:id (Cancelar / eliminar lógicamente una cotización)
router.delete('/:id', async (req, res) => {
  try {
    const cotId = parseInt(req.params.id, 10);
    if (isNaN(cotId)) return res.status(400).json({ error: 'ID de cotización no válido.' });

    const cot = await prisma.cotizacion.findUnique({ where: { id: cotId } });
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada.' });

    if (cot.status === 'CONVERTIDO') {
      return res.status(400).json({ error: 'No se puede eliminar: esta cotización ya fue convertida a venta.' });
    }
    if (cot.status === 'CANCELADO') {
      return res.status(400).json({ error: 'Esta cotización ya se encuentra cancelada.' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const quote = await tx.cotizacion.update({
        where: { id: cotId },
        data: { status: 'CANCELADO' }
      });
      await recordAudit(tx, {
        action: 'QUOTE_CANCELLED',
        entity: 'Cotizacion',
        entityId: cotId,
        summary: `Cotización ${cot.numDoc} de S/ ${Number(cot.total).toFixed(2)} anulada`,
        details: { numDoc: cot.numDoc, total: cot.total },
        user: req.user,
      });
      return quote;
    });

    res.json({ success: true, message: 'Cotización eliminada (cancelada) exitosamente.', cotizacion: updated });
  } catch (error) {
    console.error('[cotizaciones.js] Error al eliminar cotización:', error);
    res.status(400).json({ error: error.message || 'Error al eliminar la cotización.' });
  }
});

export default router;
