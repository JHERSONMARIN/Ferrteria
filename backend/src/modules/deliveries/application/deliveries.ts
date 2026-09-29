// Casos de uso de envíos: programar, asignar repartidor, salir, entregar y cancelar.
import type { Prisma } from '@prisma/client';
import type { prisma } from '../../../db.ts';
import { recordAudit } from '../../audit/index.ts';
import { roundQuantity } from '../../../utils/quantities.ts';
import type { SessionUser } from '../../../types/express.d.ts';
import {
  ACTIVE_STATUSES, DeliveryError, FINISHED_STATUSES, assertBranchDelivers, assertCourierChange, canDeliver,
  cancellationNote, deliveryRef, isWaitingDispatch, parseDeliveryRequest, type DeliveryRequest, type DeliveryStatus,
} from '../domain/delivery.ts';
import * as repo from '../infrastructure/deliveryRepository.ts';
import type { Db, DeliveryRow } from '../infrastructure/deliveryRepository.ts';

type Client = typeof prisma;
type Tx = Pick<typeof prisma, 'entrega'>;

const RECENT_DAYS = 7;
const NOT_DISPATCHED_YET = 'Los productos todavía no salen de almacén: espere a que se despache el pedido.';

// Forma en que la pantalla de Entregas recibe un envío.
export function presentDelivery(d: DeliveryRow) {
  return {
    id: d.id,
    ref: d.ref,
    status: d.status,
    waitingDispatch: isWaitingDispatch(d.venta?.status ?? null),
    address: d.address || d.cliente?.address || 'Sin dirección',
    contactName: d.contactName || d.cliente?.name || 'Cliente sin nombre',
    contactPhone: d.contactPhone || d.cliente?.phone || null,
    notes: d.notes,
    saleNumDoc: d.venta?.numDoc ?? null,
    total: d.venta ? Number(d.venta.total) : null,
    legacy: !d.venta,
    courier: d.repartidor ? { id: d.repartidor.id, name: d.repartidor.name } : null,
    createdAt: d.createdAt,
    departedAt: d.departedAt,
    deliveredAt: d.deliveredAt,
    items: d.detalles.map(dt => ({ name: dt.producto.name, code: dt.producto.code, qty: Number(dt.quantity) })),
  };
}

// Cada sucursal atiende sus envíos; las entregas antiguas (sin venta) las ven todas.
async function loadForUser(db: Db, id: number, user: SessionUser | null) {
  const delivery = await repo.findDelivery(db, id);
  if (!delivery) throw new DeliveryError('La entrega no existe.', 404);
  if (user && delivery.venta && delivery.venta.branchId !== user.branchId) {
    throw new DeliveryError('Este envío es de otra sucursal.', 403);
  }
  return delivery;
}

async function transition(
  db: Db, id: number, from: DeliveryStatus[], data: Prisma.EntregaUncheckedUpdateManyInput, conflictMessage: string,
) {
  if (!(await repo.updateIfStatus(db, id, from, data))) throw new DeliveryError(conflictMessage, 409);
  return presentDelivery(await loadForUser(db, id, null));
}

// El repartidor ve todo lo que sigue en almacén (puede solicitarlo) y, ya despachado, solo lo suyo.
// El administrador y quien atiende la tienda ven todo.
export async function listDeliveries(db: Db, filter: { finished: boolean; ownUserId: number | null; branchId: number | null }) {
  const and: Prisma.EntregaWhereInput[] = [];
  if (filter.branchId) and.push({ OR: [{ venta: { branchId: filter.branchId } }, { ventaId: null }] });
  if (filter.ownUserId) and.push({ OR: [{ repartidorId: filter.ownUserId }, { venta: { status: { not: 'DISPATCHED' } } }] });
  const where: Prisma.EntregaWhereInput = filter.finished
    ? { status: { in: FINISHED_STATUSES }, updatedAt: { gte: new Date(Date.now() - RECENT_DAYS * 86400000) }, AND: and }
    : { status: { in: ACTIVE_STATUSES }, AND: and };
  return (await repo.findDeliveries(db, where, filter.finished)).map(presentDelivery);
}

// Comprueba que el usuario pueda repartir en la sucursal del envío.
export async function assertCanDeliver(db: Db, courierId: number, branchId: number | null) {
  const courier = await repo.findCourier(db, courierId);
  if (!canDeliver(courier, branchId)) throw new DeliveryError('El usuario elegido no puede realizar entregas.');
  return courier!;
}

export async function assignCourier(db: Db, id: number, courierId: number | null, user: SessionUser) {
  const delivery = await loadForUser(db, id, user);
  if (!ACTIVE_STATUSES.includes(delivery.status)) {
    throw new DeliveryError('Solo se puede asignar repartidor a entregas activas.', 409);
  }
  assertCourierChange(user, delivery.repartidor, courierId);
  if (courierId !== null) await assertCanDeliver(db, courierId, delivery.venta?.branchId ?? null);
  await db.entrega.update({ where: { id }, data: { repartidorId: courierId } });
  return presentDelivery(await loadForUser(db, id, null));
}

export async function markDeparted(db: Db, id: number, user: SessionUser) {
  const delivery = await loadForUser(db, id, user);
  if (isWaitingDispatch(delivery.venta?.status ?? null)) throw new DeliveryError(NOT_DISPATCHED_YET, 409);
  return transition(db, id, ['PENDIENTE'], {
    status: 'EN_CAMINO', departedAt: new Date(), repartidorId: delivery.repartidor?.id ?? user.id,
  }, 'Esta entrega ya salió o fue cerrada.');
}

export async function markDelivered(db: Db, id: number, user: SessionUser) {
  const delivery = await loadForUser(db, id, user);
  if (isWaitingDispatch(delivery.venta?.status ?? null)) throw new DeliveryError(NOT_DISPATCHED_YET, 409);
  return transition(db, id, ['PENDIENTE', 'EN_CAMINO'], {
    status: 'ENTREGADO', deliveredAt: new Date(), repartidorId: delivery.repartidor?.id ?? user.id,
  }, 'Esta entrega ya fue cerrada.');
}

// También se cancela en camino: el cliente avisa que lo recoge y el repartidor regresa con todo.
export async function cancelDelivery(client: Client, id: number, user: SessionUser, reason?: string | null) {
  const delivery = await loadForUser(client, id, user);
  if (!delivery.venta) {
    throw new DeliveryError('Esta entrega es anterior al registro de ventas y descontó stock por su cuenta: corríjala desde Kardex.', 409);
  }
  return client.$transaction(async (tx) => {
    const cancelled = await transition(tx, id, ACTIVE_STATUSES, {
      status: 'CANCELADO', notes: cancellationNote(delivery.notes, user.name, reason),
    }, 'Este envío ya fue entregado o cancelado.');
    await recordAudit(tx, {
      action: 'DELIVERY_CANCELLED',
      entity: 'Entrega',
      entityId: id,
      summary: `Envío ${delivery.ref} cancelado${delivery.status === 'EN_CAMINO' ? ' (ya había salido)' : ''}`
        + `${reason?.trim() ? `: ${reason.trim()}` : ''}`,
      details: {
        ref: delivery.ref, address: delivery.address, reason: reason?.trim() || null,
        estado: delivery.status, repartidor: delivery.repartidor?.name ?? null,
      },
      user,
    });
    return cancelled;
  });
}

// Debe ejecutarse dentro de la transacción de la venta o del cobro. lines: en unidades base del stock.
export function scheduleDeliveryForSale(tx: Tx, data: {
  ventaId: number; numDoc: string; clienteId: number | null; delivery: DeliveryRequest;
  lines: { id: number; qty: number; baseQty?: number }[];
}) {
  return tx.entrega.create({
    data: {
      ref: deliveryRef(data.numDoc),
      ...data.delivery,
      clienteId: data.clienteId,
      ventaId: data.ventaId,
      // El envío lleva unidades del stock: una presentación se entrega como sus unidades base.
      detalles: { create: data.lines.map(l => ({ productoId: l.id, quantity: l.baseQty ?? l.qty })) },
    },
    select: { id: true, ref: true, address: true },
  });
}

async function paidSaleOfBranch(db: Db, numDoc: unknown, user: SessionUser) {
  const sale = await repo.findPaidSale(db, String(numDoc ?? ''));
  if (!sale || !['PAID', 'DISPATCHED'].includes(sale.status)) {
    throw new DeliveryError('No se encontró una venta cobrada con ese comprobante.', 404);
  }
  if (sale.branchId !== user.branchId) throw new DeliveryError('Esa venta es de otra sucursal.', 403);
  return sale;
}

// Envío programado después de la venta (el cliente lo pidió tras pagar).
export async function scheduleDeliveryForExistingSale(client: Client, numDoc: unknown, input: Record<string, unknown>, user: SessionUser) {
  const delivery = parseDeliveryRequest({ ...input, type: 'DELIVERY' })!;
  return client.$transaction(async (tx) => {
    const sale = await paidSaleOfBranch(tx, numDoc, user);
    assertBranchDelivers(sale.branch);
    if (sale.entrega) throw new DeliveryError(`Esta venta ya tiene el envío ${sale.entrega.ref}.`, 409);
    const created = await scheduleDeliveryForSale(tx, {
      ventaId: sale.id,
      numDoc: sale.numDoc!,
      clienteId: sale.clienteId,
      lines: sale.detalles.map(d => ({ id: d.productoId, qty: Number(d.quantity), baseQty: roundQuantity(Number(d.quantity) * Number(d.unitFactor)) })),
      delivery,
    });
    return presentDelivery(await loadForUser(tx, created.id, null));
  });
}

// Vista previa de una venta para programar su envío.
export async function findSaleForDelivery(db: Db, numDoc: unknown, user: SessionUser) {
  const sale = await paidSaleOfBranch(db, numDoc, user);
  return {
    // Se buscó por su número: siempre lo tiene.
    numDoc: sale.numDoc ?? String(numDoc),
    total: Number(sale.total),
    existingDelivery: sale.entrega?.ref ?? null,
    customer: sale.cliente ? { name: sale.cliente.name, phone: sale.cliente.phone, address: sale.cliente.address } : null,
    items: sale.detalles.map(d => ({ name: d.unitName ? `${d.producto.name} (${d.unitName})` : d.producto.name, qty: Number(d.quantity) })),
  };
}
