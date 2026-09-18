import { PrismaClient, Prisma } from '@prisma/client';

// Los montos y cantidades se guardan como DECIMAL exacto, pero Prisma los devuelve como objetos
// Decimal: compararlos con < o > compararía texto. Aquí se convierten a número al leer, para que
// el resto del código trabaje con números normales y los valores guardados sigan siendo exactos.
function toPlainNumbers(value) {
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();
  if (Array.isArray(value)) return value.map(toPlainNumbers);
  for (const key of Object.keys(value)) value[key] = toPlainNumbers(value[key]);
  return value;
}

// Cliente único para todo el backend: cada PrismaClient abre su propio grupo de conexiones,
// y con varias empresas en un mismo PostgreSQL eso agota el límite de conexiones.
// El tamaño del grupo se controla con ?connection_limit=N en DATABASE_URL.
export const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        return toPlainNumbers(await query(args));
      },
    },
  },
});
