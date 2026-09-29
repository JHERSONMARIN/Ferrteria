// Validación de la entrada de la API con Zod: la forma del dato se declara una vez y de ahí sale su tipo.
// Si no cuadra, se responde 400 con el mensaje del primer problema (los mensajes van en cada esquema).
import { z } from 'zod';
import { AppError } from '@ferresys/shared/errors';

// makeError: el error del módulo (CashError, VentaError…), para que el código lleve su área.
export function parseInput<S extends z.ZodType>(
  schema: S,
  value: unknown,
  makeError: (message: string) => AppError,
): z.infer<S> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw makeError(result.error.issues[0]?.message ?? 'Datos no válidos.');
  return result.data;
}

// Identificador numérico que puede llegar como número o como texto ("12").
export const id = (message: string) => z.coerce.number({ error: message }).int({ error: message }).positive({ error: message });

// Igual, pero opcional: vacío, null o ausente = sin valor.
export const optionalId = (message: string) =>
  z.preprocess(value => (value === '' || value === null ? undefined : value), id(message).optional());
