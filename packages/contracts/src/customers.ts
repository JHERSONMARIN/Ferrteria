// Clientes, lista de precios y crédito (módulo customers del backend).

export type CustomerType = 'NATURAL' | 'EMPRESA';
export type PriceList = 'RETAIL' | 'WHOLESALE';

/** GET /api/clientes */
export interface Customer {
  id: number;
  type: CustomerType;
  /** DNI (8 dígitos) o RUC (11). */
  doc: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  priceList: PriceList;
  /** Límite de crédito (fiado). */
  maxCredit: number;
  currentDebt: number;
  availableCredit: number;
}

/** POST /api/clientes y PUT /api/clientes/:id (el crédito y la lista de precios solo al crear). */
export interface CustomerRequest {
  type: 'Natural' | 'Empresa';
  doc: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  maxCredit?: number;
  priceList?: PriceList;
}

/** Un movimiento de la cuenta de crédito: un cargo (venta al fiado) o un abono. */
export interface CreditMovement {
  id: number;
  /** Fecha y hora para mostrar (es-PE). */
  date: string;
  type: 'CARGO' | 'ABONO';
  amount: number;
  docRef: string | null;
  desc: string | null;
}

/** GET /api/creditos: las cuentas con deuda, de mayor a menor. */
export interface CreditAccount {
  id: number;
  clienteId: number;
  name: string;
  doc: string;
  phone: string | null;
  debt: number;
  maxCredit: number;
  availableCredit: number;
  lastPurchase: string | null;
  abonos: CreditMovement[];
}

/** POST /api/creditos/abono */
export interface CreditPaymentRequest {
  clienteId: number;
  amount: number;
}

export interface CreditPaymentSaved {
  success: true;
  /** N° del recibo. */
  docRef: string;
}
