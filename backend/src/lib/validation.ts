// Validación de la entrada de la API con Zod: la forma del dato se declara una vez y de ahí sale su tipo.
// Los esquemas de las peticiones están en @ferresys/contracts (los comparte con las pantallas); aquí solo
// se aplican. Si no cuadra, se responde 400 con el mensaje del primer problema (los mensajes van en cada esquema).
import { z } from '@ferresys/contracts/zod';
import { AppError } from '@ferresys/shared/errors';

export { id, optionalId } from '@ferresys/contracts/zod';

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
