// Cantidades y dinero: redondeo exacto (3 decimales para cantidades, 2 para dinero) y validación de cantidades.
// Lo usan los esquemas de este paquete y el backend (backend/src/utils/quantities.ts).
export const MAX_QUANTITY_DECIMALS = 3;

export const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;
export const roundMoney = (value: number) => Math.round(value * 100) / 100;

// Motivo por el que una cantidad no es válida para un producto, o null si es válida.
export function quantityProblem(qty: number, allowsFractions: boolean): string | null {
  if (!Number.isFinite(qty) || qty <= 0) return 'debe ser mayor a 0';
  if (roundQuantity(qty) !== qty) return `admite como máximo ${MAX_QUANTITY_DECIMALS} decimales`;
  if (!allowsFractions && !Number.isInteger(qty)) return 'se vende solo por unidades enteras';
  return null;
}
