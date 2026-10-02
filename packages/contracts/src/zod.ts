// Zod de todo el sistema. Los esquemas de las peticiones viven en este paquete y el backend los usa para
// validar; el backend importa `z` de aquí para que haya una sola copia de Zod (y una sola configuración).
import { z } from 'zod';

// Los mensajes que Zod arma solo (cuando un esquema no trae el suyo) salen en español: llegan al usuario.
z.config(z.locales.es());

export { z };

// Identificador numérico que puede llegar como número o como texto ("12").
export const id = (message: string) => z.coerce.number({ error: message }).int({ error: message }).positive({ error: message });

// Igual, pero opcional: vacío, null o ausente = sin valor.
// El .optional() de afuera hace que la clave pueda faltar; el de adentro acepta el undefined del preprocess.
export const optionalId = (message: string) =>
  z.preprocess(value => (value === '' || value === null ? undefined : value), id(message).optional()).optional();

// Texto opcional: ausente, null o vacío = null; si no, recortado y con un largo máximo.
// label va con su artículo ("La dirección", "El teléfono") porque abre el mensaje.
export const optionalText = (maxLength: number, label: string) =>
  z.union([z.string(), z.number()], { error: `${label} no es un texto válido.` }).nullish()
    .transform(value => (value === null || value === undefined ? null : String(value).trim() || null))
    .refine(value => value === null || value.length <= maxLength, { error: `${label} no puede superar ${maxLength} caracteres.` });

// Texto libre que se recorta al largo máximo en vez de rechazarse (teléfono, dirección de un cliente).
export const clippedText = (maxLength: number) =>
  z.union([z.string(), z.number()]).nullish()
    .transform(value => (value === null || value === undefined ? null : String(value).trim().slice(0, maxLength) || null));
