/**
 * Validadores reutilizables para formularios.
 * Cada función devuelve un string con el mensaje de error, o '' si el valor es válido.
 */

type Value = unknown;

const str = (v: Value) => (v === undefined || v === null ? '' : String(v)).trim();

export const required = (v: Value, label = 'Este campo') =>
  str(v) === '' ? `${label} es obligatorio.` : '';

export const minLength = (v: Value, n: number, label = 'Este campo') =>
  str(v) !== '' && str(v).length < n ? `${label} debe tener al menos ${n} caracteres.` : '';

export const maxLength = (v: Value, n: number, label = 'Este campo') =>
  str(v).length > n ? `${label} no puede superar los ${n} caracteres.` : '';

export const isNumber = (v: Value, label = 'El valor') =>
  str(v) === '' || Number.isNaN(Number(v)) ? `${label} debe ser un número.` : '';

export const isInteger = (v: Value, label = 'El valor') =>
  !Number.isInteger(Number(v)) ? `${label} debe ser un número entero.` : '';

export const isPositive = (v: Value, label = 'El valor') =>
  !(Number(v) > 0) ? `${label} debe ser mayor a 0.` : '';

export const isNonNegative = (v: Value, label = 'El valor') =>
  !(Number(v) >= 0) ? `${label} no puede ser negativo.` : '';

export const min = (v: Value, n: number, label = 'El valor') =>
  Number(v) < n ? `${label} no puede ser menor que ${n}.` : '';

export const max = (v: Value, n: number, label = 'El valor') =>
  Number(v) > n ? `${label} no puede ser mayor que ${n}.` : '';

export const onlyDigits = (v: Value, label = 'Este campo') =>
  str(v) !== '' && !/^\d+$/.test(str(v)) ? `${label} solo admite dígitos.` : '';

export const isDni = (v: Value) =>
  !/^\d{8}$/.test(str(v)) ? 'El DNI debe tener exactamente 8 dígitos.' : '';

export const isRuc = (v: Value) =>
  !/^\d{11}$/.test(str(v)) ? 'El RUC debe tener exactamente 11 dígitos.' : '';

/** DNI (8) o RUC (11) */
export const isDocIdentidad = (v: Value) =>
  /^\d{8}$/.test(str(v)) || /^\d{11}$/.test(str(v))
    ? ''
    : 'Ingrese un DNI (8 dígitos) o RUC (11 dígitos) válido.';

export const isPhone = (v: Value) =>
  str(v) !== '' && !/^\+?\d[\d\s-]{5,14}$/.test(str(v))
    ? 'Teléfono inválido (6 a 15 dígitos).'
    : '';

export const isEmail = (v: Value) =>
  str(v) !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(v))
    ? 'Correo electrónico inválido.'
    : '';

/**
 * Ejecuta una lista de reglas y devuelve el primer mensaje de error encontrado.
 * rules: array de funciones () => string
 */
export const firstError = (...rules: (string | (() => string))[]) => {
  for (const rule of rules) {
    const msg = typeof rule === 'function' ? rule() : rule;
    if (msg) return msg;
  }
  return '';
};

/** Clase de borde para inputs según haya error o no. */
export const borderClass = (hasError: unknown) =>
  hasError ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-orange-500';
