// Ventas directas, pedidos por estados y cotizaciones (módulo sales del backend).
import type { IsoDate } from './common.ts';
import type { CustomerType } from './customers.ts';
import type { DeliveryStatus } from './deliveries.ts';
import type { SaleFlowMode, DispatchRole } from './identity.ts';
import type { DocumentType } from './settings.ts';
import { SaleDeliveryBody, type DeliveryRequest } from './deliveries.ts';

export type { DeliveryRequest };
import { MAX_QUANTITY_DECIMALS, roundQuantity } from './quantities.ts';
import { optionalId, z } from './zod.ts';

export type PayMethod = 'EFECTIVO' | 'TARJETA' | 'YAPE_PLIN' | 'TRANSFERENCIA' | 'PAGO_MIXTO' | 'FIADO';
export type SaleStatus = 'PENDING_PAYMENT' | 'PAID' | 'DISPATCHED' | 'CANCELLED';
export type QuoteStatus = 'PENDIENTE' | 'CONVERTIDO' | 'CANCELADO';

/** El comprobante y el medio de pago se envían con el nombre que ve el usuario; el servidor los traduce. */
export type DocTypeLabel = 'Nota de Venta' | 'Boleta' | 'Factura';
export type PayMethodLabel = 'Efectivo' | 'Tarjeta' | 'Yape/Plin' | 'Transferencia' | 'Pago Mixto' | 'Fiado';

// ---------- Lo que envía la pantalla ----------

const DOC_TYPES: Record<string, 'FACTURA' | 'BOLETA'> = { Factura: 'FACTURA', Boleta: 'BOLETA' };
const PAY_METHODS: Record<string, PayMethod> = {
  Efectivo: 'EFECTIVO',
  Tarjeta: 'TARJETA',
  'Yape/Plin': 'YAPE_PLIN',
  Transferencia: 'TRANSFERENCIA',
  'Pago Mixto': 'PAGO_MIXTO',
  Fiado: 'FIADO',
};

// El POS manda los nombres que ve el usuario; lo desconocido es nota de venta y efectivo.
export const toDocType = (docType: unknown): DocumentType => DOC_TYPES[String(docType)] ?? 'NOTA_VENTA';
export const toPayMethod = (payMethod: unknown): PayMethod => PAY_METHODS[String(payMethod)] ?? 'EFECTIVO';

const numberish = z.union([z.number(), z.string()]);
const issue = (ctx: z.RefinementCtx, message: string) => ctx.addIssue({ code: 'custom', message });
// Identificador opcional que la pantalla manda como número, texto o vacío: lo inválido = sin valor.
const looseId = numberish.nullish().transform(value => (value === '' || value === null || value === undefined ? null : parseInt(String(value), 10) || null));

/** Descuento en % o en S/, sobre el total o sobre una línea. Sin descuento, o de 0, = null. */
export const DiscountBody = z.object({
  type: z.enum(['PERCENT', 'AMOUNT'], { error: 'Tipo de descuento no válido.' }),
  value: z.union([z.number(), z.string()], { error: 'El descuento debe ser un número positivo.' }).nullish().transform(Number)
    .refine(value => Number.isFinite(value) && value >= 0, { error: 'El descuento debe ser un número positivo.' }),
}, { error: 'Tipo de descuento no válido.' })
  .refine(d => d.type !== 'PERCENT' || d.value <= 100, { error: 'El descuento no puede superar el 100 %.' })
  .nullish()
  .transform(d => (!d || d.value === 0 ? null : d));
export type DiscountRequest = NonNullable<z.input<typeof DiscountBody>>;
/** Un descuento ya validado. */
export type Discount = NonNullable<z.output<typeof DiscountBody>>;

/** Una línea del carrito ya revisada: producto, presentación (null = unidad base), cantidad y su descuento. */
export interface CartItem {
  id: number;
  unitId: number | null;
  qty: number;
  discount: Discount | null;
}

// Clave de una línea: el mismo producto en otra presentación es otra línea.
export const lineKey = (productId: number, unitId: number | null | undefined) => `${productId}:${unitId ?? 0}`;

// Suma productos repetidos (en la misma presentación) y los ordena por id: las ventas simultáneas bloquean
// filas en el mismo orden y no se traban.
export function mergeCart(items: readonly CartItem[]): CartItem[] {
  const lines = new Map<string, CartItem>();
  for (const item of items) {
    const key = lineKey(item.id, item.unitId);
    const previous = lines.get(key);
    lines.set(key, { ...item, qty: roundQuantity((previous?.qty ?? 0) + item.qty), discount: item.discount ?? previous?.discount ?? null });
  }
  return [...lines.values()].sort((a, b) => a.id - b.id || (a.unitId ?? 0) - (b.unitId ?? 0));
}

const EMPTY_CART = 'El carrito no puede estar vacío.';
const CartLineBody = z.object({
  id: numberish.nullish(),
  unitId: numberish.nullish(),
  qty: numberish.nullish(),
  /** Descuento de la línea (las cotizaciones no llevan descuento: se ignora). */
  discount: DiscountBody,
  /** Solo para los mensajes de error. */
  name: z.string().optional(),
}, { error: 'El carrito contiene un producto inválido.' });
/** Una línea del carrito: un producto en una presentación (unitId null = unidad base). */
export type CartLine = z.input<typeof CartLineBody>;

// El carrito: ids y cantidades válidos (si el producto admite fracciones se revisa al cargarlo).
export const CartBody = z.array(CartLineBody, { error: EMPTY_CART }).min(1, { error: EMPTY_CART }).transform((raw, ctx) => {
  const items: CartItem[] = [];
  for (const line of raw) {
    const id = Number(line.id);
    const qty = Number(line.qty);
    const unitId = line.unitId === undefined || line.unitId === null || line.unitId === '' ? null : Number(line.unitId);
    const label = line.name || `el producto ${id}`;
    if (!Number.isInteger(id) || id <= 0) { issue(ctx, 'El carrito contiene un producto inválido.'); return z.NEVER; }
    if (unitId !== null && (!Number.isInteger(unitId) || unitId <= 0)) { issue(ctx, `La presentación de ${label} no es válida.`); return z.NEVER; }
    if (!Number.isFinite(qty) || qty <= 0 || roundQuantity(qty) !== qty) {
      issue(ctx, `Cantidad inválida para ${label}: debe ser mayor a 0 y con hasta ${MAX_QUANTITY_DECIMALS} decimales.`);
      return z.NEVER;
    }
    items.push({ id, unitId, qty, discount: line.discount });
  }
  return mergeCart(items);
});

/** Cómo se paga (venta directa, cobro de un pedido y cotización convertida). */
const paymentFields = {
  docType: z.string().nullish().transform(toDocType),
  payMethod: z.string().nullish().transform(toPayMethod),
  /** Pago mixto: la parte en efectivo y la digital (se revisan contra el total en el servidor). */
  mixCash: numberish.nullish(),
  mixDigital: numberish.nullish(),
  /** N° de operación de Yape/Plin. */
  payCode: z.union([z.string(), z.number()]).nullish().transform(value => (value ? String(value).trim() : null)),
};

const saleFields = {
  clienteId: looseId,
  cotizacionId: looseId,
  /** Total que vio el usuario: si los precios cambiaron, el servidor rechaza con PRECIOS_CAMBIARON. */
  totalEsperado: numberish.nullish().transform(value => (value === null || value === undefined ? null : Number(value))),
  discount: DiscountBody,
  cart: CartBody,
  /** Datos del rubro de la venta (farmacia: la receta, PharmacySaleData); los valida su paquete. */
  industryData: z.unknown().optional(),
};

/** POST /api/ventas: venta directa (modo directo). Sin vendedorId, vende quien cobra. */
export const DirectSaleBody = z.object({
  ...paymentFields,
  ...saleFields,
  vendedorId: looseId,
  delivery: SaleDeliveryBody,
});
export type DirectSaleRequest = Omit<z.input<typeof DirectSaleBody>, 'delivery'> & { delivery?: DeliveryRequest | null };
export type DirectSaleInput = z.output<typeof DirectSaleBody>;

/** POST /api/pedidos: el vendedor envía el pedido a caja. */
export const OrderBody = z.object(saleFields);
export type OrderRequest = z.input<typeof OrderBody>;

/** POST /api/pedidos/:id/cobrar. Sin clienteId, el del pedido. */
export const PayOrderBody = z.object({ ...paymentFields, clienteId: looseId, delivery: SaleDeliveryBody });
export type PayOrderRequest = Omit<z.input<typeof PayOrderBody>, 'delivery'> & { delivery?: DeliveryRequest | null };

/** POST /api/pedidos/:id/despachar (quién lo lleva, si sale con envío). */
export const DispatchBody = z.object({ repartidorId: optionalId('Repartidor no válido.') });
export type DispatchRequest = z.input<typeof DispatchBody>;

/** POST /api/pedidos/:id/anular */
export const CancelOrderBody = z.object({ reason: z.string().nullish() });
export type CancelOrderRequest = z.input<typeof CancelOrderBody>;

/** POST /api/cotizaciones. Sin días de vigencia (o inválidos), 7. */
export const QuoteBody = z.object({
  cart: CartBody,
  clienteId: looseId,
  validDays: numberish.nullish().transform(value => parseInt(String(value), 10) || 7),
});
export type QuoteRequest = z.input<typeof QuoteBody>;

/** POST /api/cotizaciones/:id/convertir: se cobra como venta directa con los productos de la cotización. */
export const ConvertQuoteBody = z.object({ ...paymentFields, vendedorId: looseId });
export type ConvertQuoteRequest = z.input<typeof ConvertQuoteBody>;

/** Datos del error PRECIOS_CAMBIARON: el precio real de cada línea. */
export interface PricesChanged {
  precios: { id: number; unitId: number | null; price: number }[];
}

// ---------- Lo que responde el servidor ----------

/** Una línea de una venta o pedido tal como se muestra. */
export interface SaleLine {
  id: number;
  name: string;
  code: string;
  qty: number;
  price: number;
  /** Descuento de la línea (0 si no tiene). */
  discount: number;
  /** qty × price − discount. */
  subtotal: number;
  unitId: number | null;
  unitName: string | null;
  factor: number;
}

/** Un pedido (venta por estados): GET /api/pedidos, POST /api/pedidos y sus transiciones. */
export interface Order {
  id: number;
  status: SaleStatus;
  total: number;
  discount: number;
  subtotal: number;
  createdAt: IsoDate;
  expiresAt: IsoDate | null;
  paidAt: IsoDate | null;
  /** Número de comprobante: se asigna al cobrar. */
  numDoc: string | null;
  docType: DocumentType | null;
  payMethod: PayMethod | null;
  clienteId: number | null;
  customer: string;
  customerDoc: string | null;
  customerType: CustomerType | null;
  seller: string;
  items: SaleLine[];
  delivery: {
    id: number;
    ref: string;
    address: string | null;
    status: DeliveryStatus;
    courier: { id: number; name: string } | null;
  } | null;
  branch: {
    id: number;
    name: string;
    saleFlowMode: SaleFlowMode;
    deliveriesEnabled: boolean;
    dispatchRole: DispatchRole | null;
  };
}

/** GET /api/pedidos/despachados-hoy */
export interface DispatchedOrder extends Order {
  dispatchedAt: IsoDate | null;
  dispatchedBy: string | null;
}

export interface OrderSaved {
  success: true;
  pedido: Order;
}

/** POST /api/ventas: la venta registrada. */
export interface DirectSale {
  id: number;
  numDoc: string | null;
  docType: DocumentType | null;
  payMethod: PayMethod | null;
  status: SaleStatus;
  total: number;
  discount: number;
  subtotal: number;
  items: SaleLine[];
  /** El envío programado, si se pidió. */
  delivery: { id: number; ref: string; address: string } | null;
}

export interface DirectSaleSaved {
  success: true;
  venta: DirectSale;
}

/** Línea de una cotización, con el producto para volver a cargarla en el POS. */
export interface QuoteLine {
  quantity: number;
  unitPrice: number;
  subtotal: number;
  unitId: number | null;
  unitName: string | null;
  unitFactor: number;
  producto: {
    id: number;
    name: string;
    code: string;
    price: number;
    stock: number;
    reserved: number;
    unit: string;
    allowsFractions: boolean;
  };
}

/** GET /api/cotizaciones */
export interface Quote {
  id: number;
  numDoc: string;
  total: number;
  validDays: number;
  status: QuoteStatus;
  /** Fecha y hora para mostrar (es-PE). */
  date: string;
  createdAt: IsoDate;
  customer: string;
  customerDoc: string;
  clienteId: number | null;
  seller: string;
  detalles: QuoteLine[];
}

/** POST /api/cotizaciones: la cotización creada. */
export interface QuoteSaved {
  success: true;
  cotizacion: {
    id: number;
    numDoc: string;
    total: number;
    validDays: number;
    status: QuoteStatus;
    createdAt: IsoDate;
    detalles: { quantity: number; unitPrice: number; unitName: string | null; producto: { id: number; name: string } }[];
  };
}

/** DELETE /api/cotizaciones/:id */
export interface QuoteCancelled {
  success: true;
  message: string;
  cotizacion: { id: number; status: QuoteStatus };
}
