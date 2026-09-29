// Acceso a la base para envíos (Prisma).
import type { Prisma } from '@prisma/client';
import type { prisma } from '../../../db.ts';
import type { DeliveryStatus } from '../domain/delivery.ts';

export type Db = Pick<typeof prisma, 'entrega' | 'usuario' | 'venta'>;

const DELIVERY_INCLUDE = {
  cliente: { select: { name: true, phone: true, address: true, doc: true } },
  repartidor: { select: { id: true, name: true } },
  venta: { select: { numDoc: true, status: true, total: true, payMethod: true, branchId: true } },
  detalles: { select: { quantity: true, producto: { select: { name: true, code: true } } } },
} satisfies Prisma.EntregaInclude;

export const findDelivery = (db: Db, id: number) => db.entrega.findUnique({ where: { id }, include: DELIVERY_INCLUDE });

export type DeliveryRow = NonNullable<Awaited<ReturnType<typeof findDelivery>>>;

export const findDeliveries = (db: Db, where: Prisma.EntregaWhereInput, finished: boolean) =>
  db.entrega.findMany({
    where,
    include: DELIVERY_INCLUDE,
    orderBy: finished ? { updatedAt: 'desc' } : { createdAt: 'asc' },
    take: finished ? 100 : undefined,
  });

// Cambia de estado solo si la entrega sigue en uno de los esperados (devuelve false si no).
export async function updateIfStatus(
  db: Db, id: number, fromStatuses: DeliveryStatus[], data: Prisma.EntregaUncheckedUpdateManyInput,
): Promise<boolean> {
  const { count } = await db.entrega.updateMany({ where: { id, status: { in: fromStatuses } }, data });
  return count > 0;
}

export const findCourier = (db: Db, id: number) =>
  db.usuario.findUnique({ where: { id }, select: { id: true, name: true, active: true, role: true, modules: true, branchId: true } });

// Una venta cobrada por su comprobante (para programar su envío después).
export const findPaidSale = (db: Db, numDoc: string) =>
  db.venta.findUnique({
    where: { numDoc: numDoc.trim().toUpperCase() },
    include: {
      cliente: { select: { name: true, phone: true, address: true } },
      entrega: { select: { ref: true } },
      detalles: { select: { productoId: true, quantity: true, unitFactor: true, unitName: true, producto: { select: { name: true } } } },
      branch: { select: { name: true, deliveriesEnabled: true } },
    },
  });
