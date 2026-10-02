// Sucursales (módulo branches del backend).
import type { IsoDate } from './common.ts';
import type { DispatchRole, SaleFlowMode } from './identity.ts';
import { z } from './zod.ts';

/** GET /api/sucursales (con ?todas=1 el administrador ve también las desactivadas). */
export interface Branch {
  id: number;
  name: string;
  address: string | null;
  active: boolean;
  saleFlowMode: SaleFlowMode;
  deliveriesEnabled: boolean;
  dispatchRole: DispatchRole | null;
  userCount: number;
  cashRegisterCount: number;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

// ---------- Lo que envía la pantalla ----------

const MAX_NAME_LENGTH = 60;
const MAX_ADDRESS_LENGTH = 200;

const branchName = z.string({ error: `El nombre de la sucursal debe tener entre 2 y ${MAX_NAME_LENGTH} caracteres.` }).trim()
  .min(2, { error: `El nombre de la sucursal debe tener entre 2 y ${MAX_NAME_LENGTH} caracteres.` })
  .max(MAX_NAME_LENGTH, { error: `El nombre de la sucursal debe tener entre 2 y ${MAX_NAME_LENGTH} caracteres.` });
// Vacía o null = sin dirección.
const address = z.string({ error: 'La dirección no es válida.' }).trim()
  .max(MAX_ADDRESS_LENGTH, { error: `La dirección no puede superar ${MAX_ADDRESS_LENGTH} caracteres.` })
  .nullable().optional()
  .transform(value => (value === undefined ? undefined : value || null));
const saleFlowMode = z.enum(['DIRECT', 'SEPARATE_CASHIER', 'STAGED'], { error: 'Modo de trabajo no válido.' });
const deliveriesEnabled = z.boolean({ error: 'Valor no válido para los envíos a domicilio.' });

/** POST /api/sucursales */
export const CreateBranchBody = z.object({
  name: branchName,
  address,
  saleFlowMode: saleFlowMode.optional(),
  deliveriesEnabled: deliveriesEnabled.optional(),
});
export type CreateBranchRequest = z.input<typeof CreateBranchBody>;

/** PUT /api/sucursales/:id (solo los campos que cambian). dispatchRole null = según el modo. */
export const UpdateBranchBody = z.object({
  name: branchName.optional(),
  address,
  active: z.boolean({ error: 'Estado no válido.' }).optional(),
  saleFlowMode: saleFlowMode.optional(),
  deliveriesEnabled: deliveriesEnabled.optional(),
  dispatchRole: z.enum(['SELLER', 'CASHIER', 'WAREHOUSE'], { error: 'Responsable de despacho no válido.' }).nullable().optional(),
});
export type UpdateBranchRequest = z.input<typeof UpdateBranchBody>;
