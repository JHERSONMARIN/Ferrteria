import { nextDocumentNumber } from './documentSeries.js';
import { getSettings } from './settings.js';
import { reserveStock, consumeReservedStock, releaseReservedStock } from './stock.js';
import { parseDeliveryRequest, scheduleDeliveryForSale } from './deliveries.js';
import {
  VentaError, normalizarCarrito, priceLines, assertExpectedTotal, validatePayment,
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
  entrega: { select: { ref: true, address: true } },
};

const linesOf = (order) => order.detalles.map(d => ({
  id: d.productoId, qty: d.quantity, price: d.unitPrice, subtotal: d.subtotal, name: d.producto.name, code: d.producto.code,
}));

export function formatOrder(order) {
  return {
    id: order.id,
    status: order.status,
    total: order.total,
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
    delivery: order.entrega ? { ref: order.entrega.ref, address: order.entrega.address } : null,
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

async function dispatchLines(tx, order, numDoc, userId) {
  for (const line of linesOf(order)) {
    const stockAfter = await consumeReservedStock(tx, line.id, line.qty);
    await writeKardexExit(tx, { productId: line.id, qty: line.qty, stockAfter, ref: `Venta ${numDoc} (despacho)`, userId });
  }
}

export async function createOrder(db, payload, user) {
  const settings = await getSettings(db);
  if (settings.saleFlowMode === 'DIRECT') {
    throw new VentaError('La empresa trabaja en modo directo: cobre la venta desde el Punto de Venta.', 409, 'MODO_DIRECTO');
  }
  const items = normalizarCarrito(payload.cart);
  const cotizacionId = toId(payload.cotizacionId);
  const clienteId = toId(payload.clienteId);

  return db.$transaction(async (tx) => {
    // La lista de precios se aplica al armar el pedido: el cliente mayorista debe elegirse en el POS.
    const { lineas, total } = await priceLines(tx, items, cotizacionId, clienteId);
    assertExpectedTotal(payload.totalEsperado, lineas, total);

    const order = await tx.venta.create({
      data: {
        status: 'PENDING_PAYMENT',
        total,
        clienteId,
        vendedorId: user.id,
        cotizacionId,
        expiresAt: endOfBusinessDay(),
      },
    });

    for (const line of lineas) {
      await reserveStock(tx, line.id, line.qty);
      await tx.detalleVenta.create({
        data: { ventaId: order.id, productoId: line.id, quantity: line.qty, unitPrice: line.price, subtotal: line.subtotal },
      });
    }

    return formatOrder(await tx.venta.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE }));
  });
}

export async function payOrder(db, orderId, payload, cashier) {
  const settings = await getSettings(db);
  const delivery = parseDeliveryRequest(payload.delivery);

  return db.$transaction(async (tx) => {
    const order = await tx.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order) throw new VentaError('El pedido no existe.', 404);
    if (order.status !== 'PENDING_PAYMENT') throw new VentaError('Este pedido ya fue cobrado o anulado.', 409);
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
    const numDoc = await nextDocumentNumber(tx, docTypeEnum);
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
      paidAt: now,
    }, 'Este pedido ya fue cobrado o anulado.');

    await recordCashIncome(tx, caja.id, payment);
    if (payMethodEnum === 'FIADO') await recordCreditCharge(tx, { clienteId, total: order.total, numDoc, lineas: lines });
    if (delivery) await scheduleDeliveryForSale(tx, { ventaId: orderId, numDoc, clienteId, lines, delivery });
    if (order.cotizacionId) {
      await tx.cotizacion.updateMany({ where: { id: order.cotizacionId, status: 'PENDIENTE' }, data: { status: 'CONVERTIDO' } });
    }

    // Con caja separada el cajero entrega en mostrador: el pedido se despacha en el mismo momento.
    if (settings.saleFlowMode !== 'STAGED') {
      await transition(tx, orderId, 'PAID', { status: 'DISPATCHED', dispatchedAt: now, dispatchedById: cashier.id },
        'El pedido cambió de estado mientras se cobraba.');
      await dispatchLines(tx, order, numDoc, cashier.id);
    }

    return formatOrder(await tx.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE }));
  });
}

export async function dispatchOrder(db, orderId, user) {
  return db.$transaction(async (tx) => {
    const order = await tx.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order) throw new VentaError('El pedido no existe.', 404);

    await transition(tx, orderId, 'PAID', { status: 'DISPATCHED', dispatchedAt: new Date(), dispatchedById: user.id },
      order.status === 'PENDING_PAYMENT' ? 'El pedido todavía no fue cobrado.' : 'Este pedido ya fue despachado o anulado.');
    await dispatchLines(tx, order, order.numDoc, user.id);

    return formatOrder(await tx.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE }));
  });
}

async function cancelInTransaction(tx, order, reason) {
  await transition(tx, order.id, 'PENDING_PAYMENT', { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    'Solo se pueden anular pedidos pendientes de cobro.');
  for (const line of linesOf(order)) {
    await releaseReservedStock(tx, line.id, line.qty);
  }
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

    await cancelInTransaction(tx, order, reason?.trim() || `Anulado por ${user.name}`);
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

export async function listOrders(db, status) {
  await expireOrders(db);
  const orders = await db.venta.findMany({
    where: { status },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
  return orders.map(formatOrder);
}

export async function getOrder(db, orderId) {
  const order = await db.venta.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) throw new VentaError('El pedido no existe.', 404);
  return formatOrder(order);
}
