// Envíos a domicilio y repartidores (módulo deliveries del backend).
import type { IsoDate } from './common.ts';

export type DeliveryStatus = 'PENDIENTE' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO';

/** Un envío tal como lo ve la pantalla de Entregas. */
export interface Delivery {
  id: number;
  ref: string;
  status: DeliveryStatus;
  /** El pedido todavía no salió del almacén. */
  waitingDispatch: boolean;
  address: string;
  contactName: string;
  contactPhone: string | null;
  notes: string | null;
  saleNumDoc: string | null;
  total: number | null;
  /** Envío antiguo, registrado sin venta. */
  legacy: boolean;
  courier: { id: number; name: string } | null;
  createdAt: IsoDate;
  departedAt: IsoDate | null;
  deliveredAt: IsoDate | null;
  items: { name: string; code: string; qty: number }[];
}

/** GET /api/entregas/venta/:numDoc: una venta cobrada de la sucursal, para programarle un envío. */
export interface SaleForDelivery {
  numDoc: string;
  total: number;
  /** Referencia del envío que ya tiene, si lo tiene. */
  existingDelivery: string | null;
  customer: { name: string; phone: string | null; address: string | null } | null;
  items: { name: string; qty: number }[];
}

/** POST /api/entregas: envío para una venta ya cobrada. */
export interface ScheduleDeliveryRequest {
  numDoc: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
}

export interface DeliveryScheduled {
  success: true;
  entrega: Delivery;
}

/** PATCH /api/entregas/:id/repartidor (null = soltarlo). */
export interface AssignCourierRequest {
  repartidorId: number | null;
}

/** POST /api/entregas/:id/cancelar */
export interface CancelDeliveryRequest {
  reason: string | null;
}
