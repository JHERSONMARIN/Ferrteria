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
