// Precios, descuentos y cobro: lo que comparten la venta directa, los pedidos y las cotizaciones.
import { recordAudit } from '../../../services/audit.js';
import { requireFeature } from '../../licensing/index.ts';
import type { SessionUser } from '../../../types/express.d.ts';
import {
  SaleError, assertCreditAvailable, assertSellable, computeDiscount, isQuoteValid, lineKey, priceLine, splitPayment,
  sumLines, unitPriceFor, type CartItem, type DiscountRequest, type PayMethod,
} from '../domain/sale.ts';
import * as repo from '../infrastructure/saleRepository.ts';
import type { Db } from '../infrastructure/saleRepository.ts';

// Productos del carrito, comprobando que existan, estén activos y la cantidad sea válida.
export async function loadCartProducts(db: Db, items: CartItem[]) {
  const products = await repo.loadSellableProducts(db, items.map(i => i.id));
  for (const item of items) assertSellable(products.get(item.id), item);
  return products;
}

// Precio de cada línea: el de la cotización si sigue vigente; si no, el de la lista del cliente
// (mayorista o minorista). Nunca el que manda el navegador.
export async function priceLines(db: Db, items: CartItem[], quoteId: number | null, clienteId: number | null = null) {
  const products = await loadCartProducts(db, items);
  const priceList = await repo.priceListOf(db, clienteId);

  const quotedPrices = new Map<string, number>();
  if (quoteId) {
    const quote = await repo.quoteForPricing(db, quoteId);
    if (!quote) throw new SaleError('La cotización no existe.', 404);
    if (quote.status !== 'PENDIENTE') {
      throw new SaleError(`La cotización ${quote.numDoc} ya fue ${quote.status === 'CONVERTIDO' ? 'convertida a venta' : 'cancelada'}.`);
    }
    if (isQuoteValid(quote.createdAt, quote.validDays, new Date())) {
      quote.lines.forEach(l => quotedPrices.set(lineKey(l.productId, l.unitId), l.unitPrice));
    }
  }

  const lines = items.map(item => {
    const product = products.get(item.id)!;
    const unit = product.saleUnits.find(u => u.id === item.unitId) ?? null;
    return priceLine(product, item, quotedPrices.get(lineKey(item.id, item.unitId)) ?? unitPriceFor(product, priceList, unit));
  });
  return { lines, total: sumLines(lines) };
}

export async function markQuoteConverted(db: Db, quoteId: number): Promise<void> {
  if (!(await repo.convertQuoteIfPending(db, quoteId))) throw new SaleError('La cotización ya fue procesada.', 409);
}

// El descuento es una función del plan; el tope por rol lo decide el dominio.
export function applyDiscount(subtotal: number, request: DiscountRequest | null, user: SessionUser, maxPercent: number) {
  if (request) requireFeature('discounts');
  return computeDiscount(subtotal, request, user.role, maxPercent);
}

export async function auditDiscount(db: Parameters<typeof recordAudit>[0], data: {
  saleId: number; reference: string; subtotal: number; discount: number; total: number; request: DiscountRequest | null; user: SessionUser;
}): Promise<void> {
  if (data.discount <= 0 || !data.request) return;
  await recordAudit(db, {
    action: 'DISCOUNT_APPLIED',
    entity: 'Venta',
    entityId: data.saleId,
    summary: `Descuento de S/ ${data.discount.toFixed(2)} en ${data.reference} (de S/ ${data.subtotal.toFixed(2)} a S/ ${data.total.toFixed(2)})`,
    details: { subtotal: data.subtotal, discount: data.discount, total: data.total, type: data.request.type, value: data.request.value },
    user: data.user,
  });
}

// Valida el medio de pago (y el crédito, si es fiado) y devuelve cuánto entra en efectivo y en digital.
export async function paymentFor(db: Db, data: {
  payMethod: PayMethod; total: number; mixCash?: unknown; mixDigital?: unknown; clienteId: number | null;
}) {
  const payment = splitPayment(data.payMethod, data.total, data.mixCash, data.mixDigital);
  if (data.payMethod === 'FIADO') {
    if (!data.clienteId) throw new SaleError('Para ventas al FIADO debe seleccionar un cliente registrado.');
    const credit = await repo.customerCredit(db, data.clienteId);
    if (!credit) throw new SaleError('El cliente seleccionado no existe.');
    assertCreditAvailable(credit.name, data.total, credit.debt, credit.limit);
  }
  return payment;
}
