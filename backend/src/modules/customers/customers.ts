// Clientes, su crédito (fiado) y sus abonos. Módulo simple: reglas y acceso a datos en un solo archivo.
import type { prisma } from '../../db.ts';
import { AppError } from '@ferresys/shared/errors';
import { changedFields, recordAudit } from '../audit/index.ts';
import { requireFeature } from '../licensing/index.ts';
import type { SessionUser } from '../../types/express.d.ts';
import type { z } from '@ferresys/contracts/zod';
import type { CreateCustomerBody, UpdateCustomerBody } from '@ferresys/contracts/customers';

type Client = typeof prisma;

export class CustomerError extends AppError {
  static override area = 'CLIENTE';
}

// Sin límite propio, un cliente puede fiar hasta S/ 1000 (la misma regla que al vender).
export const DEFAULT_CREDIT_LIMIT = 1000;
const PRICE_LIST_LABELS = { RETAIL: 'minorista', WHOLESALE: 'mayorista' } as const;
export type PriceList = keyof typeof PRICE_LIST_LABELS;

export const creditLimit = (...limits: (number | null | undefined)[]) => limits.find(l => l) || DEFAULT_CREDIT_LIMIT;
export const availableCredit = (limit: number, debt: number) => Math.max(0, limit - debt);
export const receiptNumber = (id: number) => `REC-${String(id).padStart(6, '0')}`;

const num = (value: unknown) => Number(value);

// ---------- Clientes ----------

export async function listCustomers(client: Client) {
  const customers = await client.cliente.findMany({
    select: {
      id: true, type: true, doc: true, name: true, phone: true, email: true, address: true, maxCredit: true, priceList: true,
      creditoCliente: { select: { debtTotal: true } },
    },
    orderBy: { id: 'desc' },
  });
  return customers.map(c => {
    const debt = c.creditoCliente ? num(c.creditoCliente.debtTotal) : 0;
    const limit = creditLimit(num(c.maxCredit));
    return { ...c, maxCredit: limit, currentDebt: debt, availableCredit: availableCredit(limit, debt) };
  });
}

export async function createCustomer(client: Client, input: z.infer<typeof CreateCustomerBody>) {
  return client.cliente.create({ data: { ...input, maxCredit: input.maxCredit ?? DEFAULT_CREDIT_LIMIT } });
}

// Datos del cliente. El crédito y la lista de precios se cambian por sus propias rutas (quedan auditados aparte).
export async function updateCustomer(client: Client, id: number, data: z.infer<typeof UpdateCustomerBody>, user: SessionUser) {
  const current = await client.cliente.findUnique({
    where: { id },
    select: { type: true, doc: true, name: true, phone: true, email: true, address: true },
  });
  if (!current) throw new CustomerError('Cliente no encontrado.', 404);

  const changes = changedFields(current, data, Object.keys(data));
  if (!changes) return { success: true };

  const updated = await client.$transaction(async (tx) => {
    const saved = await tx.cliente.update({ where: { id }, data });
    await recordAudit(tx, {
      action: 'CLIENT_UPDATED',
      entity: 'Cliente',
      entityId: id,
      summary: `${current.name}: se modificaron ${Object.keys(changes).join(', ')}`,
      details: changes,
      user,
    });
    return saved;
  });
  return { success: true, client: updated };
}

export async function setCreditLimit(client: Client, id: number, limit: number, user: SessionUser) {
  const current = await client.cliente.findUnique({ where: { id }, select: { name: true, maxCredit: true } });
  if (!current) throw new CustomerError('Cliente no encontrado.', 404);
  const before = current.maxCredit === null ? null : num(current.maxCredit);

  return client.$transaction(async (tx) => {
    const saved = await tx.cliente.update({ where: { id }, data: { maxCredit: limit } });
    // La cuenta de crédito guarda una copia del límite.
    await tx.creditoCliente.updateMany({ where: { clienteId: id }, data: { maxCredit: limit } });
    if (before !== limit) {
      await recordAudit(tx, {
        action: 'CREDIT_LIMIT_CHANGED',
        entity: 'Cliente',
        entityId: id,
        summary: `${current.name}: límite de crédito S/ ${(before ?? 0).toFixed(2)} → S/ ${limit.toFixed(2)}`,
        details: { maxCredit: { before, after: limit } },
        user,
      });
    }
    return saved;
  });
}

export async function setPriceList(client: Client, id: number, priceList: PriceList, user: SessionUser) {
  const current = await client.cliente.findUnique({ where: { id }, select: { name: true, priceList: true } });
  if (!current) throw new CustomerError('Cliente no encontrado.', 404);
  if (priceList === 'WHOLESALE') requireFeature('wholesale');

  return client.$transaction(async (tx) => {
    const saved = await tx.cliente.update({ where: { id }, data: { priceList }, select: { id: true, priceList: true } });
    if (current.priceList !== priceList) {
      await recordAudit(tx, {
        action: 'PRICE_LIST_CHANGED',
        entity: 'Cliente',
        entityId: id,
        summary: `${current.name}: lista ${PRICE_LIST_LABELS[current.priceList as PriceList]} → ${PRICE_LIST_LABELS[priceList]}`,
        details: { priceList: { before: current.priceList, after: priceList } },
        user,
      });
    }
    return saved;
  });
}

// ---------- Créditos ----------

// Clientes con deuda, con sus movimientos (cargos por ventas al fiado y abonos).
export async function listDebts(client: Client) {
  const accounts = await client.creditoCliente.findMany({
    where: { debtTotal: { gt: 0 } },
    select: {
      id: true, debtTotal: true, maxCredit: true, lastPurchase: true,
      cliente: { select: { id: true, name: true, doc: true, phone: true, maxCredit: true } },
      abonos: { select: { id: true, amount: true, docRef: true, desc: true, type: true, createdAt: true }, orderBy: { id: 'desc' } },
    },
    orderBy: { debtTotal: 'desc' },
  });
  return accounts.map(a => {
    const limit = creditLimit(num(a.cliente.maxCredit), num(a.maxCredit));
    const debt = num(a.debtTotal);
    return {
      id: a.id,
      clienteId: a.cliente.id,
      name: a.cliente.name,
      doc: a.cliente.doc,
      phone: a.cliente.phone,
      debt,
      maxCredit: limit,
      availableCredit: availableCredit(limit, debt),
      lastPurchase: a.lastPurchase ? a.lastPurchase.toLocaleString('es-PE') : null,
      abonos: a.abonos.map(m => ({
        id: m.id, date: m.createdAt.toLocaleString('es-PE'), type: m.type, amount: num(m.amount), docRef: m.docRef, desc: m.desc,
      })),
    };
  });
}

// Abono a la deuda. Se descuenta solo si la deuda alcanza, en la misma operación: dos abonos simultáneos
// nunca dejan la deuda en negativo. El recibo lleva el número del propio movimiento (no se repite).
export async function registerPayment(client: Client, clienteId: number, amount: number) {
  return client.$transaction(async (tx) => {
    const account = await tx.creditoCliente.findUnique({ where: { clienteId }, select: { id: true, debtTotal: true } });
    if (!account || num(account.debtTotal) <= 0) throw new CustomerError('El cliente no tiene deudas pendientes.');
    const { count } = await tx.creditoCliente.updateMany({
      where: { clienteId, debtTotal: { gte: amount } },
      data: { debtTotal: { decrement: amount } },
    });
    if (count === 0) throw new CustomerError('El abono no puede superar la deuda pendiente actual.');

    const movement = await tx.abonoCredito.create({
      data: { creditoId: account.id, amount, docRef: 'REC-PENDIENTE', desc: 'Abono de cliente en caja', type: 'ABONO' },
    });
    const docRef = receiptNumber(movement.id);
    await tx.abonoCredito.update({
      where: { id: movement.id },
      data: { docRef, desc: `Abono de cliente en caja (Recibo: ${docRef})` },
    });
    return { success: true as const, docRef };
  });
}
