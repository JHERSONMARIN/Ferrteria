// Clientes, lista de precios y crédito (módulo customers del backend).
import { clippedText, id, z } from './zod.ts';

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

// ---------- Lo que envía la pantalla ----------

/** Tipo de cliente como lo elige el formulario; también se acepta el código (NATURAL, EMPRESA). */
export type CustomerTypeLabel = 'Natural' | 'Empresa';

const customerType = z.enum(['Natural', 'Empresa', 'NATURAL', 'EMPRESA'], { error: 'Tipo de cliente no válido.' }).optional()
  .transform((type): CustomerType => (type === 'Empresa' || type === 'EMPRESA' ? 'EMPRESA' : 'NATURAL'));
const docText = z.union([z.string(), z.number()]).optional().transform(value => String(value ?? '').trim());

// DNI de 8 dígitos para personas, RUC de 11 para empresas; nombre de al menos 3 letras.
export function identityProblem(type: CustomerType, doc: string, name: string): string | null {
  if (type === 'EMPRESA' && !/^\d{11}$/.test(doc)) return 'El RUC debe tener 11 dígitos.';
  if (type === 'NATURAL' && !/^\d{8}$/.test(doc)) return 'El DNI debe tener 8 dígitos.';
  if (name.length < 3) return 'El nombre debe tener al menos 3 caracteres.';
  return null;
}

const contactFields = {
  phone: clippedText(30),
  email: clippedText(120),
  address: clippedText(250),
};

/**
 * POST /api/clientes. El documento no se revisa aquí (el POS registra clientes al vuelo); sin límite de
 * crédito válido queda el de siempre (null = el del servidor).
 */
export const CreateCustomerBody = z.object({
  type: customerType,
  doc: docText.refine(doc => doc.length > 0, { error: 'El documento y nombre son requeridos.' }),
  name: docText.refine(name => name.length > 0, { error: 'El documento y nombre son requeridos.' }),
  ...contactFields,
  maxCredit: z.union([z.number(), z.string()]).nullish()
    .transform(value => { const n = parseFloat(String(value)); return Number.isFinite(n) && n > 0 ? n : null; }),
  priceList: z.string().optional().transform((list): PriceList => (list === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL')),
});
export type CreateCustomerRequest = z.input<typeof CreateCustomerBody>;

/** PUT /api/clientes/:id. El crédito y la lista de precios se cambian por sus propias rutas. */
export const UpdateCustomerBody = z.object({
  type: customerType,
  doc: docText,
  name: docText,
  ...contactFields,
}).superRefine((data, ctx) => {
  const problem = identityProblem(data.type, data.doc, data.name);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
}).transform(data => ({ ...data, name: data.name.slice(0, 120) }));
export type UpdateCustomerRequest = z.input<typeof UpdateCustomerBody>;

/** PUT /api/clientes/:id/max-credit */
export const CreditLimitBody = z.object({
  maxCredit: z.coerce.number({ error: 'Monto de crédito máximo no válido.' }).min(0, { error: 'Monto de crédito máximo no válido.' }),
});
export type CreditLimitRequest = z.input<typeof CreditLimitBody>;

/** PUT /api/clientes/:id/price-list */
export const PriceListBody = z.object({ priceList: z.enum(['RETAIL', 'WHOLESALE'], { error: 'Lista de precios no válida.' }) });
export type PriceListRequest = z.input<typeof PriceListBody>;

/** Un movimiento de la cuenta de crédito: un cargo (venta al fiado) o un abono. */
export interface CreditMovement {
  id: number;
  /** Fecha y hora para mostrar (es-PE). */
  date: string;
  type: 'CARGO' | 'ABONO';
  amount: number;
  docRef: string | null;
  desc: string | null;
}

/** GET /api/creditos: las cuentas con deuda, de mayor a menor. */
export interface CreditAccount {
  id: number;
  clienteId: number;
  name: string;
  doc: string;
  phone: string | null;
  debt: number;
  maxCredit: number;
  availableCredit: number;
  lastPurchase: string | null;
  abonos: CreditMovement[];
}

/** POST /api/creditos/abono */
export const CreditPaymentBody = z.object({
  clienteId: id('Cliente y monto válido requeridos.'),
  amount: z.coerce.number({ error: 'Cliente y monto válido requeridos.' }).positive({ error: 'Cliente y monto válido requeridos.' }),
});
export type CreditPaymentRequest = z.input<typeof CreditPaymentBody>;

export interface CreditPaymentSaved {
  success: true;
  /** N° del recibo. */
  docRef: string;
}
