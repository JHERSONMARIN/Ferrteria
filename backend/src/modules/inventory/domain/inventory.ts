// Inventario: stock por sucursal, movimientos de kardex y transferencias. Reglas puras.
// Disponible = stock - reservado (lo reservado son pedidos sin despachar).
import { AppError } from '@ferresys/shared/errors';
import { roundQuantity } from '../../../utils/quantities.ts';

export class StockError extends AppError {
  static override area = 'STOCK';

  // Casi siempre es falta de stock en la sucursal: 409 por defecto.
  constructor(message: string, status = 409, codigo: string | null = null) {
    super(message, status, codigo);
  }
}

export class TransferError extends AppError {
  static override area = 'TRANSFERENCIA';
}

export type MovementType = 'ENTRADA' | 'SALIDA';

export const transferNumber = (id: number) => `TRF-${String(id).padStart(6, '0')}`;

export const insufficientStockMessage = (productName: string, available: number) =>
  `Stock insuficiente para ${productName}. Disponible: ${available}.`;

export interface TransferItem {
  id: number;
  qty: number;
}

// Suma los productos repetidos y los ordena por id: las transferencias simultáneas bloquean filas en el
// mismo orden y así no se traban entre sí. La forma de cada línea la valida TransferBody.
export function normalizeTransferItems(items: readonly TransferItem[]): TransferItem[] {
  const quantities = new Map<number, number>();
  for (const item of items) quantities.set(item.id, roundQuantity((quantities.get(item.id) ?? 0) + item.qty));
  return [...quantities].map(([id, qty]) => ({ id, qty })).sort((a, b) => a.id - b.id);
}

export type KardexPeriod = 'today' | 'week' | 'month' | 'all' | 'custom';

// Rango de fechas de un período del kardex, en la hora local del servidor (Lima). Sin límites = todo.
export function periodRange(period: string, now: Date, startDate?: string, endDate?: string): { gte?: Date; lte?: Date } | null {
  if (period === 'today') return { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { gte: start };
  }
  if (period === 'month') return { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
  if (period === 'custom' && (startDate || endDate)) {
    const range: { gte?: Date; lte?: Date } = {};
    if (startDate) {
      range.gte = new Date(startDate);
      range.gte.setHours(0, 0, 0, 0);
    }
    if (endDate) {
      range.lte = new Date(endDate);
      range.lte.setHours(23, 59, 59, 999);
    }
    return range;
  }
  return null;
}

export function movementTotals(movements: readonly { type: string; qty: number }[]) {
  const totalIn = movements.filter(m => m.type === 'ENTRADA').reduce((sum, m) => sum + m.qty, 0);
  const totalOut = movements.filter(m => m.type === 'SALIDA').reduce((sum, m) => sum + m.qty, 0);
  return { totalIn, totalOut, netBalance: totalIn - totalOut, movementCount: movements.length };
}
