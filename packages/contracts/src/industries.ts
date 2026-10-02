// Datos que agrega cada paquete de rubro a las entidades del núcleo (columna industryData).
import { z } from './zod.ts';

// Los esquemas validan industryData en el servidor (los usa el paquete de cada rubro, en backend/src/industries).

const optionalText = (label: string, max: number) =>
  z.string({ message: `${label}: debe ser un texto.` }).trim().max(max, `${label}: hasta ${max} caracteres.`)
    .optional().transform(value => value || undefined);
// Lo vacío no se guarda.
const withoutEmpty = <T extends Record<string, unknown>>(data: T) =>
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };

/** Farmacia: datos de un producto. Un controlado siempre pide receta. */
export const PharmacyProductBody = z.object({
  /** Registro sanitario (DIGEMID). */
  sanitaryRegistration: optionalText('Registro sanitario', 30),
  activeIngredient: optionalText('Principio activo', 120),
  laboratory: optionalText('Laboratorio', 80),
  /** Se vende solo con número de receta. */
  requiresPrescription: z.boolean({ message: '«Requiere receta» debe ser sí o no.' }).default(false),
  /** Sustancia controlada: pide receta y queda en el libro de controlados. */
  controlled: z.boolean({ message: '«Controlado» debe ser sí o no.' }).default(false),
}).transform(data => ({ ...withoutEmpty(data), requiresPrescription: data.requiresPrescription || data.controlled, controlled: data.controlled }));
// type y no interface: así cabe en industryData (Record<string, unknown>).
export type PharmacyProductData = z.output<typeof PharmacyProductBody>;

/** Farmacia: la receta de una venta que la necesita. Médico (con su CMP) y paciente, obligatorios si hay un controlado. */
export const PharmacySaleBody = z.object({
  prescriptionNumber: optionalText('N° de receta', 30),
  prescriber: optionalText('Médico', 120),
  patient: optionalText('Paciente', 120),
}).transform(withoutEmpty);
export type PharmacySaleData = z.output<typeof PharmacySaleBody>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value: string) => DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** Farmacia: lote de una entrada (compra o ingreso). Número y vencimiento juntos, o ninguno (entra "sin lote"). */
export const PharmacyStockEntryBody = z.object({
  lotNumber: z.string({ message: 'El lote debe ser un texto.' }).trim().max(30, 'El lote: hasta 30 caracteres.').optional(),
  expiresAt: z.string({ message: 'El vencimiento debe ser una fecha.' }).trim()
    .refine(value => value === '' || isRealDate(value), 'El vencimiento debe ser una fecha válida (AAAA-MM-DD).').optional(),
}).transform((data, ctx) => {
  const lotNumber = data.lotNumber || undefined;
  const expiresAt = data.expiresAt || undefined;
  if (Boolean(lotNumber) !== Boolean(expiresAt)) {
    ctx.addIssue({ code: 'custom', message: 'Indique el lote y su vencimiento, o ninguno de los dos.' });
    return z.NEVER;
  }
  return lotNumber && expiresAt ? { lotNumber, expiresAt } : {};
});
export type PharmacyStockEntryData = z.input<typeof PharmacyStockEntryBody>;

/** GET /api/rubro/vencimientos: lo vencido y lo que vence pronto en una sucursal, y lo que no tiene lote. */
export interface ExpiryReport {
  /** AAAA-MM-DD, hora de Lima. */
  today: string;
  days: number;
  branchId: number;
  lots: {
    productId: number;
    code: string;
    name: string;
    lotNumber: string;
    expiresAt: string;
    quantity: number;
    expired: boolean;
  }[];
  /** Stock sin lote identificado: no se sabe cuándo vence. */
  unlotted: { productId: number; code: string; name: string; quantity: number }[];
}

/** GET /api/rubro/controlados: cada venta de un controlado, con su receta. */
export interface ControlledBookEntry {
  saleId: number;
  numDoc: string | null;
  /** Cuándo se cobró (ISO). */
  date: string;
  branch: string;
  seller: string | null;
  code: string;
  product: string;
  quantity: number;
  unit: string;
  prescriptionNumber: string | null;
  prescriber: string | null;
  patient: string | null;
}
