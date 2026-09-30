// Stock por sucursal, kardex y transferencias (módulo inventory del backend).
import type { IsoDate } from './common.ts';

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

/** POST /api/kardex: ajuste manual de stock. */
export interface ManualMovementRequest {
  productoId: number;
  type: MovementType;
  qty: number;
  ref: string;
  /** Datos del rubro de un ingreso (farmacia: lotNumber y expiresAt). */
  industryData?: Record<string, unknown>;
}

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

export interface TransferRequest {
  fromBranchId: number | null;
  toBranchId: number;
  items: { id: number; qty: number }[];
  notes: string;
}
