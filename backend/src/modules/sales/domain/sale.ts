// Ventas, pedidos y cotizaciones: reglas puras (carrito, precios, descuentos, pagos y estados).
// Nunca se usa el precio que manda el navegador: el servidor calcula con sus propios precios.
import { AppError } from '@ferresys/shared/errors';
import { MAX_QUANTITY_DECIMALS, quantityProblem, roundMoney, roundQuantity } from '../../../utils/quantities.ts';

export class SaleError extends AppError {
  static override area = 'VENTA';
}

// ---------- Comprobante y medio de pago ----------

export type DocType = 'FACTURA' | 'BOLETA' | 'NOTA_VENTA';
export type PayMethod = 'EFECTIVO' | 'TARJETA' | 'YAPE_PLIN' | 'TRANSFERENCIA' | 'PAGO_MIXTO' | 'FIADO';
export type PriceList = 'RETAIL' | 'WHOLESALE';
export type SaleFlowMode = 'DIRECT' | 'SEPARATE_CASHIER' | 'STAGED';

const DOC_TYPES: Record<string, DocType> = { Factura: 'FACTURA', Boleta: 'BOLETA' };
const PAY_METHODS: Record<string, PayMethod> = {
  Efectivo: 'EFECTIVO',
  Tarjeta: 'TARJETA',
  'Yape/Plin': 'YAPE_PLIN',
  Transferencia: 'TRANSFERENCIA',
  'Pago Mixto': 'PAGO_MIXTO',
  Fiado: 'FIADO',
};

// El POS manda los nombres que ve el usuario; lo desconocido es nota de venta y efectivo.
export const toDocType = (docType: unknown): DocType => DOC_TYPES[String(docType)] ?? 'NOTA_VENTA';
export const toPayMethod = (payMethod: unknown): PayMethod => PAY_METHODS[String(payMethod)] ?? 'EFECTIVO';
export const docTypeLabel = (docType: string) =>
  docType === 'FACTURA' ? 'Factura' : docType === 'BOLETA' ? 'Boleta' : 'Nota de Venta';

// ---------- Carrito ----------

export interface CartItem {
  id: number;
  unitId: number | null;
  qty: number;
}

// Clave de una línea: el mismo producto en otra presentación es otra línea.
export const lineKey = (productId: number, unitId: number | null | undefined) => `${productId}:${unitId ?? 0}`;

// Unidades que salen del stock por una línea (el stock siempre está en la unidad base).
export const baseQuantity = (qty: number, factor = 1) => roundQuantity(qty * factor);

// Suma productos repetidos (en la misma presentación) y rechaza ids o cantidades inválidas. Si el producto
// admite fracciones se valida al cargarlo. Se ordena por id: las ventas simultáneas bloquean filas en el
// mismo orden y no se traban.
export function normalizeCart(cart: unknown): CartItem[] {
  if (!Array.isArray(cart) || cart.length === 0) throw new SaleError('El carrito no puede estar vacío.');
  const lines = new Map<string, CartItem>();
  for (const item of cart as Record<string, unknown>[]) {
    const id = Number(item?.id);
    const qty = Number(item?.qty);
    const rawUnit = item?.unitId;
    const unitId = rawUnit === undefined || rawUnit === null || rawUnit === '' ? null : Number(rawUnit);
    const label = item?.name || `el producto ${id}`;
    if (!Number.isInteger(id) || id <= 0) throw new SaleError('El carrito contiene un producto inválido.');
    if (unitId !== null && (!Number.isInteger(unitId) || unitId <= 0)) throw new SaleError(`La presentación de ${label} no es válida.`);
    if (!Number.isFinite(qty) || qty <= 0 || roundQuantity(qty) !== qty) {
      throw new SaleError(`Cantidad inválida para ${label}: debe ser mayor a 0 y con hasta ${MAX_QUANTITY_DECIMALS} decimales.`);
    }
    const key = lineKey(id, unitId);
    lines.set(key, { id, unitId, qty: roundQuantity((lines.get(key)?.qty ?? 0) + qty) });
  }
  return [...lines.values()].sort((a, b) => a.id - b.id || (a.unitId ?? 0) - (b.unitId ?? 0));
}

// ---------- Productos y precios ----------

export interface SaleUnit {
  id: number;
  name: string;
  factor: number;
  price: number;
  wholesalePrice: number | null;
  allowsFractions: boolean;
}

export interface SellableProduct {
  id: number;
  name: string;
  code: string;
  price: number;
  wholesalePrice: number | null;
  active: boolean;
  allowsFractions: boolean;
  unit: string;
  saleUnits: SaleUnit[];
}

// Presentación de venta de un producto; null = su unidad base.
export function saleUnitOf(product: SellableProduct, unitId: number | null): SaleUnit | null {
  if (!unitId) return null;
  const unit = product.saleUnits.find(u => u.id === unitId);
  if (!unit) throw new SaleError(`La presentación elegida para ${product.name} ya no está disponible.`);
  return unit;
}

// El producto existe, está activo y la cantidad es válida para la presentación (enteros o fracciones).
export function assertSellable(product: SellableProduct | undefined, item: CartItem): asserts product is SellableProduct {
  if (!product || !product.active) throw new SaleError(`El producto ${product?.name || item.id} no existe o no está activo.`);
  const unit = saleUnitOf(product, item.unitId);
  const problem = quantityProblem(item.qty, unit ? unit.allowsFractions : product.allowsFractions);
  if (problem) throw new SaleError(`La cantidad de ${product.name}${unit ? ` (${unit.name})` : ''} ${problem}.`);
}

// Precio de la presentación (o del producto en su unidad base) según la lista del cliente.
export const unitPriceFor = (product: SellableProduct, priceList: PriceList, unit: SaleUnit | null = null) => {
  const source = unit ?? product;
  return priceList === 'WHOLESALE' && source.wholesalePrice != null ? source.wholesalePrice : source.price;
};

export interface PricedLine extends CartItem {
  unitName: string | null;
  factor: number;
  baseQty: number;
  name: string;
  code: string;
  price: number;
  subtotal: number;
}

// Datos de la línea que dependen de la presentación: nombre, factor y unidades que salen del stock.
export function unitFields(unit: SaleUnit | null, qty: number) {
  const factor = unit ? unit.factor : 1;
  return { unitId: unit?.id ?? null, unitName: unit?.name ?? null, factor, baseQty: baseQuantity(qty, factor) };
}

export function priceLine(product: SellableProduct, item: CartItem, price: number): PricedLine {
  const unit = saleUnitOf(product, item.unitId);
  return { ...item, ...unitFields(unit, item.qty), name: product.name, code: product.code, price, subtotal: roundMoney(price * item.qty) };
}

export const sumLines = (lines: readonly { subtotal: number }[]) => roundMoney(lines.reduce((sum, l) => sum + l.subtotal, 0));

// Una cotización se respeta hasta el final de su plazo; vencida, se cobra a precio actual.
export function isQuoteValid(createdAt: Date, validDays: number, now: Date): boolean {
  const expires = new Date(createdAt);
  expires.setDate(expires.getDate() + validDays);
  return expires >= now;
}

// Si el total que vio la pantalla no es el del servidor, los precios cambiaron: se rechaza con los nuevos.
export function assertExpectedTotal(expectedTotal: unknown, lines: readonly PricedLine[], total: number): void {
  if (expectedTotal === undefined || expectedTotal === null) return;
  if (Math.abs(Number(expectedTotal) - total) > 0.01) {
    throw new SaleError(
      `Los precios cambiaron: el total actual es S/ ${total.toFixed(2)} y no S/ ${Number(expectedTotal).toFixed(2)}. Revise el carrito antes de cobrar.`,
      409,
      'PRECIOS_CAMBIARON',
      { precios: lines.map(l => ({ id: l.id, unitId: l.unitId, price: l.price })) },
    );
  }
}

// ---------- Descuentos ----------

export interface DiscountRequest {
  type: 'PERCENT' | 'AMOUNT';
  value: number;
}

// Descuento que pide el POS: { type, value }. Sin descuento (o de 0) → null.
export function parseDiscountRequest(raw: unknown): DiscountRequest | null {
  if (raw === undefined || raw === null) return null;
  const request = raw as { type?: unknown; value?: unknown };
  if (request.type !== 'PERCENT' && request.type !== 'AMOUNT') throw new SaleError('Tipo de descuento no válido.');
  const value = Number(request.value);
  if (!Number.isFinite(value) || value < 0) throw new SaleError('El descuento debe ser un número positivo.');
  if (request.type === 'PERCENT' && value > 100) throw new SaleError('El descuento no puede superar el 100 %.');
  return value === 0 ? null : { type: request.type, value };
}

// Sobre la suma de las líneas. El administrador no tiene tope; el resto del personal descuenta hasta el %
// que fijó la empresa.
export function computeDiscount(subtotal: number, request: DiscountRequest | null, role: string | undefined, maxPercent: number) {
  if (!request) return { discount: 0, total: subtotal };
  const discount = roundMoney(request.type === 'PERCENT' ? subtotal * request.value / 100 : request.value);
  if (discount >= subtotal) throw new SaleError('El descuento no puede cubrir todo el total de la venta.');
  if (role !== 'ADMINISTRADOR') {
    const allowed = roundMoney(subtotal * maxPercent / 100);
    if (discount > allowed) {
      throw new SaleError(
        maxPercent > 0
          ? `Su descuento máximo es ${maxPercent} % (S/ ${allowed.toFixed(2)} en esta venta).`
          : 'No tiene permitido aplicar descuentos. Solicítelo a un administrador.',
        403,
        'DESCUENTO_EXCEDIDO',
      );
    }
  }
  return { discount, total: roundMoney(subtotal - discount) };
}

// ---------- Pago ----------

// Cuánto entra a la caja en efectivo y cuánto en digital. El fiado no entra.
export function splitPayment(payMethod: PayMethod, total: number, mixCash?: unknown, mixDigital?: unknown) {
  if (payMethod === 'EFECTIVO') return { cash: total, digital: 0 };
  if (payMethod === 'TARJETA' || payMethod === 'YAPE_PLIN' || payMethod === 'TRANSFERENCIA') return { cash: 0, digital: total };
  if (payMethod === 'PAGO_MIXTO') {
    const cash = Number(mixCash);
    const digital = Number(mixDigital);
    if (!Number.isFinite(cash) || !Number.isFinite(digital) || cash < 0 || digital < 0) {
      throw new SaleError('Los montos del pago mixto son inválidos.');
    }
    if (Math.abs(cash + digital - total) > 0.01) throw new SaleError('El pago mixto no coincide con el total de la venta.');
    return { cash, digital };
  }
  return { cash: 0, digital: 0 };
}

// Sin límite propio, un cliente puede fiar hasta S/ 1000.
export const DEFAULT_CREDIT_LIMIT = 1000;

export function assertCreditAvailable(customerName: string, total: number, debt: number, limit: number | null): void {
  const max = limit || DEFAULT_CREDIT_LIMIT;
  const available = max - debt;
  if (total > available) {
    throw new SaleError(
      `Crédito insuficiente para ${customerName}. Límite: S/ ${max.toFixed(2)}, Deuda Actual: S/ ${debt.toFixed(2)}, `
        + `Disponible: S/ ${available.toFixed(2)}. Intentó fiar: S/ ${total.toFixed(2)}.`,
      400,
      'CREDITO_INSUFICIENTE',
    );
  }
}

// ---------- Pedidos ----------

// Perú no tiene horario de verano: el cierre del día es siempre a las 23:59:59 (UTC-5).
const BUSINESS_TIME_ZONE = 'America/Lima';
const BUSINESS_UTC_OFFSET = '-05:00';
export const EXPIRED_REASON = 'Vencido al cierre del día';

// Un pedido sin cobrar vence al cierre del día en que se creó.
export function endOfBusinessDay(now = new Date()): Date {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return new Date(`${day}T23:59:59.999${BUSINESS_UTC_OFFSET}`);
}

// El stock del pedido está reservado en su sucursal: solo ahí se cobra y se despacha.
export function assertSameBranch(order: { branchId: number; branchName?: string | null }, user: { branchId: number }): void {
  if (order.branchId !== user.branchId) {
    throw new SaleError(`Este pedido es de la sucursal ${order.branchName ?? order.branchId}: se atiende allí.`, 403);
  }
}

// Un vendedor sin acceso a caja solo anula sus propios pedidos; el administrador, cualquiera y en cualquier sucursal.
export function assertCanCancel(
  order: { sellerId: number | null; branchId: number; branchName?: string | null },
  user: { id: number; role: string; modules: string[]; branchId: number },
): void {
  const canCancelAny = user.role === 'ADMINISTRADOR' || user.modules.includes('caja');
  if (!canCancelAny && order.sellerId !== user.id) throw new SaleError('Solo puede anular sus propios pedidos.', 403);
  if (user.role !== 'ADMINISTRADOR') assertSameBranch(order, user);
}

// Líneas tal como las ve la pantalla, y las columnas de la presentación al guardar el detalle.
export const publicLines = (lines: readonly PricedLine[]) =>
  lines.map(({ id, name, code, qty, price, subtotal, unitId, unitName, factor }) => ({
    id, name, code, qty, price, subtotal, unitId: unitId ?? null, unitName: unitName ?? null, factor: factor ?? 1,
  }));

export const unitColumns = (line: { unitId: number | null; unitName: string | null; factor: number }) =>
  ({ unitId: line.unitId ?? null, unitName: line.unitName ?? null, unitFactor: line.factor ?? 1 });
