// Reglas de los reportes: el período (días de Perú), la serie diaria y la rotación de productos.
import { AppError } from '@ferresys/shared/errors';
import { roundMoney, roundQuantity } from '../../utils/quantities.js';

export class ReportError extends AppError {
  static override area = 'REPORTE';
}

export const BUSINESS_TIME_ZONE = 'America/Lima';
const BUSINESS_UTC_OFFSET = '-05:00';
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DAYS = 30;
export const MAX_DAYS = 366;
// Por debajo de esta cobertura (días de venta que alcanza el stock) conviene reponer.
export const LOW_COVERAGE_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

export const PAY_METHOD_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', YAPE_PLIN: 'Yape/Plin', TRANSFERENCIA: 'Transferencia', PAGO_MIXTO: 'Pago mixto', FIADO: 'Fiado',
};

export const todayInLima = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);

const startOfDay = (day: string) => new Date(`${day}T00:00:00.000${BUSINESS_UTC_OFFSET}`);
export const addDays = (day: string, n: number) => new Date(startOfDay(day).getTime() + n * DAY_MS).toISOString().slice(0, 10);

export interface Period {
  from: string;
  to: string;
  days: number;
  /** Inicio del primer día y del día siguiente al último, en hora de Perú. */
  start: Date;
  end: Date;
}

// Sin fechas: los últimos 30 días hasta hoy. Hasta 366 días.
export function parseRange(query: { from?: string; to?: string }, today = todayInLima()): Period {
  for (const day of [query.from, query.to]) {
    if (day && !DAY_PATTERN.test(day)) throw new ReportError('Fecha no válida (use AAAA-MM-DD).');
  }
  const to = query.to || today;
  const from = query.from || addDays(to, -(DEFAULT_DAYS - 1));
  if (Number.isNaN(startOfDay(from).getTime()) || Number.isNaN(startOfDay(to).getTime())) throw new ReportError('Fecha no válida.');
  const days = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS) + 1;
  if (days < 1) throw new ReportError('La fecha inicial debe ser anterior o igual a la final.');
  if (days > MAX_DAYS) throw new ReportError(`El rango no puede superar ${MAX_DAYS} días.`);
  return { from, to, days, start: startOfDay(from), end: new Date(startOfDay(to).getTime() + DAY_MS) };
}

// Ventas por día, incluidos los días sin ventas (para el gráfico).
export function dailySeries(period: Period, rows: readonly { day: string; sales: number; total: number }[]) {
  const byDay = new Map(rows.map(r => [r.day, r]));
  return Array.from({ length: period.days }, (_, i) => {
    const day = addDays(period.from, i);
    const row = byDay.get(day);
    return { day, sales: row?.sales ?? 0, total: roundMoney(row?.total ?? 0) };
  });
}

export interface ProductMovement {
  id: number;
  code: string;
  name: string;
  unit: string;
  stock: number;
  price: number;
  sold: number;
}

// Rotación: cobertura = días de venta que alcanza el stock al ritmo del período. Separa lo que conviene
// reponer (poca cobertura) de lo que no se vendió (sin movimiento, ordenado por el dinero inmovilizado).
export function rotation(products: readonly ProductMovement[], days: number) {
  const rows = products.map(p => {
    const dailyAverage = p.sold / days;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      stock: roundQuantity(p.stock),
      sold: roundQuantity(p.sold),
      dailyAverage: roundQuantity(dailyAverage),
      coverageDays: dailyAverage > 0 ? Math.floor(p.stock / dailyAverage) : null,
      stockValue: roundMoney(Math.max(p.stock, 0) * p.price),
    };
  });
  const lowCoverage = rows
    .filter((p): p is typeof p & { coverageDays: number } => p.coverageDays !== null && p.coverageDays < LOW_COVERAGE_DAYS)
    .sort((a, b) => a.coverageDays - b.coverageDays);
  const noMovement = rows.filter(p => p.sold === 0 && p.stock > 0).sort((a, b) => b.stockValue - a.stockValue);
  return { lowCoverage, noMovement };
}

export const withAverage = <T extends { sales: number; total: number }>(row: T) =>
  ({ ...row, total: roundMoney(row.total), average: row.sales ? roundMoney(row.total / row.sales) : 0 });
