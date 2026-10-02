// Rutas HTTP de inventario: /api/kardex y /api/transferencias.
import express, { type Request, type Response } from 'express';
import { z } from '@ferresys/contracts/zod';
import { AppError, errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../../db.ts';
import { optionalId, parseInput } from '../../../lib/validation.ts';
import { StockError, TransferError } from '../domain/inventory.ts';
import { listMovements, recordManualMovement } from '../application/kardex.ts';
import { createTransfer, listTransfers } from '../application/transfers.ts';
import type { Sendable } from '@ferresys/contracts/common';
import {
  ManualMovementBody, TransferBody, type KardexResponse, type ManualMovementSaved, type Transfer,
} from '@ferresys/contracts/inventory';

type Handler = (req: Request, res: Response) => Promise<unknown>;

// Los errores de negocio (stock, transferencia, sucursal) salen con su código; el resto es un 500.
const handle = (context: string, fn: Handler) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
    console.error(`[inventario] ${context}:`, error);
    res.status(500).json({ error: `No se pudo ${context}.` });
  }
};

// ---------- Kardex ----------

const MovementQuery = z.object({
  branchId: optionalId('Sucursal no válida.'),
  productCode: z.string().trim().optional(),
  // Otro tipo cualquiera = sin filtro, como antes.
  type: z.enum(['ENTRADA', 'SALIDA']).optional().catch(undefined),
  period: z.string().default('month'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const kardexRoutes = express.Router();

// GET /api/kardex?productCode=&type=ENTRADA|SALIDA&period=today|week|month|all|custom&startDate=&endDate=&branchId=
kardexRoutes.get('/', handle('obtener los movimientos de kardex', async (req, res) => {
  res.json(await listMovements(prisma, parseInput(MovementQuery, req.query, m => new StockError(m, 400))) satisfies Sendable<KardexResponse>);
}));

// POST /api/kardex { productoId, type, qty, ref, branchId? }: ajuste manual (entrada, merma, conteo).
kardexRoutes.post('/', handle('registrar el movimiento', async (req, res) => {
  const input = parseInput(ManualMovementBody, req.body, m => new StockError(m, 400));
  res.status(201).json(await recordManualMovement(prisma, input, req.user) satisfies Sendable<ManualMovementSaved>);
}));

// ---------- Transferencias ----------

const TransferQuery = z.object({ branchId: optionalId('Sucursal no válida.') });

export const transferRoutes = express.Router();

// GET /api/transferencias?branchId=
transferRoutes.get('/', handle('listar las transferencias', async (req, res) => {
  res.json(await listTransfers(prisma, parseInput(TransferQuery, req.query, m => new TransferError(m))) satisfies Sendable<Transfer[]>);
}));

// POST /api/transferencias { fromBranchId?, toBranchId, items: [{ id, qty }], notes }
transferRoutes.post('/', handle('registrar la transferencia', async (req, res) => {
  const input = parseInput(TransferBody, req.body, m => new TransferError(m));
  res.status(201).json(await createTransfer(prisma, input, req.user) satisfies Sendable<Transfer>);
}));
