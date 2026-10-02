// Rutas HTTP de envíos (/api/entregas).
import express, { type Request, type Response } from 'express';
import { z } from '@ferresys/contracts/zod';
import { errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../../db.ts';
import { id, optionalId, parseInput } from '../../../lib/validation.ts';
import { DeliveryError } from '../domain/delivery.ts';
import * as deliveries from '../application/deliveries.ts';
import type { Sendable } from '@ferresys/contracts/common';
import type { Delivery, DeliveryScheduled, SaleForDelivery } from '@ferresys/contracts/deliveries';

const router = express.Router();

type Handler = (req: Request, res: Response) => Promise<unknown>;

const handle = (fn: Handler) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof DeliveryError) return res.status(error.status).json(errorBody(error));
    console.error('[entregas] Error:', error);
    res.status(500).json({ error: 'No se pudo completar la operación de entrega.' });
  }
};

const deliveryError = (message: string) => new DeliveryError(message);
const Params = z.object({ id: id('Entrega no válida.') });
const paramId = (req: Request) => parseInput(Params, req.params, deliveryError).id;
const CourierBody = z.object({ repartidorId: optionalId('Repartidor no válido.') });
const CancelBody = z.object({ reason: z.string().optional() });

// GET /api/entregas?estado=activas|finalizadas
router.get('/', handle(async (req, res) => {
  res.json(await deliveries.listDeliveries(prisma, {
    finished: req.query.estado === 'finalizadas',
    ownUserId: req.user.role === 'REPARTIDOR' ? req.user.id : null,
    branchId: req.user.branchId,
  }) satisfies Sendable<Delivery[]>);
}));

// GET /api/entregas/venta/:numDoc  (vista previa para programar el envío de una venta ya cobrada)
router.get('/venta/:numDoc', handle(async (req, res) => {
  res.json(await deliveries.findSaleForDelivery(prisma, req.params.numDoc, req.user) satisfies Sendable<SaleForDelivery>);
}));

// POST /api/entregas  { numDoc, address, contactName, contactPhone, notes }
router.post('/', handle(async (req, res) => {
  const { numDoc, ...input } = (req.body ?? {}) as Record<string, unknown>;
  res.status(201).json({ success: true, entrega: await deliveries.scheduleDeliveryForExistingSale(prisma, numDoc, input, req.user) } satisfies Sendable<DeliveryScheduled>);
}));

// PATCH /api/entregas/:id/repartidor  { repartidorId | null }
router.patch('/:id/repartidor', handle(async (req, res) => {
  const { repartidorId } = parseInput(CourierBody, req.body, deliveryError);
  res.json(await deliveries.assignCourier(prisma, paramId(req), repartidorId ?? null, req.user) satisfies Sendable<Delivery>);
}));

// POST /api/entregas/:id/salir | /entregar | /cancelar
router.post('/:id/salir', handle(async (req, res) => {
  res.json(await deliveries.markDeparted(prisma, paramId(req), req.user) satisfies Sendable<Delivery>);
}));

router.post('/:id/entregar', handle(async (req, res) => {
  res.json(await deliveries.markDelivered(prisma, paramId(req), req.user) satisfies Sendable<Delivery>);
}));

router.post('/:id/cancelar', handle(async (req, res) => {
  const { reason } = parseInput(CancelBody, req.body, deliveryError);
  res.json(await deliveries.cancelDelivery(prisma, paramId(req), req.user, reason) satisfies Sendable<Delivery>);
}));

export default router;
