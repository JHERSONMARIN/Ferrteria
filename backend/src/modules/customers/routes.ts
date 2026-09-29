// Rutas HTTP de clientes (/api/clientes) y créditos (/api/creditos).
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { AppError, errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../db.ts';
import { id, parseInput } from '../../lib/validation.ts';
import {
  CustomerError, createCustomer, listCustomers, listDebts, registerPayment, setCreditLimit, setPriceList, updateCustomer,
} from './customers.ts';
import { lookupDocument } from './documentLookup.ts';
import type { Sendable } from '@ferresys/contracts/common';
import type { Customer } from '@ferresys/contracts/customers';

type Handler = (req: Request, res: Response) => Promise<unknown>;

const handle = (failure: string, fn: Handler, duplicate?: string) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
    const code = (error as { code?: string }).code;
    if (code === 'P2002' && duplicate) return res.status(400).json({ error: duplicate });
    if (code === 'P2025') return res.status(404).json({ error: 'Cliente no encontrado.' });
    console.error(`[clientes] ${failure}`, error);
    res.status(500).json({ error: failure });
  }
};

const customerError = (message: string) => new CustomerError(message);
const Params = z.object({ id: id('Cliente no válido.') });
const customerId = (req: Request) => parseInput(Params, req.params, customerError).id;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const PriceListBody = z.object({ priceList: z.enum(['RETAIL', 'WHOLESALE'], { error: 'Lista de precios no válida.' }) });
const PaymentBody = z.object({
  clienteId: id('Cliente y monto válido requeridos.'),
  amount: z.coerce.number({ error: 'Cliente y monto válido requeridos.' }).positive({ error: 'Cliente y monto válido requeridos.' }),
});

// ---------- /api/clientes ----------

export const customerRoutes = express.Router();

customerRoutes.get('/', handle('Error al obtener clientes.', async (req, res) => {
  res.json(await listCustomers(prisma) satisfies Sendable<Customer[]>);
}));

// GET /api/clientes/consulta-doc/:doc  (datos de un DNI o RUC para registrarlo)
customerRoutes.get('/consulta-doc/:doc', handle('Error al consultar documento.', async (req, res) => {
  res.json(await lookupDocument(prisma, String(req.params.doc)));
}));

customerRoutes.post('/', handle('Error al registrar cliente.', async (req, res) => {
  res.status(201).json(await createCustomer(prisma, body(req)));
}, 'Un cliente con este documento ya está registrado.'));

// PUT /api/clientes/:id  { type, doc, name, phone, email, address }
customerRoutes.put('/:id', handle('No se pudo modificar el cliente.', async (req, res) => {
  res.json(await updateCustomer(prisma, customerId(req), body(req), req.user));
}, 'Otro cliente ya tiene ese documento.'));

// PUT /api/clientes/:id/max-credit  { maxCredit }
customerRoutes.put('/:id/max-credit', handle('Error al actualizar límite de crédito.', async (req, res) => {
  res.json({ success: true, client: await setCreditLimit(prisma, customerId(req), body(req).maxCredit, req.user) });
}));

// PUT /api/clientes/:id/price-list  { priceList: 'RETAIL' | 'WHOLESALE' }
customerRoutes.put('/:id/price-list', handle('No se pudo cambiar la lista de precios.', async (req, res) => {
  const { priceList } = parseInput(PriceListBody, req.body, customerError);
  res.json({ success: true, client: await setPriceList(prisma, customerId(req), priceList, req.user) });
}));

// ---------- /api/creditos ----------

export const creditRoutes = express.Router();

// GET /api/creditos: clientes con deuda y sus movimientos.
creditRoutes.get('/', handle('Error al obtener estado de créditos.', async (req, res) => {
  res.json(await listDebts(prisma));
}));

// POST /api/creditos/abono  { clienteId, amount }
creditRoutes.post('/abono', handle('Error al registrar abono.', async (req, res) => {
  const { clienteId, amount } = parseInput(PaymentBody, req.body, customerError);
  res.json(await registerPayment(prisma, clienteId, amount));
}));
