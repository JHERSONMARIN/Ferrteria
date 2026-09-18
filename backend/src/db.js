import { PrismaClient } from '@prisma/client';

// Cliente único para todo el backend: cada PrismaClient abre su propio grupo de conexiones,
// y con varias empresas en un mismo PostgreSQL eso agota el límite de conexiones.
// El tamaño del grupo se controla con ?connection_limit=N en DATABASE_URL.
export const prisma = new PrismaClient();
