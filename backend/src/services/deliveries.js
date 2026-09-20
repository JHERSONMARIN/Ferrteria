// Envíos a domicilio. Una entrega nace de una venta cobrada y no mueve stock: el stock ya lo
// descontó la venta (modo directo / caja) o lo descontará el despacho (modo por etapas).

import { recordAudit } from './audit.js';

export class DeliveryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const DELIVERY_INCLUDE = {
  cliente: { select: { name: true, phone: true, address: true, doc: true } },
  repartidor: { select: { id: true, name: true } },
  venta: { select: { numDoc: true, status: true, total: true, payMethod: true, branchId: true } },
  detalles: { select: { quantity: true, producto: { select: { name: true, code: true } } } },
};

const trimOrNull = (value, max) => {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text ? text.slice(0, max) : null;
};

// La sucursal debe tener activados los envíos (Configuración → Modo de trabajo).
export function assertBranchDelivers(branch) {
  if (branch && branch.deliveriesEnabled === false) {
    throw new DeliveryError(`${branch.name} no hace envíos a domicilio.`, 400);
  }
}

// Cada sucursal atiende sus envíos. Las entregas antiguas (sin venta) las ven todas.
function assertSameBranch(delivery, user) {
  if (user && delivery.venta && delivery.venta.branchId !== user.branchId) {
    throw new DeliveryError('Este envío es de otra sucursal.', 403);
  }
}

// Datos de envío que llegan con el cobro. Devuelve null si el cliente se lleva los productos.
export function parseDeliveryRequest(input) {
  if (!input || input.type !== 'DELIVERY') return null;

  const address = String(input.address ?? '').trim();
  if (address.length < 5) throw new DeliveryError('Ingrese la dirección de entrega (mínimo 5 caracteres).');
  if (address.length > 250) throw new DeliveryError('La dirección no puede superar 250 caracteres.');

  const contactPhone = trimOrNull(input.contactPhone, 30);
  if (contactPhone && !/^[0-9+\s()-]{6,30}$/.test(contactPhone)) {
    throw new DeliveryError('El teléfono de contacto no es válido.');
  }

  return {
    address,
    contactName: trimOrNull(input.contactName, 120),
    contactPhone,
    notes: trimOrNull(input.notes, 300),
  };
}

// Debe ejecutarse dentro de la transacción de la venta o del cobro.
export async function scheduleDeliveryForSale(tx, { ventaId, numDoc, clienteId, lines, delivery }) {
  return tx.entrega.create({
    data: {
      ref: `ENT-${numDoc}`,
      ...delivery,
      clienteId,
      ventaId,
      detalles: { create: lines.map(l => ({ productoId: l.id, quantity: l.qty })) },
    },
    select: { id: true, ref: true, address: true },
  });
}

// Los productos solo pueden salir a reparto cuando ya dejaron el almacén.
const isWaitingDispatch = (delivery) => Boolean(delivery.venta) && delivery.venta.status !== 'DISPATCHED';

export function formatDelivery(d) {
  return {
    id: d.id,
    ref: d.ref,
    status: d.status,
    waitingDispatch: isWaitingDispatch(d),
    address: d.address || d.cliente?.address || 'Sin dirección',
    contactName: d.contactName || d.cliente?.name || 'Cliente sin nombre',
    contactPhone: d.contactPhone || d.cliente?.phone || null,
    notes: d.notes,
    saleNumDoc: d.venta?.numDoc ?? null,
    total: d.venta?.total ?? null,
    legacy: !d.venta,
    courier: d.repartidor ? { id: d.repartidor.id, name: d.repartidor.name } : null,
    createdAt: d.createdAt,
    departedAt: d.departedAt,
    deliveredAt: d.deliveredAt,
    items: d.detalles.map(dt => ({ name: dt.producto.name, code: dt.producto.code, qty: dt.quantity })),
  };
}

const RECENT_DAYS = 7;

export async function listDeliveries(db, { finished = false, onlyUserId = null, branchId = null } = {}) {
  const where = finished
    ? { status: { in: ['ENTREGADO', 'CANCELADO'] }, updatedAt: { gte: new Date(Date.now() - RECENT_DAYS * 86400000) } }
    : { status: { in: ['PENDIENTE', 'EN_CAMINO'] } };
  where.AND = [];
  // Cada sucursal ve sus envíos (las entregas antiguas, sin venta, las ven todas).
  if (branchId) where.AND.push({ OR: [{ venta: { branchId } }, { ventaId: null }] });
  // "Mis entregas": las asignadas al repartidor y las que nadie tomó todavía.
  if (onlyUserId) where.AND.push({ OR: [{ repartidorId: onlyUserId }, { repartidorId: null }] });

  const deliveries = await db.entrega.findMany({
    where,
    include: DELIVERY_INCLUDE,
    orderBy: finished ? { updatedAt: 'desc' } : { createdAt: 'asc' },
    take: finished ? 100 : undefined,
  });
  return deliveries.map(formatDelivery);
}

async function findDelivery(db, id, user = null) {
  const delivery = await db.entrega.findUnique({ where: { id }, include: DELIVERY_INCLUDE });
  if (!delivery) throw new DeliveryError('La entrega no existe.', 404);
  assertSameBranch(delivery, user);
  return delivery;
}

// Cambia de estado solo si la entrega sigue en uno de los estados esperados.
async function transition(db, id, fromStatuses, data, conflictMessage) {
  const { count } = await db.entrega.updateMany({ where: { id, status: { in: fromStatuses } }, data });
  if (count === 0) throw new DeliveryError(conflictMessage, 409);
  return formatDelivery(await findDelivery(db, id));
}

export async function assignCourier(db, id, courierId, user) {
  const delivery = await findDelivery(db, id, user);
  if (!['PENDIENTE', 'EN_CAMINO'].includes(delivery.status)) {
    throw new DeliveryError('Solo se puede asignar repartidor a entregas activas.', 409);
  }
  if (courierId !== null) {
    const courier = await db.usuario.findUnique({ where: { id: courierId }, select: { active: true, role: true, modules: true, branchId: true } });
    const canDeliver = courier && courier.active && (!delivery.venta || courier.branchId === delivery.venta.branchId) && (
      courier.role === 'ADMINISTRADOR' || courier.role === 'REPARTIDOR' || (Array.isArray(courier.modules) && courier.modules.includes('deliveries'))
    );
    if (!canDeliver) throw new DeliveryError('El usuario elegido no puede realizar entregas.');
  }
  await db.entrega.update({ where: { id }, data: { repartidorId: courierId } });
  return formatDelivery(await findDelivery(db, id));
}

export async function markDeparted(db, id, user) {
  const delivery = await findDelivery(db, id, user);
  if (isWaitingDispatch(delivery)) {
    throw new DeliveryError('Los productos todavía no salen de almacén: espere a que se despache el pedido.', 409);
  }
  return transition(db, id, ['PENDIENTE'], {
    status: 'EN_CAMINO',
    departedAt: new Date(),
    repartidorId: delivery.repartidor?.id ?? user.id,
  }, 'Esta entrega ya salió o fue cerrada.');
}

export async function markDelivered(db, id, user) {
  const delivery = await findDelivery(db, id, user);
  if (isWaitingDispatch(delivery)) {
    throw new DeliveryError('Los productos todavía no salen de almacén: espere a que se despache el pedido.', 409);
  }
  return transition(db, id, ['PENDIENTE', 'EN_CAMINO'], {
    status: 'ENTREGADO',
    deliveredAt: new Date(),
    repartidorId: delivery.repartidor?.id ?? user.id,
  }, 'Esta entrega ya fue cerrada.');
}

export async function cancelDelivery(db, id, user, reason) {
  const delivery = await findDelivery(db, id, user);
  if (!delivery.venta) {
    throw new DeliveryError('Esta entrega es anterior al registro de ventas y descontó stock por su cuenta: corríjala desde Kardex.', 409);
  }
  const note = `Envío cancelado por ${user.name}${reason?.trim() ? `: ${reason.trim()}` : ''}`;
  return db.$transaction(async (tx) => {
    const cancelled = await transition(tx, id, ['PENDIENTE'], {
      status: 'CANCELADO',
      notes: [delivery.notes, note].filter(Boolean).join(' · ').slice(0, 300),
    }, 'Solo se puede cancelar un envío que todavía no salió.');
    await recordAudit(tx, {
      action: 'DELIVERY_CANCELLED',
      entity: 'Entrega',
      entityId: id,
      summary: `Envío ${delivery.ref} cancelado${reason?.trim() ? `: ${reason.trim()}` : ''}`,
      details: { ref: delivery.ref, address: delivery.address, reason: reason?.trim() || null },
      user,
    });
    return cancelled;
  });
}

// Envío programado después de la venta (el cliente lo pidió tras pagar).
export async function scheduleDeliveryForExistingSale(db, numDoc, deliveryInput, user) {
  const delivery = parseDeliveryRequest({ ...deliveryInput, type: 'DELIVERY' });
  return db.$transaction(async (tx) => {
    const sale = await tx.venta.findUnique({
      where: { numDoc: String(numDoc ?? '').trim().toUpperCase() },
      include: {
        entrega: { select: { ref: true } },
        detalles: { select: { productoId: true, quantity: true } },
        branch: { select: { name: true, deliveriesEnabled: true } },
      },
    });
    if (!sale || !['PAID', 'DISPATCHED'].includes(sale.status)) {
      throw new DeliveryError('No se encontró una venta cobrada con ese comprobante.', 404);
    }
    if (sale.branchId !== user.branchId) throw new DeliveryError('Esa venta es de otra sucursal.', 403);
    assertBranchDelivers(sale.branch);
    if (sale.entrega) throw new DeliveryError(`Esta venta ya tiene el envío ${sale.entrega.ref}.`, 409);

    const created = await scheduleDeliveryForSale(tx, {
      ventaId: sale.id,
      numDoc: sale.numDoc,
      clienteId: sale.clienteId,
      lines: sale.detalles.map(d => ({ id: d.productoId, qty: d.quantity })),
      delivery,
    });
    return formatDelivery(await tx.entrega.findUnique({ where: { id: created.id }, include: DELIVERY_INCLUDE }));
  });
}

// Vista previa de una venta para programar su envío.
export async function findSaleForDelivery(db, numDoc, user) {
  const sale = await db.venta.findUnique({
    where: { numDoc: String(numDoc ?? '').trim().toUpperCase() },
    include: {
      cliente: { select: { name: true, phone: true, address: true } },
      entrega: { select: { ref: true } },
      detalles: { select: { quantity: true, producto: { select: { name: true } } } },
    },
  });
  if (!sale || !['PAID', 'DISPATCHED'].includes(sale.status)) {
    throw new DeliveryError('No se encontró una venta cobrada con ese comprobante.', 404);
  }
  if (sale.branchId !== user.branchId) throw new DeliveryError('Esa venta es de otra sucursal.', 403);
  return {
    numDoc: sale.numDoc,
    total: sale.total,
    existingDelivery: sale.entrega?.ref ?? null,
    customer: sale.cliente ? { name: sale.cliente.name, phone: sale.cliente.phone, address: sale.cliente.address } : null,
    items: sale.detalles.map(d => ({ name: d.producto.name, qty: d.quantity })),
  };
}
