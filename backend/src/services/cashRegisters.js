// Cajas físicas y turnos compartidos. Un turno (tabla cajas_chicas) pertenece a una caja y puede
// tener varios cajeros; cada venta guarda el turno (cajaId) y quién la cobró (paidById).
// Las reglas "un turno abierto por caja" y "un turno abierto por usuario" las garantiza la base de
// datos con índices parciales (migración 10): si dos personas actúan a la vez, una recibe P2002.

import { recordAudit } from './audit.js';
import { roundMoney } from '../utils/quantities.js';

export class CashError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_AMOUNT = 1_000_000;
const MAX_NAME_LENGTH = 40;
const LEGACY_REGISTER_NAME = 'Caja personal (anterior)';

const isAdmin = (user) => user.role === 'ADMINISTRADOR';

function parseAmount(value, label) {
  const amount = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    throw new CashError(`${label} debe ser un monto entre 0 y ${MAX_AMOUNT}.`);
  }
  return roundMoney(amount);
}

const isUniqueViolation = (error) => error?.code === 'P2002';

// ---------- Turnos ----------

const SESSION_INCLUDE = {
  cashRegister: { select: { id: true, name: true } },
  usuario: { select: { name: true } },
  members: {
    where: { leftAt: null },
    select: { joinedAt: true, user: { select: { id: true, name: true } } },
    orderBy: { joinedAt: 'asc' },
  },
  ventas: {
    select: { total: true, payMethod: true, mixCash: true, mixDigital: true, paidById: true, paidBy: { select: { name: true } } },
  },
};

async function findActiveMembership(db, userId) {
  return db.cashSessionMember.findFirst({
    where: { userId, leftAt: null, session: { estado: 'ABIERTA' } },
    select: { sessionId: true },
  });
}

// Turno abierto en el que está el usuario, o error si no está en ninguno (para cobrar).
export async function requireOpenSession(db, userId) {
  const membership = await findActiveMembership(db, userId);
  if (!membership) {
    throw new CashError('No tiene un turno de caja abierto. Abra una caja o únase a un turno en "Arqueo de Caja".');
  }
  return membership.sessionId;
}

// Efectivo y digital del turno, en total y por cajero. El fiado no entra a la caja.
function summarizeSales(ventas) {
  const byCashier = new Map();
  let cash = 0;
  let digital = 0;
  for (const sale of ventas) {
    let saleCash = 0;
    let saleDigital = 0;
    if (sale.payMethod === 'EFECTIVO') saleCash = sale.total;
    else if (sale.payMethod === 'PAGO_MIXTO') {
      saleCash = sale.mixCash || 0;
      saleDigital = sale.mixDigital || 0;
    } else if (sale.payMethod !== 'FIADO') saleDigital = sale.total;
    cash += saleCash;
    digital += saleDigital;

    const key = sale.paidById ?? 0;
    const entry = byCashier.get(key) || { userId: sale.paidById, name: sale.paidBy?.name ?? 'Sin registrar', sales: 0, cash: 0, digital: 0 };
    entry.sales += 1;
    entry.cash += saleCash;
    entry.digital += saleDigital;
    byCashier.set(key, entry);
  }
  return {
    cash: roundMoney(cash),
    digital: roundMoney(digital),
    byCashier: [...byCashier.values()].map(e => ({ ...e, cash: roundMoney(e.cash), digital: roundMoney(e.digital) })),
  };
}

function formatSession(session) {
  const totals = summarizeSales(session.ventas);
  return {
    id: session.id,
    register: session.cashRegister ?? { id: null, name: LEGACY_REGISTER_NAME },
    openedBy: session.usuario.name,
    montoInicial: session.montoInicial,
    ventasEfectivo: totals.cash,
    ventasDigital: totals.digital,
    saldoTeoricoEfectivo: roundMoney(session.montoInicial + totals.cash),
    byCashier: totals.byCashier,
    members: session.members.map(m => ({ id: m.user.id, name: m.user.name, joinedAt: m.joinedAt })),
    createdAt: new Date(session.createdAt).toLocaleString('es-PE'),
    openedAt: session.createdAt,
  };
}

// Estado para la pantalla de caja: el turno del usuario o, si no está en ninguno, las cajas
// disponibles para abrir o unirse.
export async function getCashStatus(db, user) {
  const membership = await findActiveMembership(db, user.id);
  if (membership) {
    const session = await db.cajaChica.findUnique({ where: { id: membership.sessionId }, include: SESSION_INCLUDE });
    return { abierta: true, caja: formatSession(session), registers: [] };
  }

  const registers = await db.cashRegister.findMany({
    where: { active: true },
    orderBy: { id: 'asc' },
    include: {
      sessions: {
        where: { estado: 'ABIERTA' },
        select: {
          id: true,
          createdAt: true,
          usuario: { select: { name: true } },
          members: { where: { leftAt: null }, select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  return {
    abierta: false,
    caja: null,
    registers: registers.map(r => {
      const open = r.sessions[0];
      return {
        id: r.id,
        name: r.name,
        session: open
          ? { id: open.id, openedBy: open.usuario.name, openedAt: open.createdAt, members: open.members.map(m => m.user.name) }
          : null,
      };
    }),
  };
}

export async function openSession(db, { cashRegisterId, montoInicial }, user) {
  const amount = parseAmount(montoInicial, 'El monto inicial');

  return db.$transaction(async (tx) => {
    // Con una sola caja activa no hace falta elegirla (compatibilidad con la pantalla anterior).
    let registerId = cashRegisterId ? parseInt(cashRegisterId, 10) : null;
    if (!registerId) {
      const active = await tx.cashRegister.findMany({ where: { active: true }, select: { id: true } });
      if (active.length !== 1) throw new CashError('Elija la caja que va a abrir.');
      registerId = active[0].id;
    }
    const register = await tx.cashRegister.findUnique({ where: { id: registerId } });
    if (!register || !register.active) throw new CashError('La caja elegida no existe o está desactivada.', 404);

    if (await findActiveMembership(tx, user.id)) throw new CashError('Ya está en un turno de caja abierto.', 409);
    const open = await tx.cajaChica.findFirst({ where: { cashRegisterId: registerId, estado: 'ABIERTA' }, select: { id: true } });
    if (open) throw new CashError(`${register.name} ya tiene un turno abierto: únase a él.`, 409);

    try {
      const session = await tx.cajaChica.create({
        data: { usuarioId: user.id, montoInicial: amount, estado: 'ABIERTA', cashRegisterId: registerId },
      });
      await tx.cashSessionMember.create({ data: { sessionId: session.id, userId: user.id } });
      return session;
    } catch (error) {
      if (isUniqueViolation(error)) throw new CashError(`${register.name} acaba de ser abierta por otra persona: únase a su turno.`, 409);
      throw error;
    }
  });
}

export async function joinSession(db, sessionId, user) {
  return db.$transaction(async (tx) => {
    const session = await tx.cajaChica.findUnique({ where: { id: sessionId }, select: { estado: true } });
    if (!session || session.estado !== 'ABIERTA') throw new CashError('El turno no existe o ya se cerró.', 404);
    if (await findActiveMembership(tx, user.id)) throw new CashError('Ya está en un turno de caja abierto.', 409);
    try {
      await tx.cashSessionMember.create({ data: { sessionId, userId: user.id } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new CashError('Ya está en un turno de caja abierto.', 409);
      throw error;
    }
  });
}

// Salir sin cerrar: lo cobrado queda en el turno. El último cajero no puede irse sin hacer el arqueo.
export async function leaveSession(db, sessionId, user) {
  return db.$transaction(async (tx) => {
    const members = await tx.cashSessionMember.findMany({ where: { sessionId, leftAt: null }, select: { id: true, userId: true } });
    const own = members.find(m => m.userId === user.id);
    if (!own) throw new CashError('No está en este turno.', 404);
    if (members.length === 1) throw new CashError('Es el único cajero del turno: ciérrelo con el arqueo en lugar de salir.', 409);
    await tx.cashSessionMember.update({ where: { id: own.id }, data: { leftAt: new Date() } });
  });
}

// El arqueo es del turno: lo hace cualquiera de sus cajeros (o un administrador).
export async function closeSession(db, { sessionId, montoCierreConteo }, user) {
  const counted = parseAmount(montoCierreConteo, 'El conteo');

  return db.$transaction(async (tx) => {
    const session = await tx.cajaChica.findUnique({ where: { id: sessionId }, include: SESSION_INCLUDE });
    if (!session || session.estado !== 'ABIERTA') throw new CashError('El turno no existe o ya está cerrado.');
    if (!isAdmin(user) && !session.members.some(m => m.user.id === user.id)) {
      throw new CashError('Solo un cajero del turno puede cerrarlo.', 403);
    }

    const summary = formatSession(session);
    const diferencia = roundMoney(counted - summary.saldoTeoricoEfectivo);
    const now = new Date();

    // Cambio condicional: si dos cajeros cierran a la vez, solo uno lo logra.
    const { count } = await tx.cajaChica.updateMany({
      where: { id: sessionId, estado: 'ABIERTA' },
      data: {
        ventasEfectivo: summary.ventasEfectivo,
        ventasDigital: summary.ventasDigital,
        montoCierreConteo: counted,
        diferencia,
        estado: 'CERRADA',
        closedAt: now,
      },
    });
    if (count === 0) throw new CashError('El turno ya fue cerrado.', 409);
    await tx.cashSessionMember.updateMany({ where: { sessionId, leftAt: null }, data: { leftAt: now } });

    await recordAudit(tx, {
      action: 'CASH_CLOSED',
      entity: 'Caja',
      entityId: sessionId,
      summary: `${summary.register.name} (turno de ${summary.openedBy}) cerrada: esperado S/ ${summary.saldoTeoricoEfectivo.toFixed(2)}, `
        + `contado S/ ${counted.toFixed(2)}, diferencia S/ ${diferencia.toFixed(2)}`,
      details: {
        register: summary.register.name,
        montoInicial: summary.montoInicial,
        ventasEfectivo: summary.ventasEfectivo,
        ventasDigital: summary.ventasDigital,
        saldoTeorico: summary.saldoTeoricoEfectivo,
        conteo: counted,
        diferencia,
        cajeros: summary.byCashier.map(c => `${c.name}: ${c.sales} venta(s), efectivo S/ ${c.cash.toFixed(2)}`),
      },
      user,
    });

    return { saldoTeorico: summary.saldoTeoricoEfectivo, diferencia };
  });
}

// ---------- Administración de cajas ----------

function parseRegisterName(value) {
  const name = String(value ?? '').trim();
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
    throw new CashError(`El nombre de la caja debe tener entre 2 y ${MAX_NAME_LENGTH} caracteres.`);
  }
  return name;
}

export async function listRegisters(db) {
  const registers = await db.cashRegister.findMany({
    orderBy: { id: 'asc' },
    include: { sessions: { where: { estado: 'ABIERTA' }, select: { id: true } } },
  });
  return registers.map(({ sessions, ...r }) => ({ ...r, isOpen: sessions.length > 0 }));
}

export async function createRegister(db, input) {
  try {
    return await db.cashRegister.create({ data: { name: parseRegisterName(input.name) } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new CashError('Ya existe una caja con ese nombre.', 409);
    throw error;
  }
}

export async function updateRegister(db, id, input) {
  const register = await db.cashRegister.findUnique({ where: { id }, include: { sessions: { where: { estado: 'ABIERTA' }, select: { id: true } } } });
  if (!register) throw new CashError('La caja no existe.', 404);

  const data = {};
  if (input.name !== undefined) data.name = parseRegisterName(input.name);
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new CashError('Estado no válido.');
    if (!input.active && register.sessions.length > 0) throw new CashError('No se puede desactivar una caja con un turno abierto.', 409);
    if (!input.active && register.active) {
      const others = await db.cashRegister.count({ where: { active: true, id: { not: id } } });
      if (others === 0) throw new CashError('Debe quedar al menos una caja activa.', 409);
    }
    data.active = input.active;
  }
  try {
    return await db.cashRegister.update({ where: { id }, data });
  } catch (error) {
    if (isUniqueViolation(error)) throw new CashError('Ya existe una caja con ese nombre.', 409);
    throw error;
  }
}
