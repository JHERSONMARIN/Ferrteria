// Mismas reglas que el backend (backend/src/utils/quantities.js).
export const MAX_QUANTITY_DECIMALS = 3;

export const roundQuantity = (value) => Math.round(value * 1000) / 1000;

export function quantityProblem(qty, allowsFractions) {
  if (!Number.isFinite(qty) || qty <= 0) return 'debe ser mayor a 0';
  if (roundQuantity(qty) !== qty) return `admite como máximo ${MAX_QUANTITY_DECIMALS} decimales`;
  if (!allowsFractions && !Number.isInteger(qty)) return 'debe ser un número entero';
  return null;
}

// 2.500 → "2.5", 3 → "3"
export const formatQuantity = (qty) => String(roundQuantity(Number(qty) || 0));

// Unidades que normalmente se venden fraccionadas: al elegirlas se sugiere activar la opción.
export const FRACTIONAL_UNITS = ['Metro', 'Kilo', 'Galón', 'Litro'];
