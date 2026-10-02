// Acceso a la base para cajas y turnos (Prisma). Convierte cada fila a los tipos del dominio: los montos
// llegan como número (db.js los convierte) pero Prisma los declara Decimal, así que se pasan por Number().
// Las reglas "un turno abierto por caja" y "un turno abierto por usuario" las garantiza la base con
// índices parciales (migración 010): si dos personas actúan a la vez, una recibe P2002.
import type { prisma } from '../../../db.ts';
import type { PayMethod, SaleForCash } from '../domain/cash.ts';

/** El cliente de Prisma o una transacción: las consultas funcionan con los dos. */
export type Db = Pick<typeof prisma, 'cajaChica' | 'cashSessionMember' | 'cashRegister' | 'branch'>;

export const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002';

export interface SessionView {
  id: number;
  open: boolean;
  register: { id: number; name: string } | null;
  openedByName: string;
  openingAmount: number;
  createdAt: Date;
  members: { id: number; name: string; joinedAt: Date }[];
  sales: SaleForCash[];
}

export interface RegisterRow {
  id: number;
  name: string;
  active: boolean;
  branchId: number;
}

// ---------- Turnos ----------

export async function activeSessionOf(db: Db, userId: number): Promise<number | null> {
  const membership = await db.cashSessionMember.findFirst({
    where: { userId, leftAt: null, session: { estado: 'ABIERTA' } },
    select: { sessionId: true },
  });
  return membership?.sessionId ?? null;
}

export async function loadSession(db: Db, id: number): Promise<SessionView | null> {
  const session = await db.cajaChica.findUnique({
    where: { id },
    include: {
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
    },
  });
  if (!session) return null;
  return {
    id: session.id,
    open: session.estado === 'ABIERTA',
    register: session.cashRegister,
    openedByName: session.usuario.name,
    openingAmount: Number(session.montoInicial),
    createdAt: session.createdAt,
    members: session.members.map(m => ({ id: m.user.id, name: m.user.name, joinedAt: m.joinedAt })),
    sales: session.ventas.map(v => ({
      total: Number(v.total),
      payMethod: v.payMethod as PayMethod,
      mixCash: v.mixCash === null ? null : Number(v.mixCash),
      mixDigital: v.mixDigital === null ? null : Number(v.mixDigital),
      paidById: v.paidById,
      paidByName: v.paidBy?.name ?? null,
    })),
  };
}

// Cajas activas de una sucursal con su turno abierto, si tiene: para abrir una o unirse.
export async function registersToJoin(db: Db, branchId: number) {
  const registers = await db.cashRegister.findMany({
    where: { active: true, branchId },
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
  return registers.map(r => {
    const open = r.sessions[0];
    return {
      id: r.id,
      name: r.name,
      session: open
        ? { id: open.id, openedBy: open.usuario.name, openedAt: open.createdAt, members: open.members.map(m => m.user.name) }
        : null,
    };
  });
}

export async function activeRegisterIds(db: Db, branchId: number): Promise<number[]> {
  const rows = await db.cashRegister.findMany({ where: { active: true, branchId }, select: { id: true } });
  return rows.map(r => r.id);
}

export const findRegister = (db: Db, id: number): Promise<RegisterRow | null> =>
  db.cashRegister.findUnique({ where: { id }, select: { id: true, name: true, active: true, branchId: true } });

export async function openSessionOfRegister(db: Db, registerId: number): Promise<number | null> {
  const open = await db.cajaChica.findFirst({ where: { cashRegisterId: registerId, estado: 'ABIERTA' }, select: { id: true } });
  return open?.id ?? null;
}

export async function createSession(db: Db, data: { userId: number; registerId: number; openingAmount: number }) {
  const session = await db.cajaChica.create({
    data: { usuarioId: data.userId, montoInicial: data.openingAmount, estado: 'ABIERTA', cashRegisterId: data.registerId },
  });
  await db.cashSessionMember.create({ data: { sessionId: session.id, userId: data.userId } });
  return session;
}

export async function sessionToJoin(db: Db, id: number): Promise<{ open: boolean; branchId: number | null } | null> {
  const session = await db.cajaChica.findUnique({
    where: { id },
    select: { estado: true, cashRegister: { select: { branchId: true } } },
  });
  return session ? { open: session.estado === 'ABIERTA', branchId: session.cashRegister?.branchId ?? null } : null;
}

export async function addMember(db: Db, sessionId: number, userId: number): Promise<void> {
  await db.cashSessionMember.create({ data: { sessionId, userId } });
}

export const activeMembers = (db: Db, sessionId: number) =>
  db.cashSessionMember.findMany({ where: { sessionId, leftAt: null }, select: { id: true, userId: true } });

export async function markLeft(db: Db, memberId: number, at: Date): Promise<void> {
  await db.cashSessionMember.update({ where: { id: memberId }, data: { leftAt: at } });
}

// Cambio condicional: si dos cajeros cierran a la vez, solo uno lo logra (devuelve false al otro).
export async function closeIfOpen(db: Db, id: number, closing: {
  cash: number; digital: number; counted: number; difference: number; at: Date;
}): Promise<boolean> {
  const { count } = await db.cajaChica.updateMany({
    where: { id, estado: 'ABIERTA' },
    data: {
      ventasEfectivo: closing.cash,
      ventasDigital: closing.digital,
      montoCierreConteo: closing.counted,
      diferencia: closing.difference,
      estado: 'CERRADA',
      closedAt: closing.at,
    },
  });
  if (count === 0) return false;
  await db.cashSessionMember.updateMany({ where: { sessionId: id, leftAt: null }, data: { leftAt: closing.at } });
  return true;
}

// ---------- Administración de cajas ----------

export async function listRegisters(db: Db) {
  const registers = await db.cashRegister.findMany({
    orderBy: { id: 'asc' },
    include: {
      sessions: { where: { estado: 'ABIERTA' }, select: { id: true } },
      branch: { select: { id: true, name: true } },
    },
  });
  return registers.map(({ sessions, ...r }) => ({ ...r, isOpen: sessions.length > 0 }));
}

export async function branchIsActive(db: Db, branchId: number): Promise<boolean | null> {
  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { active: true } });
  return branch ? branch.active : null;
}

export const countActiveRegisters = (db: Db, where: { branchId?: number; excludeId?: number } = {}) =>
  db.cashRegister.count({
    where: {
      active: true,
      ...(where.branchId !== undefined && { branchId: where.branchId }),
      ...(where.excludeId !== undefined && { id: { not: where.excludeId } }),
    },
  });

export const createRegister = (db: Db, data: { name: string; branchId: number }) => db.cashRegister.create({ data });

export async function registerForUpdate(db: Db, id: number) {
  const register = await db.cashRegister.findUnique({
    where: { id },
    include: { sessions: { where: { estado: 'ABIERTA' }, select: { id: true } } },
  });
  if (!register) return null;
  const { sessions, ...rest } = register;
  return { ...rest, hasOpenSession: sessions.length > 0 };
}

export const updateRegister = (db: Db, id: number, data: { name?: string; branchId?: number; active?: boolean }) =>
  db.cashRegister.update({ where: { id }, data });
