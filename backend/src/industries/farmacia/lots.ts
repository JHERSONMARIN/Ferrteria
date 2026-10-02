// Reglas de los lotes de farmacia, sin base de datos: qué datos trae una entrada y de qué lotes sale una salida.
import { z } from '@ferresys/contracts/zod';
import { AppError } from '@ferresys/shared/errors';
import { roundQuantity } from '../../utils/quantities.ts';

export class PharmacyError extends AppError {
  static override area = 'FARMACIA';
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value: string) => DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

// Lote de una entrada: número y vencimiento juntos, o ninguno (entra "sin lote").
export const stockEntry = z.object({
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

export interface EntryLot {
  lotNumber: string;
  expiresAt: string;
}

export const entryLotOf = (data: Record<string, unknown> | undefined): EntryLot | null =>
  typeof data?.lotNumber === 'string' && typeof data.expiresAt === 'string' ? { lotNumber: data.lotNumber, expiresAt: data.expiresAt } : null;

/** Un lote con saldo en una sucursal. expiresAt: AAAA-MM-DD. */
export interface LotBalance {
  id: number;
  lotNumber: string;
  expiresAt: string;
  quantity: number;
}

/** Lo que sale de un lote; lotId null = de lo que no tiene lote. */
export interface Take {
  lotId: number | null;
  lotNumber: string | null;
  expiresAt: string | null;
  qty: number;
}

// Perú no tiene horario de verano: el día de la farmacia es el de Lima.
export const todayInLima = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

// Un lote está vencido desde el día siguiente a su fecha de vencimiento.
export const isExpired = (expiresAt: string, today: string) => expiresAt < today;

// De dónde sale una cantidad: primero lo que vence antes (FEFO) y al final lo que no tiene lote. Una venta no
// toma lotes vencidos; una salida manual o una transferencia sí (así se retira lo vencido). missing > 0 = no
// alcanza con lo permitido.
export function planTakes(
  lots: readonly LotBalance[], unlotted: number, qty: number, today: string, options: { includeExpired: boolean },
): { takes: Take[]; missing: number } {
  const usable = lots
    .filter(lot => lot.quantity > 0 && (options.includeExpired || !isExpired(lot.expiresAt, today)))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.id - b.id);
  const takes: Take[] = [];
  let remaining = roundQuantity(qty);
  for (const lot of usable) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity, remaining);
    takes.push({ lotId: lot.id, lotNumber: lot.lotNumber, expiresAt: lot.expiresAt, qty: take });
    remaining = roundQuantity(remaining - take);
  }
  if (remaining > 0 && unlotted > 0) {
    const take = Math.min(unlotted, remaining);
    takes.push({ lotId: null, lotNumber: null, expiresAt: null, qty: take });
    remaining = roundQuantity(remaining - take);
  }
  return { takes, missing: remaining };
}

// Lo que no tiene lote: el stock de la sucursal menos lo que está en lotes.
export const unlottedQuantity = (branchStock: number, lots: readonly LotBalance[]) =>
  Math.max(0, roundQuantity(branchStock - lots.reduce((sum, lot) => sum + lot.quantity, 0)));
