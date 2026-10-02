// Proveedores y compras (módulo purchasing del backend).
import type { IsoDate } from './common.ts';
import { id, optionalId, z } from './zod.ts';

/** GET /api/proveedores */
export interface Supplier {
  id: number;
  ruc: string;
  name: string;
  phone: string | null;
  address: string | null;
  createdAt: IsoDate;
}

const supplierText = z.string().optional().transform(value => value?.trim() ?? '');

/** POST /api/proveedores */
export const SupplierBody = z.object({
  ruc: supplierText.refine(ruc => ruc.length > 0, { error: 'RUC y Nombre de Proveedor requeridos.' }),
  name: supplierText.refine(name => name.length > 0, { error: 'RUC y Nombre de Proveedor requeridos.' }),
  phone: supplierText.transform(phone => phone || null),
  address: supplierText.transform(address => address || null),
});
export type SupplierRequest = z.input<typeof SupplierBody>;

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

const REQUIRED = 'Proveedor, número de documento y al menos un producto requeridos.';

/**
 * POST /api/compras: cada línea con su costo unitario. La mercadería entra a la sucursal del usuario, o a
 * `branchId` si lo indica el administrador. Que la cantidad sea entera o fraccionable depende del producto:
 * lo revisa el servidor.
 */
export const PurchaseBody = z.object({
  proveedorId: id(REQUIRED),
  numDoc: z.string({ error: REQUIRED }).trim().min(1, { error: REQUIRED }),
  items: z.array(z.object({
    id: id('La compra contiene un producto inválido.'),
    qty: z.coerce.number({ error: 'Cantidad inválida.' }),
    cost: z.coerce.number({ error: 'Costo inválido.' }),
    /** Solo para los mensajes de error. */
    name: z.string().optional(),
    /** Datos del rubro de la línea (farmacia: lotNumber y expiresAt); los valida su paquete. */
    industryData: z.unknown().optional(),
  }), { error: REQUIRED }).min(1, { error: REQUIRED }),
  branchId: optionalId('Sucursal no válida.'),
});
export type PurchaseRequest = z.input<typeof PurchaseBody>;

export interface PurchaseSaved {
  success: true;
  compra: { id: number; numDoc: string; total: number };
}
