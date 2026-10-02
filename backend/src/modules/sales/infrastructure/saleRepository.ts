// Acceso a la base para ventas y pedidos (Prisma). Convierte a número los montos y cantidades que
// Prisma declara Decimal (db.ts ya los convierte al leer; Number() lo deja claro para los tipos).
import type { Prisma, SaleStatus } from '@prisma/client';
import type { prisma } from '../../../db.ts';
import { baseQuantity, type PriceList, type PricedLine, type SaleFlowMode, type SellableProduct } from '../domain/sale.ts';

export type Db = Pick<typeof prisma,
  'producto' | 'cliente' | 'cotizacion' | 'creditoCliente' | 'abonoCredito' | 'cajaChica' | 'movimientoKardex'
  | 'venta' | 'detalleVenta' | 'entrega' | 'documentSeries'>;

const num = (value: unknown) => Number(value);
const numOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

// ---------- Catálogo para vender ----------

export async function loadSellableProducts(db: Db, ids: number[]): Promise<Map<number, SellableProduct>> {
  const products = await db.producto.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: {
      id: true, name: true, code: true, price: true, wholesalePrice: true, active: true, allowsFractions: true, unit: true,
      saleUnits: {
        where: { active: true },
        select: { id: true, name: true, factor: true, price: true, wholesalePrice: true, allowsFractions: true },
      },
    },
  });
  return new Map(products.map(p => [p.id, {
    ...p,
    price: num(p.price),
    wholesalePrice: numOrNull(p.wholesalePrice),
    saleUnits: p.saleUnits.map(u => ({ ...u, factor: num(u.factor), price: num(u.price), wholesalePrice: numOrNull(u.wholesalePrice) })),
  }]));
}

export async function priceListOf(db: Db, clienteId: number | null): Promise<PriceList> {
  if (!clienteId) return 'RETAIL';
  const client = await db.cliente.findUnique({ where: { id: clienteId }, select: { priceList: true } });
  return (client?.priceList as PriceList | undefined) ?? 'RETAIL';
}

// ---------- Cotizaciones ----------

export async function quoteForPricing(db: Db, id: number) {
  const quote = await db.cotizacion.findUnique({
    where: { id },
    include: { detalles: { select: { productoId: true, unitId: true, unitPrice: true } } },
  });
  if (!quote) return null;
  return {
    numDoc: quote.numDoc,
    status: quote.status,
    createdAt: quote.createdAt,
    validDays: quote.validDays,
    lines: quote.detalles.map(d => ({ productId: d.productoId, unitId: d.unitId, unitPrice: num(d.unitPrice) })),
  };
}

// Solo si sigue pendiente (devuelve false si otra venta ya la convirtió).
export async function convertQuoteIfPending(db: Db, id: number): Promise<boolean> {
  const { count } = await db.cotizacion.updateMany({ where: { id, status: 'PENDIENTE' }, data: { status: 'CONVERTIDO' } });
  return count > 0;
}

// ---------- Cobro ----------

export async function customerCredit(db: Db, clienteId: number) {
  const customer = await db.cliente.findUnique({ where: { id: clienteId }, include: { creditoCliente: true } });
  if (!customer) return null;
  return { name: customer.name, debt: customer.creditoCliente ? num(customer.creditoCliente.debtTotal) : 0, limit: numOrNull(customer.maxCredit) };
}

export async function addCashIncome(db: Db, sessionId: number, payment: { cash: number; digital: number }): Promise<void> {
  if (payment.cash <= 0 && payment.digital <= 0) return;
  await db.cajaChica.update({
    where: { id: sessionId },
    data: { ventasEfectivo: { increment: payment.cash }, ventasDigital: { increment: payment.digital } },
  });
}

// Venta al fiado: la deuda del cliente sube y queda el cargo en su cuenta.
export async function chargeCredit(db: Db, data: { clienteId: number; total: number; numDoc: string; lines: readonly PricedLine[] }) {
  let credit = await db.creditoCliente.findUnique({ where: { clienteId: data.clienteId } });
  if (!credit) credit = await db.creditoCliente.create({ data: { clienteId: data.clienteId, debtTotal: 0, maxCredit: 1000.0 } });
  await db.creditoCliente.update({
    where: { clienteId: data.clienteId },
    data: { debtTotal: { increment: data.total }, lastPurchase: new Date() },
  });
  await db.abonoCredito.create({
    data: {
      creditoId: credit.id,
      amount: data.total,
      docRef: data.numDoc,
      desc: data.lines.map(l => `${l.qty}x ${l.name}${l.unitName ? ` (${l.unitName})` : ''}`).join(', '),
      type: 'CARGO',
    },
  });
}

export async function writeKardexExit(db: Db, data: {
  productId: number; qty: number; stockAfter: number; ref: string; userId: number | null; branchId: number;
}): Promise<void> {
  await db.movimientoKardex.create({
    data: { productoId: data.productId, type: 'SALIDA', qty: data.qty, stockAfter: data.stockAfter, ref: data.ref, usuarioId: data.userId, branchId: data.branchId },
  });
}

// ---------- Pedidos ----------

const ORDER_INCLUDE = {
  cliente: { select: { id: true, name: true, doc: true, type: true } },
  vendedor: { select: { name: true } },
  detalles: {
    select: {
      productoId: true, quantity: true, unitPrice: true, discount: true, subtotal: true, unitId: true, unitName: true, unitFactor: true,
      producto: { select: { name: true, code: true } },
    },
  },
  entrega: {
    select: { id: true, ref: true, address: true, status: true, repartidor: { select: { id: true, name: true } } },
  },
  branch: { select: { id: true, name: true, saleFlowMode: true, deliveriesEnabled: true, dispatchRole: true } },
} satisfies Prisma.VentaInclude;

export const findOrder = (db: Db, id: number) => db.venta.findUnique({ where: { id }, include: ORDER_INCLUDE });

export type OrderRow = NonNullable<Awaited<ReturnType<typeof findOrder>>>;

export const findOrders = (db: Db, where: Prisma.VentaWhereInput, orderBy: Prisma.VentaOrderByWithRelationInput, take?: number) =>
  db.venta.findMany({ where, include: { ...ORDER_INCLUDE, dispatchedBy: { select: { name: true } } }, orderBy, take });

// Líneas de un pedido guardado: qty y price en la presentación vendida; baseQty es lo que mueve el stock.
export const linesOf = (order: OrderRow): PricedLine[] => order.detalles.map(d => {
  const factor = num(d.unitFactor);
  const qty = num(d.quantity);
  return {
    id: d.productoId, qty, price: num(d.unitPrice), discount: num(d.discount), subtotal: num(d.subtotal), name: d.producto.name, code: d.producto.code,
    unitId: d.unitId, unitName: d.unitName, factor, baseQty: baseQuantity(qty, factor),
  };
});

export const branchModeOf = (order: OrderRow) => order.branch.saleFlowMode as SaleFlowMode;

// Cambia de estado solo si el pedido sigue en el estado esperado: evita cobrar o despachar dos veces.
// Devuelve 'ok', o 'missing' si el pedido no existe, o 'conflict' si cambió de estado.
export async function updateOrderIfStatus(
  db: Db, id: number, fromStatus: SaleStatus, data: Prisma.VentaUncheckedUpdateManyInput,
): Promise<'ok' | 'missing' | 'conflict'> {
  const { count } = await db.venta.updateMany({ where: { id, status: fromStatus }, data });
  if (count > 0) return 'ok';
  const current = await db.venta.findUnique({ where: { id }, select: { status: true } });
  return current ? 'conflict' : 'missing';
}
