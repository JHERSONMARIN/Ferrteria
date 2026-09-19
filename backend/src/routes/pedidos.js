import express from 'express';
import { prisma } from '../db.js';
import { allowModules } from '../middleware/authorize.js';
import { responderErrorVenta } from '../services/ventas.js';
import {
  createOrder, payOrder, dispatchOrder, cancelOrder, listOrders, getOrder,
} from '../services/saleOrders.js';

const router = express.Router();

const LISTABLE_STATUSES = ['PENDING_PAYMENT', 'PAID'];

const parseId = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Número de pedido no válido.' });
    return null;
  }
  return id;
};

const handle = (action) => async (req, res) => {
  try {
    await action(req, res);
  } catch (error) {
    responderErrorVenta(res, error, 'pedidos.js');
  }
};

// GET /api/pedidos?status=PENDING_PAYMENT|PAID  (cola de caja o de despacho)
router.get('/', allowModules({ default: ['caja', 'despacho', 'pos'] }), handle(async (req, res) => {
  const status = req.query.status || 'PENDING_PAYMENT';
  if (!LISTABLE_STATUSES.includes(status)) return res.status(400).json({ error: 'Estado no válido.' });
  res.json(await listOrders(prisma, status, req.user));
}));

// GET /api/pedidos/:id
router.get('/:id', allowModules({ default: ['caja', 'despacho', 'pos'] }), handle(async (req, res) => {
  const id = parseId(req, res);
  if (id !== null) res.json(await getOrder(prisma, id));
}));

// POST /api/pedidos  (el vendedor envía el pedido a caja)
router.post('/', allowModules({ default: ['pos'] }), handle(async (req, res) => {
  res.status(201).json({ success: true, pedido: await createOrder(prisma, req.body, req.user) });
}));

// POST /api/pedidos/:id/cobrar
router.post('/:id/cobrar', allowModules({ default: ['caja'] }), handle(async (req, res) => {
  const id = parseId(req, res);
  if (id !== null) res.json({ success: true, pedido: await payOrder(prisma, id, req.body, req.user) });
}));

// POST /api/pedidos/:id/despachar
// Quién despacha lo decide la sucursal (config/dispatch.js); aquí solo se exige alguno de esos módulos.
router.post('/:id/despachar', allowModules({ default: ['despacho', 'pos', 'caja'] }), handle(async (req, res) => {
  const id = parseId(req, res);
  if (id !== null) res.json({ success: true, pedido: await dispatchOrder(prisma, id, req.user) });
}));

// POST /api/pedidos/:id/anular
router.post('/:id/anular', allowModules({ default: ['caja', 'pos'] }), handle(async (req, res) => {
  const id = parseId(req, res);
  if (id !== null) res.json({ success: true, pedido: await cancelOrder(prisma, id, req.user, req.body?.reason) });
}));

export default router;
