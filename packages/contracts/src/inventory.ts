// Stock por sucursal, kardex y transferencias (módulo inventory del backend).
import type { IsoDate } from './common.ts';
import { MAX_QUANTITY_DECIMALS, roundQuantity } from './quantities.ts';
import { id, optionalId, z } from './zod.ts';

export type MovementType = 'ENTRADA' | 'SALIDA';
/** today | week | month | all | custom (con startDate y endDate). */
export type Period = string;

/** Un movimiento del kardex. */
export interface KardexMovement {
  id: number;
  /** Fecha y hora para mostrar (es-PE). */
  date: string;
  timestamp: IsoDate;
  code: string;
  name: string;
  unit: string;
  type: MovementType;
  qty: number;
  stockAfter: number;
  ref: string | null;
  user: string;
  userRole: string;
  branch: { id: number; name: string };
}

/** GET /api/kardex?period=&startDate=&endDate=&productCode=&type=&branchId= */
export interface KardexResponse {
  records: KardexMovement[];
  summary: { totalIn: number; totalOut: number; netBalance: number; movementCount: number; period: Period };
}

const INVALID_MOVEMENT = 'Parámetros inválidos para registrar el movimiento.';

/** POST /api/kardex: ajuste manual de stock (entrada, merma, conteo). Sin branchId, en la sucursal del usuario. */
export const ManualMovementBody = z.object({
  productoId: id(INVALID_MOVEMENT),
  type: z.enum(['ENTRADA', 'SALIDA'], { error: INVALID_MOVEMENT }),
  qty: z.coerce.number({ error: INVALID_MOVEMENT }).positive({ error: INVALID_MOVEMENT }),
  ref: z.string().optional(),
  branchId: optionalId('Sucursal no válida.'),
  /** Datos del rubro de un ingreso (farmacia: lotNumber y expiresAt); los valida su paquete. */
  industryData: z.unknown().optional(),
});
export type ManualMovementRequest = z.input<typeof ManualMovementBody>;

export interface ManualMovementSaved {
  newStock: number;
}

/** GET /api/transferencias y la creada en POST /api/transferencias. */
export interface Transfer {
  id: number;
  /** TR-000001 */
  number: string;
  createdAt: IsoDate;
  notes: string | null;
  from: { id: number; name: string };
  to: { id: number; name: string };
  createdBy: string;
  items: { id: number; code: string; name: string; unit: string; qty: number }[];
}

export const MAX_TRANSFER_NOTES = 200;
const NO_ITEMS = 'Agregue al menos un producto a transferir.';
const INVALID_QTY = `Cantidad inválida: debe ser mayor a 0 y con hasta ${MAX_QUANTITY_DECIMALS} decimales.`;

/**
 * POST /api/transferencias. Sin fromBranchId sale de la sucursal del usuario (el administrador puede
 * indicar otra). Los productos repetidos se suman en el servidor.
 */
export const TransferBody = z.object({
  fromBranchId: optionalId('Sucursal de origen no válida.'),
  toBranchId: id('Elija la sucursal de destino.'),
  items: z.array(z.object({
    id: id('La transferencia contiene un producto inválido.'),
    qty: z.coerce.number({ error: INVALID_QTY })
      .refine(qty => Number.isFinite(qty) && qty > 0 && roundQuantity(qty) === qty, { error: INVALID_QTY }),
  }), { error: NO_ITEMS }).min(1, { error: NO_ITEMS }),
  // Vacía = sin nota; larga, se recorta.
  notes: z.union([z.string(), z.number()]).nullish()
    .transform(value => String(value ?? '').trim().slice(0, MAX_TRANSFER_NOTES) || null),
});
export type TransferRequest = z.input<typeof TransferBody>;
