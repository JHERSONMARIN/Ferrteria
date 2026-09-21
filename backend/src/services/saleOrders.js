import { nextDocumentNumber } from './documentSeries.js';
import { getSettings } from './settings.js';
import { reserveStock, consumeReservedStock, releaseReservedStock } from './stock.js';
import { parseDeliveryRequest, scheduleDeliveryForSale, assertBranchDelivers, assertCanDeliver } from './deliveries.js';
import { roundMoney } from '../utils/quantities.js';
import { canDispatch } from '../config/dispatch.js';
import { recordAudit } from './audit.js';
import {
  VentaError, normalizarCarrito, priceLines, assertExpectedTotal, validatePayment, parseDiscountRequest, applyDiscount, auditDiscount,
  findOpenCashRegister, recordCashIncome, recordCreditCharge, writeKardexExit, publicLines,
  toDocTypeEnum, toPayMethodEnum,
} from './ventas.js';

// Perú no tiene horario de verano: el cierre del día es siempre a las 23:59:59 (UTC-5).
const BUSINESS_TIME_ZONE = 'America/Lima';
const BUSINESS_UTC_OFFSET = '-05:00';
export const EXPIRED_REASON = 'Vencido al cierre del día';

export function endOfBusinessDay(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return new Date(`${day}T23:59:59.999${BUSINESS_UTC_OFFSET}`);
}

const toId = (v) => (v === undefined || v === null || v === '' ? null : parseInt(v, 10) || null);

const ORDER_INCLUDE = {
  cliente: { select: { id: true, name: true, doc: true, type: true } },
  vendedor: { select: { name: true } },
  detalles: { select: { productoId: true, quantity: true, unitPrice: true, subtotal: true, producto: { select: { name: true, code: true } } } },
  entrega: {
    select: {
      id: true, ref: true, address: true, status: true,
      repartidor: { select: { id: true, name: true } },
    },
  },
  branch: { select: { id: true, name: true, saleFlowMode: true, deliveriesEnabled: true, dispatchRole: true } },
};

const linesOf = (order) => order.detalles.map(d => ({
  id: d.productoId, qty: d.quantity, price: d.unitPrice, subtotal: d.subtotal, name: d.producto.name, code: d.producto.code,
}));

export function formatOrder(order) {
  return {
    id: order.id,
    status: order.status,
    total: order.total,
    discount: order.discount,
    subtotal: roundMoney(order.total + order.discount),
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
    items: publicLines(linesOf(order)),
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

// Cambia de estado solo si el pedido sigue en el estado esperado: evita cobrar o despachar dos veces.
async function transition(tx, orderId, fromStatus, data, conflictMessage) {
  const { count } = await tx.venta.updateMany({ where: { id: orderId, status: fromStatus }, data });
  if (count === 0) {
    const current = await tx.venta.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!current) throw new VentaError('El pedido no existe.', 404);
    throw new VentaError(conflictMessage, 409);
  }
}

// El stock del pedido está reservado en su sucursal: solo ahí se cobra y se despacha.
function assertSameBranch(order, user) {
  if (order.branchId !== user.branchId) {
    throw new VentaError(`Este pedido es de la sucursal ${order.branch?.name ?? order.branchId}: se atiende allí.`, 403);
  }
}

async function dispatchLines(tx, order, numDoc, userId) {
  for (const line of linesOf(order)) {
    const stockAfter = await consumeReservedStock(tx, line.id, line.qty, order.branchId);
    await writeKardexExit(tx, {
      productId: line.id, qty: line.qty, stockAfter, ref: `Venta ${numDoc} (despacho)`, userId, branchId: order.branchId,
    });
  }
}

export async function createOrder(db, payload, user) {
  const settings = await getSettings(db);
  if (user.branch?.saleFlowMode === 'DIRECT') {
    throw new VentaError('Su sucursal trabaja en modo directo: cobre la venta desde el Punto de Venta.', 409, 'MODO_DIRECTO');
  }
  const items = normalizarCarrito(payload.cart);
  const cotizacionId = toId(payload.cotizacionId);
  const clienteId = toId(payload.clienteId);
  const discountRequest = parseDiscountRequest(payload.discount);

  return db.$transaction(async (tx) => {
    // La lista de precios y el descuento se aplican al armar el pedido; en caja solo se cobra.
    const { lineas, total: subtotal } = await priceLines(tx, items, cotizacionId, clienteId);
    const { discount, total } = applyDiscount(subtotal, discountRequest, user, settings.maxDiscountPercent);
    assertExpectedTotal(payload.totalEsperado, lineas, total);

    const order = await tx.venta.create({
      data: {
        status: 'PENDING_PAYMENT',
        branchId: user.branchId,
        total,
        discount,
        discountById: discount > 0 ? user.id : null,
        clienteId,
        vendedorId: user.id,
        cotizacionId,
        expiresAt: endOfBusinessDay(),
      },
    });
    await auditDiscount(tx, { saleId: order.id, reference: `el pedido N° ${order.id}`, subtotal, discount, total, request: discountRequest, user });

    for (const line of lineas) {
      await reserveStock(tx, line.id, line.qty, user.branchId);
      await tx.detalleVenta.create({
        data: { ventaId: order.id, productoId: line.id, quantity: line.qty, unitPrice: line.price, subtotal: line.subtotal },
      });
    }

    return formatOrder(await tx.venta.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE }));
  });
}

export async function payOrder(db, orderId, payload, cashier) {
  const delivery = parseDeliveryRequest(payload.delivery);

  return db.$transaction(async (tx) => {
    const order = await tx.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order) throw new VentaError('El pedido no existe.', 404);
    if (order.status !== 'PENDING_PAYMENT') throw new VentaError('Este pedido ya fue cobrado o anulado.', 409);
    assertSameBranch(order, cashier);
    if (delivery) assertBranchDelivers(order.branch);
    if (order.expiresAt && order.expiresAt < new Date()) {
      throw new VentaError('El pedido venció. Pida al vendedor que lo registre nuevamente.', 409);
    }

    const docTypeEnum = toDocTypeEnum(payload.docType);
    const payMethodEnum = toPayMethodEnum(payload.payMethod);
    const clienteId = toId(payload.clienteId) ?? order.clienteId;
    const lines = linesOf(order);

    const payment = await validatePayment(tx, {
      payMethodEnum, mixCash: payload.mixCash, mixDigital: payload.mixDigital, clienteId, total: order.total,
    });
    const caja = await findOpenCashRegister(tx, cashier.id);
    const numDoc = await nextDocumentNumber(tx, docTypeEnum, order.branchId);
    const now = new Date();

    await transition(tx, orderId, 'PENDING_PAYMENT', {
      status: 'PAID',
      numDoc,
      docType: docTypeEnum,
      payMethod: payMethodEnum,
      mixCash: payMethodEnum === 'PAGO_MIXTO' ? payment.cash : 0,
      mixDigital: payMethodEnum === 'PAGO_MIXTO' ? payment.digital : 0,
      payCode: payload.payCode ? String(payload.payCode).trim() : null,
      clienteId,
      cajaId: caja.id,
      paidById: cashier.id,
      paidAt: now,
    }, 'Este pedido ya fue cobrado o anulado.');

    await recordCashIncome(tx, caja.id, payment);
    if (payMethodEnum === 'FIADO') await recordCreditCharge(tx, { clienteId, total: order.total, numDoc, lineas: lines });
    if (delivery) await scheduleDeliveryForSale(tx, { ventaId: orderId, numDoc, clienteId, lines, delivery });
    if (order.cotizacionId) {
      await tx.cotizacion.updateMany({ where: { id: order.cotizacionId, status: 'PENDIENTE' }, data: { status: 'CONVERTIDO' } });
    }

    // Con caja separada el cajero entrega en mostrador: el pedido se despacha en el mismo momento.
    // Con envío a domicilio queda por despachar hasta entregarlo al repartidor.
    if (order.branch.saleFlowMode !== 'STAGED' && !delivery) {
      await transition(tx, orderId, 'PAID', { status: 'DISPATCHED', dispatchedAt: now, dispatchedById: cashier.id },
        'El pedido cambió de estado mientras se cobraba.');
      await dispatchLines(tx, order, numDoc, cashier.id);
    }

    return formatOrder(await tx.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE }));
  });
}

export async function dispatchOrder(db, orderId, user, courierId = null) {
  return db.$transaction(async (tx) => {
    const order = await tx.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order) throw new VentaError('El pedido no existe.', 404);
    assertSameBranch(order, user);
    if (!canDispatch(user, order.branch)) throw new VentaError('En esta sucursal despacha otra persona.', 403);

    // Con envío a domicilio, la mercadería se le entrega a un repartidor concreto: queda registrado.
    if (order.entrega && order.entrega.status === 'PENDIENTE') {
      const elegido = courierId ?? order.entrega.repartidor?.id ?? null;
      if (!elegido) throw new VentaError('Indique a qué repartidor se le entrega el pedido.', 400);
      await assertCanDeliver(tx, elegido, order.branchId);
      if (elegido !== order.entrega.repartidor?.id) {
        await tx.entrega.update({ where: { id: order.entrega.id }, data: { repartidorId: elegido } });
      }
    }

    await transition(tx, orderId, 'PAID', { status: 'DISPATCHED', dispatchedAt: new Date(), dispatchedById: user.id },
      order.status === 'PENDING_PAYMENT' ? 'El pedido todavía no fue cobrado.' : 'Este pedido ya fue despachado o anulado.');
    await dispatchLines(tx, order, order.numDoc, user.id);

    return formatOrder(await tx.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE }));
  });
}

// user null = lo anuló el sistema (vencimiento).
async function cancelInTransaction(tx, order, reason, user = null) {
  await transition(tx, order.id, 'PENDING_PAYMENT', { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    'Solo se pueden anular pedidos pendientes de cobro.');
  for (const line of linesOf(order)) {
    await releaseReservedStock(tx, line.id, line.qty, order.branchId);
  }
  await recordAudit(tx, {
    action: 'SALE_CANCELLED',
    entity: 'Venta',
    entityId: order.id,
    summary: `Pedido N° ${order.id} de S/ ${order.total.toFixed(2)} anulado: ${reason}`,
    details: { total: order.total, reason, seller: order.vendedor?.name ?? null, customer: order.cliente?.name ?? null },
    user,
  });
}

export async function cancelOrder(db, orderId, user, reason) {
  return db.$transaction(async (tx) => {
    const order = await tx.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order) throw new VentaError('El pedido no existe.', 404);

    // Un vendedor sin acceso a caja solo puede anular sus propios pedidos.
    const canCancelAny = user.role === 'ADMINISTRADOR' || user.modules.includes('caja');
    if (!canCancelAny && order.vendedorId !== user.id) {
      throw new VentaError('Solo puede anular sus propios pedidos.', 403);
    }
    if (user.role !== 'ADMINISTRADOR') assertSameBranch(order, user);

    await cancelInTransaction(tx, order, reason?.trim() || `Anulado por ${user.name}`, user);
    return formatOrder(await tx.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE }));
  });
}

// Anula los pedidos sin cobrar cuyo plazo terminó y devuelve su stock al disponible.
export async function expireOrders(db) {
  const expired = await db.venta.findMany({
    where: { status: 'PENDING_PAYMENT', expiresAt: { lt: new Date() } },
    include: ORDER_INCLUDE,
  });
  let count = 0;
  for (const order of expired) {
    try {
      await db.$transaction(tx => cancelInTransaction(tx, order, EXPIRED_REASON));
      count++;
    } catch (error) {
      // Otro proceso lo cobró o anuló mientras tanto: no hay nada que vencer.
      if (!(error instanceof VentaError)) throw error;
    }
  }
  if (count > 0) console.log(`[pedidos] ${count} pedido(s) vencido(s) anulado(s) y su stock liberado.`);
  return count;
}

// Cada usuario ve la cola de su sucursal.
export async function listOrders(db, status, user) {
  await expireOrders(db);
  const orders = await db.venta.findMany({
    where: { status, branchId: user.branchId },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
  return orders.map(formatOrder);
}

// Lo que salió hoy del almacén: sirve de respaldo cuando alguien reclama un pedido.
export async function listDispatchedToday(db, user) {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const orders = await db.venta.findMany({
    where: { status: 'DISPATCHED', branchId: user.branchId, dispatchedAt: { gte: inicio } },
    include: { ...ORDER_INCLUDE, dispatchedBy: { select: { name: true } } },
    orderBy: { dispatchedAt: 'desc' },
    take: 100,
  });
  return orders.map(order => ({
    ...formatOrder(order),
    dispatchedAt: order.dispatchedAt,
    dispatchedBy: order.dispatchedBy?.name ?? null,
  }));
}

export async function getOrder(db, orderId) {
  const order = await db.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) throw new VentaError('El pedido no existe.', 404);
  return formatOrder(order);
}
