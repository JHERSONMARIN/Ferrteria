// Casos de uso de caja: abrir, unirse, salir y cerrar un turno, y administrar las cajas físicas.
import type { prisma } from '../../../db.ts';
import { recordAudit } from '../../audit/index.ts';
import { requireFeature, requireWithinLimit } from '../../licensing/index.ts';
import {
  CashError, LEGACY_REGISTER_NAME, assertCanClose, assertCanDeactivate, assertCanMove, closingDifference, expectedCash,
  membershipToLeave, summarizeSales, type CashUser,
} from '../domain/cash.ts';
import * as repo from '../infrastructure/cashRepository.ts';
import type { Db, SessionView } from '../infrastructure/cashRepository.ts';

type Client = typeof prisma;

// Turno abierto en el que está el usuario, o error si no está en ninguno (para cobrar).
export async function requireOpenSession(db: Db, userId: number): Promise<number> {
  const sessionId = await repo.activeSessionOf(db, userId);
  if (sessionId === null) {
    throw new CashError('No tiene un turno de caja abierto. Abra una caja o únase a un turno en "Caja".', 400, 'CAJA_NO_ABIERTA');
  }
  return sessionId;
}

// Forma en que la pantalla de caja recibe un turno.
function presentSession(session: SessionView) {
  const totals = summarizeSales(session.sales);
  return {
    id: session.id,
    register: session.register ?? { id: null, name: LEGACY_REGISTER_NAME },
    openedBy: session.openedByName,
    montoInicial: session.openingAmount,
    ventasEfectivo: totals.cash,
    ventasDigital: totals.digital,
    saldoTeoricoEfectivo: expectedCash(session.openingAmount, totals),
    byCashier: totals.byCashier,
    members: session.members,
    createdAt: session.createdAt.toLocaleString('es-PE'),
    openedAt: session.createdAt,
  };
}

// El turno del usuario o, si no está en ninguno, las cajas de su sucursal para abrir o unirse.
export async function getCashStatus(db: Db, user: CashUser) {
  const sessionId = await repo.activeSessionOf(db, user.id);
  if (sessionId !== null) {
    const session = await repo.loadSession(db, sessionId);
    if (session) return { abierta: true as const, caja: presentSession(session), registers: [] };
  }
  return { abierta: false as const, caja: null, registers: await repo.registersToJoin(db, user.branchId) };
}

export async function openSession(client: Client, input: { cashRegisterId?: number; montoInicial: number }, user: CashUser) {
  const openingAmount = input.montoInicial;

  return client.$transaction(async (tx) => {
    // Con una sola caja activa en la sucursal no hace falta elegirla.
    let registerId = input.cashRegisterId ?? null;
    if (registerId === null) {
      const active = await repo.activeRegisterIds(tx, user.branchId);
      if (active.length !== 1) throw new CashError(active.length === 0 ? 'Su sucursal no tiene cajas activas.' : 'Elija la caja que va a abrir.');
      registerId = active[0]!;
    }
    const register = await repo.findRegister(tx, registerId);
    if (!register || !register.active) throw new CashError('La caja elegida no existe o está desactivada.', 404);
    if (register.branchId !== user.branchId) throw new CashError('Esa caja es de otra sucursal.', 403);

    if (await repo.activeSessionOf(tx, user.id) !== null) throw new CashError('Ya está en un turno de caja abierto.', 409);
    if (await repo.openSessionOfRegister(tx, registerId) !== null) {
      throw new CashError(`${register.name} ya tiene un turno abierto: únase a él.`, 409);
    }

    try {
      return await repo.createSession(tx, { userId: user.id, registerId, openingAmount });
    } catch (error) {
      if (repo.isUniqueViolation(error)) throw new CashError(`${register.name} acaba de ser abierta por otra persona: únase a su turno.`, 409);
      throw error;
    }
  });
}

export async function joinSession(client: Client, sessionId: number, user: CashUser) {
  requireFeature('shared_cash');
  return client.$transaction(async (tx) => {
    const session = await repo.sessionToJoin(tx, sessionId);
    if (!session || !session.open) throw new CashError('El turno no existe o ya se cerró.', 404);
    if (session.branchId !== null && session.branchId !== user.branchId) {
      throw new CashError('Ese turno es de una caja de otra sucursal.', 403);
    }
    if (await repo.activeSessionOf(tx, user.id) !== null) throw new CashError('Ya está en un turno de caja abierto.', 409);
    try {
      await repo.addMember(tx, sessionId, user.id);
    } catch (error) {
      if (repo.isUniqueViolation(error)) throw new CashError('Ya está en un turno de caja abierto.', 409);
      throw error;
    }
  });
}

export async function leaveSession(client: Client, sessionId: number, user: CashUser) {
  return client.$transaction(async (tx) => {
    const own = membershipToLeave(await repo.activeMembers(tx, sessionId), user.id);
    await repo.markLeft(tx, own.id, new Date());
  });
}

// El arqueo es del turno: lo hace cualquiera de sus cajeros (o un administrador).
export async function closeSession(client: Client, input: { sessionId: number; montoCierreConteo: number }, user: CashUser & { name: string }) {
  const counted = input.montoCierreConteo;

  return client.$transaction(async (tx) => {
    const session = await repo.loadSession(tx, input.sessionId);
    if (!session || !session.open) throw new CashError('El turno no existe o ya está cerrado.');
    assertCanClose(user, session.members.map(m => m.id));

    const summary = presentSession(session);
    const difference = closingDifference(counted, summary.saldoTeoricoEfectivo);
    const closed = await repo.closeIfOpen(tx, session.id, {
      cash: summary.ventasEfectivo, digital: summary.ventasDigital, counted, difference, at: new Date(),
    });
    if (!closed) throw new CashError('El turno ya fue cerrado.', 409);

    await recordAudit(tx, {
      action: 'CASH_CLOSED',
      entity: 'Caja',
      entityId: session.id,
      summary: `${summary.register.name} (turno de ${summary.openedBy}) cerrada: esperado S/ ${summary.saldoTeoricoEfectivo.toFixed(2)}, `
        + `contado S/ ${counted.toFixed(2)}, diferencia S/ ${difference.toFixed(2)}`,
      details: {
        register: summary.register.name,
        montoInicial: summary.montoInicial,
        ventasEfectivo: summary.ventasEfectivo,
        ventasDigital: summary.ventasDigital,
        saldoTeorico: summary.saldoTeoricoEfectivo,
        conteo: counted,
        diferencia: difference,
        cajeros: summary.byCashier.map(c => `${c.name}: ${c.sales} venta(s), efectivo S/ ${c.cash.toFixed(2)}`),
      },
      user,
    });

    return { saldoTeorico: summary.saldoTeoricoEfectivo, diferencia: difference };
  });
}

// ---------- Administración de cajas (solo administrador) ----------

export const listRegisters = (db: Db) => repo.listRegisters(db);

async function activeBranch(db: Db, branchId: number): Promise<number> {
  const active = await repo.branchIsActive(db, branchId);
  if (!active) throw new CashError('La sucursal no existe o está desactivada.', 404);
  return branchId;
}

export async function createRegister(db: Db, input: { name: string; branchId?: number }, user: CashUser) {
  // La primera caja viene con cualquier plan; varias cajas y turnos compartidos, con el plan Profesional.
  requireFeature('shared_cash');
  requireWithinLimit('maxCashRegisters', await repo.countActiveRegisters(db), 'caja(s)');
  const { name } = input;
  const branchId = input.branchId === undefined ? user.branchId : await activeBranch(db, input.branchId);
  try {
    return await repo.createRegister(db, { name, branchId });
  } catch (error) {
    if (repo.isUniqueViolation(error)) throw new CashError('Ya existe una caja con ese nombre.', 409);
    throw error;
  }
}

export async function updateRegister(db: Db, id: number, input: { name?: string; branchId?: number; active?: boolean }) {
  const register = await repo.registerForUpdate(db, id);
  if (!register) throw new CashError('La caja no existe.', 404);

  const data: { name?: string; branchId?: number; active?: boolean } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.branchId !== undefined) {
    data.branchId = await activeBranch(db, input.branchId);
    if (data.branchId !== register.branchId) assertCanMove(register.hasOpenSession);
  }
  if (input.active !== undefined) {
    if (!input.active) {
      const others = register.active
        ? await repo.countActiveRegisters(db, { branchId: register.branchId, excludeId: id })
        : null;
      assertCanDeactivate(register.hasOpenSession, others);
    }
    data.active = input.active;
  }
  try {
    return await repo.updateRegister(db, id, data);
  } catch (error) {
    if (repo.isUniqueViolation(error)) throw new CashError('Ya existe una caja con ese nombre.', 409);
    throw error;
  }
}
