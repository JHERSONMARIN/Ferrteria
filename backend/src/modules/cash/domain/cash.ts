// Cajas físicas y turnos compartidos: reglas puras. Un turno pertenece a una caja y puede tener varios
// cajeros; el arqueo es del turno, no de cada persona.
import { AppError } from '@ferresys/shared/errors';
import { roundMoney } from '../../../utils/quantities.ts';

export class CashError extends AppError {
  static override area = 'CAJA';
}

export const MAX_AMOUNT = 1_000_000;
export const MAX_REGISTER_NAME = 40;
// Turnos abiertos antes de que existieran las cajas físicas (Fase 6).
export const LEGACY_REGISTER_NAME = 'Caja personal (anterior)';

export type PayMethod = 'EFECTIVO' | 'TARJETA' | 'YAPE_PLIN' | 'TRANSFERENCIA' | 'PAGO_MIXTO' | 'FIADO';

export interface CashUser {
  id: number;
  role: string;
  branchId: number;
}

export interface SaleForCash {
  total: number;
  payMethod: PayMethod;
  mixCash: number | null;
  mixDigital: number | null;
  paidById: number | null;
  paidByName: string | null;
}

export interface CashierTotals {
  userId: number | null;
  name: string;
  sales: number;
  cash: number;
  digital: number;
}

export interface SalesSummary {
  cash: number;
  digital: number;
  byCashier: CashierTotals[];
}

export const isAdmin = (user: Pick<CashUser, 'role'>) => user.role === 'ADMINISTRADOR';

// Efectivo y digital del turno, en total y por cajero. El fiado no entra a la caja.
export function summarizeSales(sales: readonly SaleForCash[]): SalesSummary {
  const byCashier = new Map<number, CashierTotals>();
  let cash = 0;
  let digital = 0;
  for (const sale of sales) {
    let saleCash = 0;
    let saleDigital = 0;
    if (sale.payMethod === 'EFECTIVO') saleCash = sale.total;
    else if (sale.payMethod === 'PAGO_MIXTO') {
      saleCash = sale.mixCash ?? 0;
      saleDigital = sale.mixDigital ?? 0;
    } else if (sale.payMethod !== 'FIADO') saleDigital = sale.total;
    cash += saleCash;
    digital += saleDigital;

    const key = sale.paidById ?? 0;
    const entry = byCashier.get(key)
      ?? { userId: sale.paidById, name: sale.paidByName ?? 'Sin registrar', sales: 0, cash: 0, digital: 0 };
    entry.sales += 1;
    entry.cash += saleCash;
    entry.digital += saleDigital;
    byCashier.set(key, entry);
  }
  return {
    cash: roundMoney(cash),
    digital: roundMoney(digital),
    byCashier: [...byCashier.values()].map(e => ({ ...e, cash: roundMoney(e.cash), digital: roundMoney(e.digital) })),
  };
}

// Lo que debería haber en efectivo: el monto con que se abrió más lo cobrado en efectivo.
export const expectedCash = (openingAmount: number, summary: SalesSummary) => roundMoney(openingAmount + summary.cash);

// Positiva si sobra dinero, negativa si falta.
export const closingDifference = (counted: number, expected: number) => roundMoney(counted - expected);

export function parseAmount(value: unknown, label: string): number {
  const amount = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    throw new CashError(`${label} debe ser un monto entre 0 y ${MAX_AMOUNT}.`);
  }
  return roundMoney(amount);
}

export function parseRegisterName(value: unknown): string {
  const name = String(value ?? '').trim();
  if (name.length < 2 || name.length > MAX_REGISTER_NAME) {
    throw new CashError(`El nombre de la caja debe tener entre 2 y ${MAX_REGISTER_NAME} caracteres.`);
  }
  return name;
}

// El arqueo lo hace cualquiera de los cajeros del turno, o un administrador.
export function assertCanClose(user: CashUser, memberIds: readonly number[]): void {
  if (!isAdmin(user) && !memberIds.includes(user.id)) {
    throw new CashError('Solo un cajero del turno puede cerrarlo.', 403);
  }
}

// Salir sin cerrar deja lo cobrado en el turno; el último cajero no puede irse sin hacer el arqueo.
// Devuelve el registro de pertenencia del usuario, que es el que se marca como salido.
export function membershipToLeave<T extends { userId: number }>(members: readonly T[], userId: number): T {
  const own = members.find(m => m.userId === userId);
  if (!own) throw new CashError('No está en este turno.', 404);
  if (members.length === 1) throw new CashError('Es el único cajero del turno: ciérrelo con el arqueo en lugar de salir.', 409);
  return own;
}

// Una caja con turno abierto no se desactiva, y en cada sucursal debe quedar una activa.
// otherActiveInBranch: null si la caja ya estaba desactivada (no cambia cuántas quedan).
export function assertCanDeactivate(hasOpenSession: boolean, otherActiveInBranch: number | null): void {
  if (hasOpenSession) throw new CashError('No se puede desactivar una caja con un turno abierto.', 409);
  if (otherActiveInBranch === 0) throw new CashError('Debe quedar al menos una caja activa en la sucursal.', 409);
}

// Mover de sucursal una caja con turno abierto dejaría ventas de una sucursal en la caja de otra.
export function assertCanMove(hasOpenSession: boolean): void {
  if (hasOpenSession) throw new CashError('No se puede mover de sucursal una caja con un turno abierto.', 409);
}
