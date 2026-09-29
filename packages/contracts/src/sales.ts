// Ventas directas, pedidos por estados y cotizaciones (módulo sales del backend).
import type { IsoDate } from './common.ts';
import type { CustomerType } from './customers.ts';
import type { DeliveryStatus } from './deliveries.ts';
import type { SaleFlowMode, DispatchRole } from './identity.ts';
import type { DocumentType } from './settings.ts';

export type PayMethod = 'EFECTIVO' | 'TARJETA' | 'YAPE_PLIN' | 'TRANSFERENCIA' | 'PAGO_MIXTO' | 'FIADO';
export type SaleStatus = 'PENDING_PAYMENT' | 'PAID' | 'DISPATCHED' | 'CANCELLED';
export type QuoteStatus = 'PENDIENTE' | 'CONVERTIDO' | 'CANCELADO';

/** El comprobante y el medio de pago se envían con el nombre que ve el usuario; el servidor los traduce. */
export type DocTypeLabel = 'Nota de Venta' | 'Boleta' | 'Factura';
export type PayMethodLabel = 'Efectivo' | 'Tarjeta' | 'Yape/Plin' | 'Transferencia' | 'Pago Mixto' | 'Fiado';

// ---------- Lo que envía la pantalla ----------

/** Una línea del carrito: un producto en una presentación (unitId null = unidad base). */
export interface CartLine {
  id: number;
  unitId: number | null;
  qty: number;
  /** Solo para los mensajes de error. */
  name?: string;
}

export interface DiscountRequest {
  type: 'PERCENT' | 'AMOUNT';
  value: number;
}

/** Envío a domicilio que se programa al cobrar. */
export interface DeliveryRequest {
  type: 'DELIVERY';
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
}

/** Cómo se paga (venta directa y cobro de un pedido). */
export interface PaymentRequest {
  docType: DocTypeLabel;
  payMethod: PayMethodLabel;
  /** Pago mixto: la parte en efectivo y la digital. */
  mixCash: number;
  mixDigital: number;
  /** N° de operación de Yape/Plin. */
  payCode: string;
  clienteId: number | null;
  delivery: DeliveryRequest | null;
}

/** POST /api/ventas: venta directa (modo directo). */
export interface DirectSaleRequest extends PaymentRequest {
  vendedorId: number | null;
  cotizacionId: number | null;
  /** Total que vio el usuario: si los precios cambiaron, el servidor rechaza con PRECIOS_CAMBIARON. */
  totalEsperado: number;
  discount: DiscountRequest | null;
  cart: CartLine[];
}

/** POST /api/pedidos: el vendedor envía el pedido a caja. */
export interface OrderRequest {
  cart: CartLine[];
  clienteId: number | null;
  cotizacionId: number | null;
  totalEsperado: number;
  discount: DiscountRequest | null;
}

/** POST /api/pedidos/:id/cobrar */
export type PayOrderRequest = PaymentRequest;

/** POST /api/pedidos/:id/despachar */
export interface DispatchRequest {
  repartidorId?: number | null;
}

/** POST /api/pedidos/:id/anular */
export interface CancelOrderRequest {
  reason?: string;
}

/** POST /api/cotizaciones */
export interface QuoteRequest {
  cart: CartLine[];
  clienteId: number | null;
  validDays: number;
}

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
