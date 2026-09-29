// Pedidos (modos "vendedor y caja" y "por etapas"): el vendedor arma el pedido, la caja lo cobra y el
// almacén lo despacha. PENDIENTE DE PAGO → PAGADO → DESPACHADO, o ANULADO (a mano o vencido al cierre del día).
import type { SaleStatus } from '@prisma/client';
import type { prisma, Tx } from '../../../db.ts';
import { recordAudit } from '../../audit/index.ts';
import { getSettings } from '../../settings/index.ts';
import { roundMoney } from '../../../utils/quantities.ts';
import type { SessionUser } from '../../../types/express.d.ts';
import { requireOpenSession } from '../../cash/index.ts';
import { assertBranchDelivers, assertCanDeliver, parseDeliveryRequest, scheduleDeliveryForSale } from '../../deliveries/index.ts';
import { consumeReservedStock, releaseReservedStock, reserveStock } from '../../inventory/index.ts';
import { industryHooks } from '../../../industries/index.ts';
import { canDispatch } from '../domain/dispatch.ts';
import {
  EXPIRED_REASON, SaleError, assertCanCancel, assertExpectedTotal, assertSameBranch, endOfBusinessDay, normalizeCart,
  parseDiscountRequest, publicLines, toDocType, toPayMethod, unitColumns,
} from '../domain/sale.ts';
import { nextDocumentNumber } from '../infrastructure/documentSeries.ts';
import * as repo from '../infrastructure/saleRepository.ts';
import type { Db, OrderRow } from '../infrastructure/saleRepository.ts';
import { toId } from './directSale.ts';
import { applyDiscount, auditDiscount, paymentFor, priceLines, saleLinesFor } from './pricing.ts';

type Client = typeof prisma;

export function presentOrder(order: OrderRow) {
  const total = Number(order.total);
  const discount = Number(order.discount);
  return {
    id: order.id,
    status: order.status,
    total,
    discount,
    subtotal: roundMoney(total + discount),
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    numDoc: order.numDoc,
    docType: order.docType,
    payMethod: order.payMethod,
    clienteId: order.clienteId,
    customer: order.cliente ? order.cliente.name : 'Público General',
    customerDoc: order.cliente ? order.cliente.doc : null,
    customerType: order.cliente ? order.cliente.type : null,
    seller: order.vendedor ? order.vendedor.name : 'General',
    items: publicLines(repo.linesOf(order)),
    delivery: order.entrega ? {
      id: order.entrega.id,
      ref: order.entrega.ref,
      address: order.entrega.address,
      status: order.entrega.status,
      // Quién lo solicitó (antes de despachar) o a quién se le entregó (después).
      courier: order.entrega.repartidor ? { id: order.entrega.repartidor.id, name: order.entrega.repartidor.name } : null,
    } : null,
    branch: order.branch,
  };
}

async function loadOrder(db: Db, id: number) {
  const order = await repo.findOrder(db, id);
  if (!order) throw new SaleError('El pedido no existe.', 404);
  return order;
}

const present = async (db: Db, id: number) => presentOrder(await loadOrder(db, id));

async function transition(db: Db, id: number, from: SaleStatus, data: Parameters<typeof repo.updateOrderIfStatus>[3], conflictMessage: string) {
  const result = await repo.updateOrderIfStatus(db, id, from, data);
  if (result === 'missing') throw new SaleError('El pedido no existe.', 404);
  if (result === 'conflict') throw new SaleError(conflictMessage, 409);
}

const orderBranch = (order: OrderRow) => ({ branchId: order.branchId, branchName: order.branch?.name });

async function dispatchLines(tx: Tx, order: OrderRow, numDoc: string | null, userId: number) {
  for (const line of repo.linesOf(order)) {
    const stockAfter = await consumeReservedStock(tx, line.id, line.baseQty, order.branchId);
    const ref = `Venta ${numDoc} (despacho)`;
    await repo.writeKardexExit(tx, { productId: line.id, qty: line.baseQty, stockAfter, ref, userId, branchId: order.branchId });
    await industryHooks.onStockMovement(tx, {
      direction: 'out', source: 'sale', productId: line.id, qty: line.baseQty, branchId: order.branchId, ref, userId,
    });
  }
}

// El vendedor envía el pedido a caja. La lista de precios y el descuento se aplican aquí; en caja solo se cobra.
export async function createOrder(client: Client, payload: Record<string, unknown>, user: SessionUser) {
  const settings = await getSettings(client);
  if (user.branch?.saleFlowMode === 'DIRECT') {
    throw new SaleError('Su sucursal trabaja en modo directo: cobre la venta desde el Punto de Venta.', 409, 'MODO_DIRECTO');
  }
  const items = normalizeCart(payload.cart);
  const quoteId = toId(payload.cotizacionId);
  const clienteId = toId(payload.clienteId);
  const discountRequest = parseDiscountRequest(payload.discount);

  return client.$transaction(async (tx) => {
    const { lines, total: subtotal } = await priceLines(tx, items, quoteId, clienteId);
    const { discount, total } = applyDiscount(subtotal, discountRequest, user, Number(settings.maxDiscountPercent));
    assertExpectedTotal(payload.totalEsperado, lines, total);
    await industryHooks.beforeSale(tx, { kind: 'order', branchId: user.branchId, customerId: clienteId, lines: saleLinesFor(lines), user });

    const order = await tx.venta.create({
      data: {
        status: 'PENDING_PAYMENT',
        branchId: user.branchId,
        total,
        discount,
        discountById: discount > 0 ? user.id : null,
        clienteId,
        vendedorId: user.id,
        cotizacionId: quoteId,
        expiresAt: endOfBusinessDay(),
      },
    });
    await auditDiscount(tx, { saleId: order.id, reference: `el pedido N° ${order.id}`, subtotal, discount, total, request: discountRequest, user });

    for (const line of lines) {
      await reserveStock(tx, line.id, line.baseQty, user.branchId);
      await tx.detalleVenta.create({
        data: { ventaId: order.id, productoId: line.id, quantity: line.qty, unitPrice: line.price, subtotal: line.subtotal, ...unitColumns(line) },
      });
    }
    return present(tx, order.id);
  });
}

export async function payOrder(client: Client, orderId: number, payload: Record<string, unknown>, cashier: SessionUser) {
  const delivery = parseDeliveryRequest(payload.delivery);

  return client.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (order.status !== 'PENDING_PAYMENT') throw new SaleError('Este pedido ya fue cobrado o anulado.', 409);
    assertSameBranch(orderBranch(order), cashier);
    if (delivery) assertBranchDelivers(order.branch);
    if (order.expiresAt && order.expiresAt < new Date()) {
      throw new SaleError('El pedido venció. Pida al vendedor que lo registre nuevamente.', 409);
    }

    const docType = toDocType(payload.docType);
    const payMethod = toPayMethod(payload.payMethod);
    const clienteId = toId(payload.clienteId) ?? order.clienteId;
    const lines = repo.linesOf(order);
    const total = Number(order.total);

    const payment = await paymentFor(tx, { payMethod, total, mixCash: payload.mixCash, mixDigital: payload.mixDigital, clienteId });
    const sessionId = await requireOpenSession(tx, cashier.id);
    const numDoc = await nextDocumentNumber(tx, docType, order.branchId);
    const now = new Date();

    await transition(tx, orderId, 'PENDING_PAYMENT', {
      status: 'PAID',
      numDoc,
      docType,
      payMethod,
      mixCash: payMethod === 'PAGO_MIXTO' ? payment.cash : 0,
      mixDigital: payMethod === 'PAGO_MIXTO' ? payment.digital : 0,
      payCode: payload.payCode ? String(payload.payCode).trim() : null,
      clienteId,
      cajaId: sessionId,
      paidById: cashier.id,
      paidAt: now,
    }, 'Este pedido ya fue cobrado o anulado.');

    await repo.addCashIncome(tx, sessionId, payment);
    if (payMethod === 'FIADO') await repo.chargeCredit(tx, { clienteId: clienteId!, total, numDoc, lines });
    if (delivery) await scheduleDeliveryForSale(tx, { ventaId: orderId, numDoc, clienteId, lines, delivery });
    if (order.cotizacionId) await repo.convertQuoteIfPending(tx, order.cotizacionId);

    // Con caja separada el cajero entrega en mostrador: el pedido se despacha en el mismo momento.
    // Con envío a domicilio queda por despachar hasta entregarlo al repartidor.
    if (repo.branchModeOf(order) !== 'STAGED' && !delivery) {
      await transition(tx, orderId, 'PAID', { status: 'DISPATCHED', dispatchedAt: now, dispatchedById: cashier.id },
        'El pedido cambió de estado mientras se cobraba.');
      await dispatchLines(tx, order, numDoc, cashier.id);
    }
    return present(tx, orderId);
  });
}

export async function dispatchOrder(client: Client, orderId: number, user: SessionUser, courierId: number | null = null) {
  return client.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertSameBranch(orderBranch(order), user);
    if (!canDispatch(user, order.branch)) throw new SaleError('En esta sucursal despacha otra persona.', 403);

    // Con envío a domicilio, la mercadería se le entrega a un repartidor concreto: queda registrado.
    if (order.entrega && order.entrega.status === 'PENDIENTE') {
      const chosen = courierId ?? order.entrega.repartidor?.id ?? null;
      if (!chosen) throw new SaleError('Indique a qué repartidor se le entrega el pedido.', 400, 'ENVIO_SIN_REPARTIDOR');
      await assertCanDeliver(tx, chosen, order.branchId);
      if (chosen !== order.entrega.repartidor?.id) {
        await tx.entrega.update({ where: { id: order.entrega.id }, data: { repartidorId: chosen } });
      }
    }

    await transition(tx, orderId, 'PAID', { status: 'DISPATCHED', dispatchedAt: new Date(), dispatchedById: user.id },
      order.status === 'PENDING_PAYMENT' ? 'El pedido todavía no fue cobrado.' : 'Este pedido ya fue despachado o anulado.');
    await dispatchLines(tx, order, order.numDoc, user.id);
    return present(tx, orderId);
  });
}

// user null = lo anuló el sistema (vencimiento).
async function cancelInTransaction(tx: Tx, order: OrderRow, reason: string, user: SessionUser | null = null) {
  await transition(tx, order.id, 'PENDING_PAYMENT', { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    'Solo se pueden anular pedidos pendientes de cobro.');
  for (const line of repo.linesOf(order)) await releaseReservedStock(tx, line.id, line.baseQty, order.branchId);
  const total = Number(order.total);
  await recordAudit(tx, {
    action: 'SALE_CANCELLED',
    entity: 'Venta',
    entityId: order.id,
    summary: `Pedido N° ${order.id} de S/ ${total.toFixed(2)} anulado: ${reason}`,
    details: { total, reason, seller: order.vendedor?.name ?? null, customer: order.cliente?.name ?? null },
    user,
  });
}

export async function cancelOrder(client: Client, orderId: number, user: SessionUser, reason?: string | null) {
  return client.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    assertCanCancel({ sellerId: order.vendedorId, ...orderBranch(order) }, user);
    await cancelInTransaction(tx, order, reason?.trim() || `Anulado por ${user.name}`, user);
    return present(tx, orderId);
  });
}

// Anula los pedidos sin cobrar cuyo plazo terminó y devuelve su stock al disponible.
export async function expireOrders(client: Client): Promise<number> {
  const expired = await repo.findOrders(client, { status: 'PENDING_PAYMENT', expiresAt: { lt: new Date() } }, { id: 'asc' });
  let count = 0;
  for (const order of expired) {
    try {
      await client.$transaction(tx => cancelInTransaction(tx, order, EXPIRED_REASON));
      count++;
    } catch (error) {
      // Otro proceso lo cobró o anuló mientras tanto: no hay nada que vencer.
      if (!(error instanceof SaleError)) throw error;
    }
  }
  if (count > 0) console.log(`[pedidos] ${count} pedido(s) vencido(s) anulado(s) y su stock liberado.`);
  return count;
}

// Cada usuario ve la cola de su sucursal.
export async function listOrders(client: Client, status: SaleStatus, user: SessionUser) {
  await expireOrders(client);
  const orders = await repo.findOrders(client, { status, branchId: user.branchId }, { createdAt: 'asc' });
  return orders.map(presentOrder);
}

// Lo que salió hoy del almacén: sirve de respaldo cuando alguien reclama un pedido.
export async function listDispatchedToday(client: Client, user: SessionUser) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const orders = await repo.findOrders(client, { status: 'DISPATCHED', branchId: user.branchId, dispatchedAt: { gte: start } }, { dispatchedAt: 'desc' }, 100);
  return orders.map(order => ({ ...presentOrder(order), dispatchedAt: order.dispatchedAt, dispatchedBy: order.dispatchedBy?.name ?? null }));
}

export const getOrder = (client: Client, orderId: number) => present(client, orderId);
