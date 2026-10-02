// Rutas HTTP de proveedores (/api/proveedores) y compras (/api/compras).
import express, { type Request, type Response } from 'express';
import { AppError, errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../db.ts';
import { parseInput } from '../../lib/validation.ts';
import { PurchaseError, createSupplier, listPurchases, listSuppliers, registerPurchase } from './purchasing.ts';
import type { Sendable } from '@ferresys/contracts/common';
import { PurchaseBody, SupplierBody, type Purchase, type PurchaseSaved, type Supplier } from '@ferresys/contracts/purchasing';

type Handler = (req: Request, res: Response) => Promise<unknown>;

// Los errores de negocio salen con su mensaje; los demás, con uno genérico (el detalle queda en el registro).
const handle = (failure: string, fn: Handler, duplicate?: string) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
    if ((error as { code?: string }).code === 'P2002' && duplicate) return res.status(400).json({ error: duplicate });
    console.error(`[compras] ${failure}`, error);
    res.status(500).json({ error: failure });
  }
};

const purchaseError = (message: string) => new PurchaseError(message);

export const supplierRoutes = express.Router();

supplierRoutes.get('/', handle('Error al listar proveedores.', async (req, res) => {
  res.json(await listSuppliers(prisma) satisfies Sendable<Supplier[]>);
}));

supplierRoutes.post('/', handle('Error al registrar proveedor.', async (req, res) => {
  res.status(201).json(await createSupplier(prisma, parseInput(SupplierBody, req.body, purchaseError)) satisfies Sendable<Supplier>);
}, 'El proveedor con este RUC ya existe.'));

export const purchaseRoutes = express.Router();

purchaseRoutes.get('/', handle('Error al listar compras.', async (req, res) => {
  res.json(await listPurchases(prisma) satisfies Sendable<Purchase[]>);
}));

// POST /api/compras { proveedorId, numDoc, items: [{ id, qty, cost }], branchId? }: suma stock y kardex.
purchaseRoutes.post('/', handle('Error al registrar compra.', async (req, res) => {
  const input = parseInput(PurchaseBody, req.body, purchaseError);
  res.status(201).json({ success: true, compra: await registerPurchase(prisma, input, req.user) } satisfies Sendable<PurchaseSaved>);
}));
