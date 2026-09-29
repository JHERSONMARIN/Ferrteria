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
