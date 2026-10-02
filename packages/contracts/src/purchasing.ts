// Proveedores y compras (módulo purchasing del backend).
import type { IsoDate } from './common.ts';

/** GET /api/proveedores */
export interface Supplier {
  id: number;
  ruc: string;
  name: string;
  phone: string | null;
  address: string | null;
  createdAt: IsoDate;
}

export interface SupplierRequest {
  ruc: string;
  name: string;
  phone: string;
  address: string;
}

/** GET /api/compras */
export interface Purchase {
  id: number;
  numDoc: string;
  provider: string;
  providerRuc: string;
  total: number;
  /** Fecha y hora para mostrar (es-PE). */
  date: string;
  detalles: { quantity: number; unitPrice: number; subtotal: number; producto: { name: string; code: string } }[];
}

/** POST /api/compras: cada línea con su costo unitario. */
export interface PurchaseRequest {
  proveedorId: number;
  numDoc: string;
  /** industryData: datos del rubro de la línea (farmacia: lotNumber y expiresAt). */
  items: { id: number; qty: number; cost: number; name?: string; code?: string; industryData?: Record<string, unknown> }[];
}

export interface PurchaseSaved {
  success: true;
  compra: { id: number; numDoc: string; total: number };
}
