// Cajas, turnos y arqueo (módulo cash del backend).
import type { IsoDate } from './common.ts';
import { roundMoney } from './quantities.ts';
import { id, optionalId, z } from './zod.ts';

export interface CashierTotals {
  userId: number | null;
  name: string;
  sales: number;
  cash: number;
  digital: number;
}

/** El turno abierto en el que está el usuario. */
export interface CashSession {
  id: number;
  /** id null: caja personal de antes de que existieran las cajas físicas. */
  register: { id: number | null; name: string };
  openedBy: string;
  montoInicial: number;
  ventasEfectivo: number;
  ventasDigital: number;
  saldoTeoricoEfectivo: number;
  byCashier: CashierTotals[];
  members: { id: number; name: string; joinedAt: IsoDate }[];
  /** Fecha y hora para mostrar (es-PE). */
  createdAt: string;
  openedAt: IsoDate;
}

/** Una caja de la sucursal, con su turno abierto si lo tiene: para abrirla o unirse. */
export interface RegisterToJoin {
  id: number;
  name: string;
  session: { id: number; openedBy: string; openedAt: IsoDate; members: string[] } | null;
}

/** GET /api/caja/estado-actual */
export type CashStatus =
  | { abierta: true; caja: CashSession; registers: RegisterToJoin[] }
  | { abierta: false; caja: null; registers: RegisterToJoin[] };

// ---------- Lo que envía la pantalla ----------

export const MAX_AMOUNT = 1_000_000;
export const MAX_REGISTER_NAME = 40;

// Monto contado en caja: entre 0 y el máximo, redondeado a céntimos. label abre el mensaje ("El conteo").
export const cashAmount = (label: string) => {
  const message = `${label} debe ser un monto entre 0 y ${MAX_AMOUNT}.`;
  return z.union([z.number(), z.string()], { error: message }).nullish().transform((value, ctx) => {
    const amount = Number(value);
    if (value === '' || value === null || value === undefined || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return roundMoney(amount);
  });
};

const REGISTER_NAME_ERROR = `El nombre de la caja debe tener entre 2 y ${MAX_REGISTER_NAME} caracteres.`;
export const registerName = z.union([z.string(), z.number()], { error: REGISTER_NAME_ERROR }).nullish()
  .transform(value => String(value ?? '').trim())
  .refine(name => name.length >= 2 && name.length <= MAX_REGISTER_NAME, { error: REGISTER_NAME_ERROR });

/** POST /api/caja/apertura (sin cashRegisterId, la única caja activa de la sucursal). */
export const OpenCashBody = z.object({
  cashRegisterId: optionalId('Caja no válida.'),
  montoInicial: cashAmount('El monto inicial'),
});
export type OpenCashRequest = z.input<typeof OpenCashBody>;

/** POST /api/caja/cierre */
export const CloseCashBody = z.object({
  cajaId: id('Identificador no válido.'),
  montoCierreConteo: cashAmount('El conteo'),
});
export type CloseCashRequest = z.input<typeof CloseCashBody>;

export interface CashClosed {
  success: true;
  saldoTeorico: number;
  /** Contado menos teórico: positivo = sobrante, negativo = faltante. */
  diferencia: number;
}

/** Una caja física: GET /api/caja/registros (solo administrador). */
export interface CashRegister {
  id: number;
  name: string;
  active: boolean;
  branchId: number;
  branch: { id: number; name: string };
  /** Hay un turno abierto en esta caja. */
  isOpen: boolean;
}

/** POST /api/caja/registros (sin branchId, en la sucursal del administrador). */
export const CreateRegisterBody = z.object({ name: registerName, branchId: optionalId('Sucursal no válida.') });
export type CreateRegisterRequest = z.input<typeof CreateRegisterBody>;

/** PUT /api/caja/registros/:id (solo lo que cambia). */
export const UpdateRegisterBody = z.object({
  name: registerName.optional(),
  branchId: optionalId('Sucursal no válida.'),
  active: z.boolean({ error: 'Estado no válido.' }).optional(),
});
export type UpdateRegisterRequest = z.input<typeof UpdateRegisterBody>;
