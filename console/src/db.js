// Un solo cliente Prisma para toda la consola (base ferresys_control).
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
