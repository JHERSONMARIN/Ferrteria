import express from 'express';
import { prisma } from '../db.js';
import {
  DeliveryError, listDeliveries, assignCourier, markDeparted, markDelivered, cancelDelivery,
  scheduleDeliveryForExistingSale, findSaleForDelivery,
} from '../services/deliveries.js';

const router = express.Router();

const handle = (action) => async (req, res) => {
  try {
    await action(req, res);
  } catch (error) {
    if (error instanceof DeliveryError) return res.status(error.status).json({ error: error.message });
    console.error('[entregas.js] Error:', error);
    res.status(500).json({ error: 'No se pudo completar la operación de entrega.' });
  }
};

const deliveryId = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Entrega no válida.' });
    return null;
  }
  return id;
};

// GET /api/entregas?estado=activas|finalizadas&mias=1
router.get('/', handle(async (req, res) => {
  res.json(await listDeliveries(prisma, {
    finished: req.query.estado === 'finalizadas',
    onlyUserId: req.query.mias === '1' ? req.user.id : null,
  }));
}));

// GET /api/entregas/venta/:numDoc  (vista previa para programar el envío de una venta ya cobrada)
router.get('/venta/:numDoc', handle(async (req, res) => {
  res.json(await findSaleForDelivery(prisma, req.params.numDoc));
}));

// POST /api/entregas  { numDoc, address, contactName, contactPhone, notes }
router.post('/', handle(async (req, res) => {
  const { numDoc, ...delivery } = req.body;
  res.status(201).json({ success: true, entrega: await scheduleDeliveryForExistingSale(prisma, numDoc, delivery) });
}));

// PATCH /api/entregas/:id/repartidor  { repartidorId | null }
router.patch('/:id/repartidor', handle(async (req, res) => {
  const id = deliveryId(req, res);
  if (id === null) return;
  const courierId = req.body.repartidorId ? parseInt(req.body.repartidorId, 10) : null;
  res.json(await assignCourier(prisma, id, courierId));
}));

// POST /api/entregas/:id/salir | /entregar | /cancelar
router.post('/:id/salir', handle(async (req, res) => {
  const id = deliveryId(req, res);
  if (id !== null) res.json(await markDeparted(prisma, id, req.user));
}));

router.post('/:id/entregar', handle(async (req, res) => {
  const id = deliveryId(req, res);
  if (id !== null) res.json(await markDelivered(prisma, id, req.user));
}));

router.post('/:id/cancelar', handle(async (req, res) => {
  const id = deliveryId(req, res);
  if (id !== null) res.json(await cancelDelivery(prisma, id, req.user, req.body?.reason));
}));

export default router;
