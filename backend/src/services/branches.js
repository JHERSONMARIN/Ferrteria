import { SALE_FLOW_MODES } from '../config/modules.js';
import { DISPATCH_ROLES } from '../config/dispatch.js';
import { getSettings } from './settings.js';
import { recordAudit } from './audit.js';
import { requireFeature, requireWithinLimit } from './license.js';

// Sucursales o almacenes de la empresa. Las operaciones de stock usan la sucursal del usuario; el
// administrador puede indicar otra (por ejemplo, registrar una compra que llegó a otro almacén).

export class BranchError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_NAME_LENGTH = 60;
const MAX_ADDRESS_LENGTH = 200;

// Sucursal en la que se registra una operación de stock.
export async function resolveBranchId(db, user, requestedBranchId) {
  if (requestedBranchId === undefined || requestedBranchId === null || requestedBranchId === '') return user.branchId;
  const branchId = parseInt(requestedBranchId, 10);
  if (Number.isNaN(branchId)) throw new BranchError('Sucursal no válida.');
  if (branchId === user.branchId) return branchId;
  if (user.role !== 'ADMINISTRADOR') throw new BranchError('Solo puede registrar movimientos en su propia sucursal.', 403);
  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { active: true } });
  if (!branch || !branch.active) throw new BranchError('La sucursal no existe o está desactivada.', 404);
  return branchId;
}

export async function listBranches(db, { includeInactive = false } = {}) {
  const branches = await db.branch.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { id: 'asc' },
    include: { _count: { select: { users: true, cashRegisters: true } } },
  });
  return branches.map(({ _count, ...b }) => ({ ...b, userCount: _count.users, cashRegisterCount: _count.cashRegisters }));
}

function parseBranchInput(input, { partial = false } = {}) {
  const data = {};
  if (!partial || input.name !== undefined) {
    const name = String(input.name ?? '').trim();
    if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
      throw new BranchError(`El nombre de la sucursal debe tener entre 2 y ${MAX_NAME_LENGTH} caracteres.`);
    }
    data.name = name;
  }
  if (input.address !== undefined) {
    const address = String(input.address ?? '').trim();
    if (address.length > MAX_ADDRESS_LENGTH) throw new BranchError(`La dirección no puede superar ${MAX_ADDRESS_LENGTH} caracteres.`);
    data.address = address || null;
  }
  return data;
}

const isUniqueViolation = (error) => error?.code === 'P2002';

const MODE_LABELS = { DIRECT: 'Directo', SEPARATE_CASHIER: 'Vendedor y caja', STAGED: 'Por etapas' };

// Un modo con pedidos necesita Caja (ahí se cobra) y "por etapas", además, Despacho.
async function parseSaleFlowMode(db, value) {
  if (!SALE_FLOW_MODES.includes(value)) throw new BranchError('Modo de trabajo no válido.');
  // Trabajar con pedidos (vendedor y caja, o por etapas) es parte del plan Profesional.
  if (value !== 'DIRECT') requireFeature('split_flow');
  const { enabledModules } = await getSettings(db);
  if (value !== 'DIRECT' && !enabledModules.includes('caja')) {
    throw new BranchError('Para trabajar con pedidos active primero el módulo Arqueo de Caja (ahí se cobran).');
  }
  if (value === 'STAGED' && !enabledModules.includes('despacho')) {
    throw new BranchError('Para trabajar por etapas active primero el módulo Despacho.');
  }
  return value;
}

function parseDeliveriesEnabled(value) {
  if (typeof value !== 'boolean') throw new BranchError('Valor no válido para los envíos a domicilio.');
  return value;
}

export async function createBranch(db, input) {
  // Varias sucursales son parte del plan Empresa.
  requireFeature('branches');
  requireWithinLimit('maxBranches', await db.branch.count({ where: { active: true } }), 'sucursal(es)');
  const data = parseBranchInput(input);
  if (input.saleFlowMode !== undefined) data.saleFlowMode = await parseSaleFlowMode(db, input.saleFlowMode);
  if (input.deliveriesEnabled !== undefined) data.deliveriesEnabled = parseDeliveriesEnabled(input.deliveriesEnabled);
  try {
    return await db.branch.create({ data });
  } catch (error) {
    if (isUniqueViolation(error)) throw new BranchError('Ya existe una sucursal con ese nombre.', 409);
    throw error;
  }
}

// Una sucursal no se borra (tiene ventas y movimientos); se desactiva cuando ya no opera.
// user: quien hace el cambio (para la auditoría del modo de trabajo).
export async function updateBranch(db, id, input, user = null) {
  const branch = await db.branch.findUnique({ where: { id } });
  if (!branch) throw new BranchError('La sucursal no existe.', 404);
  const data = parseBranchInput(input, { partial: true });

  if (input.deliveriesEnabled !== undefined) data.deliveriesEnabled = parseDeliveriesEnabled(input.deliveriesEnabled);
  if (input.dispatchRole !== undefined) {
    if (input.dispatchRole !== null && !DISPATCH_ROLES.includes(input.dispatchRole)) throw new BranchError('Responsable de despacho no válido.');
    if (input.dispatchRole === 'WAREHOUSE' && !(await getSettings(db)).enabledModules.includes('despacho')) {
      throw new BranchError('Para que despache almacén active primero el módulo Despacho.');
    }
    data.dispatchRole = input.dispatchRole;
  }

  if (input.saleFlowMode !== undefined && input.saleFlowMode !== branch.saleFlowMode) {
    data.saleFlowMode = await parseSaleFlowMode(db, input.saleFlowMode);
    // Cambiar de modo con pedidos en curso los dejaría sin pantalla donde cobrarlos o despacharlos.
    const openOrders = await db.venta.count({ where: { branchId: id, status: { in: ['PENDING_PAYMENT', 'PAID'] } } });
    if (openOrders > 0) {
      throw new BranchError(
        `${branch.name} tiene ${openOrders} pedido(s) sin cobrar o sin despachar. Complételos o anúlelos antes de cambiar el modo.`, 409
      );
    }
  }

  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new BranchError('Estado no válido.');
    if (!input.active && branch.active) {
      const [others, users, stock, openOrders] = await Promise.all([
        db.branch.count({ where: { active: true, id: { not: id } } }),
        db.usuario.count({ where: { branchId: id, active: true } }),
        db.branchStock.count({ where: { branchId: id, OR: [{ stock: { not: 0 } }, { reserved: { not: 0 } }] } }),
        db.venta.count({ where: { branchId: id, status: { in: ['PENDING_PAYMENT', 'PAID'] } } }),
      ]);
      if (others === 0) throw new BranchError('Debe quedar al menos una sucursal activa.', 409);
      if (users > 0) throw new BranchError(`Tiene ${users} usuario(s) activo(s): asígnelos a otra sucursal antes de desactivarla.`, 409);
      if (stock > 0) throw new BranchError('Todavía tiene stock: transfiéralo a otra sucursal antes de desactivarla.', 409);
      if (openOrders > 0) throw new BranchError('Tiene pedidos sin cobrar o sin despachar.', 409);
    }
    data.active = input.active;
  }

  try {
    return await db.$transaction(async (tx) => {
      const saved = await tx.branch.update({ where: { id }, data });
      if (data.deliveriesEnabled !== undefined && data.deliveriesEnabled !== branch.deliveriesEnabled) {
        await recordAudit(tx, {
          action: 'SETTINGS_CHANGED',
          entity: 'Sucursal',
          entityId: id,
          summary: `${saved.name}: envíos a domicilio ${saved.deliveriesEnabled ? 'activados' : 'desactivados'}`,
          details: { deliveriesEnabled: { before: branch.deliveriesEnabled, after: saved.deliveriesEnabled } },
          user,
        });
      }
      if (data.dispatchRole !== undefined && data.dispatchRole !== branch.dispatchRole) {
        const ROLE_LABELS = { SELLER: 'vendedor', CASHIER: 'cajero', WAREHOUSE: 'almacén' };
        await recordAudit(tx, {
          action: 'SETTINGS_CHANGED',
          entity: 'Sucursal',
          entityId: id,
          summary: `${saved.name}: despacha ${ROLE_LABELS[saved.dispatchRole] ?? 'según el modo'}`,
          details: { dispatchRole: { before: branch.dispatchRole, after: saved.dispatchRole } },
          user,
        });
      }
      if (data.saleFlowMode) {
        await recordAudit(tx, {
          action: 'SETTINGS_CHANGED',
          entity: 'Sucursal',
          entityId: id,
          summary: `${saved.name}: modo de trabajo ${MODE_LABELS[branch.saleFlowMode]} → ${MODE_LABELS[saved.saleFlowMode]}`,
          details: { saleFlowMode: { before: branch.saleFlowMode, after: saved.saleFlowMode } },
          user,
        });
      }
      return saved;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new BranchError('Ya existe una sucursal con ese nombre.', 409);
    throw error;
  }
}
