import express from 'express';
import { prisma } from '../db.js';
import { recordAudit } from '../services/audit.js';
import { requireFeature, respondIfLicenseError } from '../services/license.js';

const router = express.Router();

// GET /api/clientes
router.get('/', async (req, res) => {
  try {
    const clients = await prisma.cliente.findMany({
      select: {
        id: true,
        type: true,
        doc: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        maxCredit: true,
        priceList: true,
        creditoCliente: {
          select: { debtTotal: true }
        }
      },
      orderBy: { id: 'desc' }
    });

    const formatted = clients.map(c => {
      const debt = c.creditoCliente ? c.creditoCliente.debtTotal : 0;
      const maxCred = c.maxCredit || 1000.0;
      return {
        ...c,
        maxCredit: maxCred,
        currentDebt: debt,
        availableCredit: Math.max(0, maxCred - debt),
      };
    });

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener clientes.' });
  }
});

// POST /api/clientes
router.post('/', async (req, res) => {
  try {
    const { type, doc, name, phone, email, address, maxCredit, priceList } = req.body;
    if (!doc || !name) {
      return res.status(400).json({ error: 'El documento y nombre son requeridos.' });
    }

    const created = await prisma.cliente.create({
      data: {
        type: type === 'Empresa' ? 'EMPRESA' : 'NATURAL',
        doc: doc.trim(),
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        email: email ? email.trim() : null,
        address: address ? address.trim() : null,
        maxCredit: parseFloat(maxCredit) || 1000.0,
        priceList: priceList === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL',
      }
    });

    res.status(201).json(created);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Un cliente con este documento ya está registrado.' });
    }
    res.status(500).json({ error: 'Error al registrar cliente.' });
  }
});

// PUT /api/clientes/:id/max-credit
router.put('/:id/max-credit', async (req, res) => {
  try {
    const cId = parseInt(req.params.id);
    const { maxCredit } = req.body;
    const val = parseFloat(maxCredit);

    if (isNaN(val) || val < 0) {
      return res.status(400).json({ error: 'Monto de crédito máximo no válido.' });
    }

    const current = await prisma.cliente.findUnique({ where: { id: cId }, select: { name: true, maxCredit: true } });
    if (!current) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const updated = await prisma.$transaction(async (tx) => {
      const client = await tx.cliente.update({
        where: { id: cId },
        data: { maxCredit: val }
      });

      // Sincronizar en CreditoCliente si existe
      await tx.creditoCliente.updateMany({
        where: { clienteId: cId },
        data: { maxCredit: val }
      });

      if (current.maxCredit !== val) {
        await recordAudit(tx, {
          action: 'CREDIT_LIMIT_CHANGED',
          entity: 'Cliente',
          entityId: cId,
          summary: `${current.name}: límite de crédito S/ ${Number(current.maxCredit ?? 0).toFixed(2)} → S/ ${val.toFixed(2)}`,
          details: { maxCredit: { before: current.maxCredit, after: val } },
          user: req.user,
        });
      }
      return client;
    });

    res.json({ success: true, client: updated });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar límite de crédito.' });
  }
});

// PUT /api/clientes/:id/price-list  { priceList: 'RETAIL' | 'WHOLESALE' }
router.put('/:id/price-list', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { priceList } = req.body;
    if (Number.isNaN(id) || !['RETAIL', 'WHOLESALE'].includes(priceList)) {
      return res.status(400).json({ error: 'Lista de precios no válida.' });
    }
    const current = await prisma.cliente.findUnique({ where: { id }, select: { name: true, priceList: true } });
    if (!current) return res.status(404).json({ error: 'Cliente no encontrado.' });

    if (priceList === 'WHOLESALE') requireFeature('wholesale');
    const LABELS = { RETAIL: 'minorista', WHOLESALE: 'mayorista' };
    const updated = await prisma.$transaction(async (tx) => {
      const client = await tx.cliente.update({ where: { id }, data: { priceList }, select: { id: true, priceList: true } });
      if (current.priceList !== priceList) {
        await recordAudit(tx, {
          action: 'PRICE_LIST_CHANGED',
          entity: 'Cliente',
          entityId: id,
          summary: `${current.name}: lista ${LABELS[current.priceList]} → ${LABELS[priceList]}`,
          details: { priceList: { before: current.priceList, after: priceList } },
          user: req.user,
        });
      }
      return client;
    });
    res.json({ success: true, client: updated });
  } catch (error) {
    if (respondIfLicenseError(res, error)) return;
    if (error.code === 'P2025') return res.status(404).json({ error: 'Cliente no encontrado.' });
    console.error('[clientes.js] Error al cambiar la lista de precios:', error);
    res.status(500).json({ error: 'No se pudo cambiar la lista de precios.' });
  }
});

export default router;
