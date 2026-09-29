// Tipos que comparten todos los contratos.

/** Fecha y hora en texto ISO 8601, como la entrega JSON ("2026-09-28T15:04:05.000Z"). */
export type IsoDate = string;

/** Día sin hora ("2026-09-28"). */
export type IsoDay = string;

/** Respuesta de una operación que modifica datos. */
export interface Success {
  success: true;
}

/** Cuerpo de un error de la API (ver @ferresys/shared/errors). */
export interface ApiErrorBody {
  error: string;
  codigo?: string;
  requestId?: string;
}

/** Un Decimal de Prisma: backend/src/db.ts lo convierte en número al leerlo de la base. */
interface DecimalLike {
  toNumber(): number;
}

/**
 * Lo que el servidor puede pasar a res.json() para responder T. Donde el contrato dice texto puede ir un
 * Date (JSON lo convierte en texto ISO), y donde dice número, un Decimal de Prisma (que ya llega convertido).
 * Se usa solo en el backend, con `satisfies`.
 */
export type Sendable<T> =
  T extends string ? T | Date
    : T extends number ? T | DecimalLike
      : T extends readonly (infer U)[] ? readonly Sendable<U>[]
        : T extends object ? { [K in keyof T]: Sendable<T[K]> }
          : T;
