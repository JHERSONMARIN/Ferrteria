/**
 * Validadores reutilizables para formularios (src/utils/validators.js)
 * Cada función devuelve un string con el mensaje de error, o '' si el valor es válido.
 */

const str = (v) => (v === undefined || v === null ? '' : String(v)).trim();

export const required = (v, label = 'Este campo') =>
  str(v) === '' ? `${label} es obligatorio.` : '';

export const minLength = (v, n, label = 'Este campo') =>
  str(v) !== '' && str(v).length < n ? `${label} debe tener al menos ${n} caracteres.` : '';

export const maxLength = (v, n, label = 'Este campo') =>
  str(v).length > n ? `${label} no puede superar los ${n} caracteres.` : '';

export const isNumber = (v, label = 'El valor') =>
  str(v) === '' || isNaN(Number(v)) ? `${label} debe ser un número.` : '';

export const isInteger = (v, label = 'El valor') =>
  !Number.isInteger(Number(v)) ? `${label} debe ser un número entero.` : '';

export const isPositive = (v, label = 'El valor') =>
  !(Number(v) > 0) ? `${label} debe ser mayor a 0.` : '';

export const isNonNegative = (v, label = 'El valor') =>
  !(Number(v) >= 0) ? `${label} no puede ser negativo.` : '';

export const min = (v, n, label = 'El valor') =>
  Number(v) < n ? `${label} no puede ser menor que ${n}.` : '';

export const max = (v, n, label = 'El valor') =>
  Number(v) > n ? `${label} no puede ser mayor que ${n}.` : '';

export const onlyDigits = (v, label = 'Este campo') =>
  str(v) !== '' && !/^\d+$/.test(str(v)) ? `${label} solo admite dígitos.` : '';

export const isDni = (v) =>
  !/^\d{8}$/.test(str(v)) ? 'El DNI debe tener exactamente 8 dígitos.' : '';

export const isRuc = (v) =>
  !/^\d{11}$/.test(str(v)) ? 'El RUC debe tener exactamente 11 dígitos.' : '';

/** DNI (8) o RUC (11) */
export const isDocIdentidad = (v) =>
  /^\d{8}$/.test(str(v)) || /^\d{11}$/.test(str(v))
    ? ''
    : 'Ingrese un DNI (8 dígitos) o RUC (11 dígitos) válido.';

export const isPhone = (v) =>
  str(v) !== '' && !/^\+?\d[\d\s-]{5,14}$/.test(str(v))
    ? 'Teléfono inválido (6 a 15 dígitos).'
    : '';

export const isEmail = (v) =>
  str(v) !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(v))
    ? 'Correo electrónico inválido.'
    : '';

/**
 * Ejecuta una lista de reglas y devuelve el primer mensaje de error encontrado.
 * rules: array de funciones () => string
 */
export const firstError = (...rules) => {
  for (const rule of rules) {
    const msg = typeof rule === 'function' ? rule() : rule;
    if (msg) return msg;
  }
  return '';
};

/** Clase de borde para inputs según haya error o no. */
export const borderClass = (hasError) =>
  hasError ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-orange-500';
