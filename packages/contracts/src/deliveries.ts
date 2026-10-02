// Envíos a domicilio y repartidores (módulo deliveries del backend).
import type { IsoDate } from './common.ts';
import { optionalId, z } from './zod.ts';

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

// ---------- Lo que envía la pantalla ----------

const trimOrNull = (max: number) => z.union([z.string(), z.number()]).nullish()
  .transform(value => String(value ?? '').trim().slice(0, max) || null);

/** Adónde va el envío: dirección de 5 a 250 caracteres y, si hay, un teléfono válido. */
export const DeliveryAddressBody = z.object({
  address: z.union([z.string(), z.number()]).nullish().transform(value => String(value ?? '').trim())
    .refine(address => address.length >= 5, { error: 'Ingrese la dirección de entrega (mínimo 5 caracteres).' })
    .refine(address => address.length <= 250, { error: 'La dirección no puede superar 250 caracteres.' }),
  contactName: trimOrNull(120),
  contactPhone: trimOrNull(30)
    .refine(phone => !phone || /^[0-9+\s()-]{6,30}$/.test(phone), { error: 'El teléfono de contacto no es válido.' }),
  notes: trimOrNull(300),
});
export type DeliveryAddress = z.output<typeof DeliveryAddressBody>;

/** Envío que llega con el cobro: sin type 'DELIVERY' (o sin envío) el cliente se lleva los productos (null). */
export const SaleDeliveryBody = z.preprocess(
  value => ((value as { type?: unknown } | null | undefined)?.type === 'DELIVERY' ? value : null),
  DeliveryAddressBody.nullable(),
);
export type DeliveryRequest = { type: 'DELIVERY' } & z.input<typeof DeliveryAddressBody>;

/** POST /api/entregas: envío para una venta ya cobrada. */
export const ScheduleDeliveryBody = DeliveryAddressBody.extend({
  numDoc: z.union([z.string(), z.number()]).nullish().transform(value => String(value ?? '')),
});
export type ScheduleDeliveryRequest = z.input<typeof ScheduleDeliveryBody>;

export interface DeliveryScheduled {
  success: true;
  entrega: Delivery;
}

/** PATCH /api/entregas/:id/repartidor (null = soltarlo). */
export const AssignCourierBody = z.object({ repartidorId: optionalId('Repartidor no válido.') });
export type AssignCourierRequest = z.input<typeof AssignCourierBody>;

/** POST /api/entregas/:id/cancelar (sin motivo = null). */
export const CancelDeliveryBody = z.object({ reason: z.string().nullish() });
export type CancelDeliveryRequest = z.input<typeof CancelDeliveryBody>;
