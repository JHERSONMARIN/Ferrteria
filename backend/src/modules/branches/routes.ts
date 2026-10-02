// Rutas HTTP de sucursales (/api/sucursales). Listar puede cualquiera con sesión; crear y modificar, el
// administrador (lo decide server.js).
import express, { type Request, type Response } from 'express';
import { z } from '@ferresys/contracts/zod';
import { AppError, errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../db.ts';
import { id, parseInput } from '../../lib/validation.ts';
import { initializeDocumentSeries } from '../sales/index.ts';
import { BranchError, createBranch, listBranches, updateBranch } from './branches.ts';
import type { Sendable } from '@ferresys/contracts/common';
import { CreateBranchBody, UpdateBranchBody, type Branch } from '@ferresys/contracts/branches';

const router = express.Router();

const handle = (context: string, fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
    console.error(`[sucursales] ${context}:`, error);
    res.status(500).json({ error: `No se pudo ${context}.` });
  }
};

const Params = z.object({ id: id('Sucursal no válida.') });
const branchError = (message: string) => new BranchError(message);

// GET /api/sucursales (activas; ?todas=1 incluye las desactivadas, solo para el administrador)
router.get('/', handle('listar las sucursales', async (req, res) => {
  res.json(await listBranches(prisma, req.query.todas === '1' && req.user.role === 'ADMINISTRADOR') satisfies Sendable<Branch[]>);
}));

// POST /api/sucursales { name, address, saleFlowMode?, deliveriesEnabled? }
router.post('/', handle('crear la sucursal', async (req, res) => {
  const branch = await createBranch(prisma, parseInput(CreateBranchBody, req.body, branchError));
  // Cada sucursal emite con sus propias series (T002, B002, F002…).
  await initializeDocumentSeries(prisma);
  res.status(201).json(branch);
}));

// PUT /api/sucursales/:id { name?, address?, active?, saleFlowMode?, deliveriesEnabled?, dispatchRole? }
router.put('/:id', handle('actualizar la sucursal', async (req, res) => {
  const branchId = parseInput(Params, req.params, branchError).id;
  const branch = await updateBranch(prisma, branchId, parseInput(UpdateBranchBody, req.body, branchError), req.user);
  if (branch.active) await initializeDocumentSeries(prisma);
  res.json(branch);
}));

export default router;
