// Sucursales o almacenes de la empresa, cada una con su modo de trabajo, sus envíos y quién despacha.
// Las operaciones de stock usan la sucursal del usuario; el administrador puede indicar otra (por ejemplo,
// registrar una compra que llegó a otro almacén). Módulo simple: reglas y datos en un solo archivo.
import type { Prisma } from '@prisma/client';
import type { prisma } from '../../db.ts';
import { AppError } from '@ferresys/shared/errors';
import { SALE_FLOW_MODES } from '../../config/modules.js';
import { recordAudit } from '../audit/index.ts';
import { requireFeature, requireWithinLimit } from '../licensing/index.ts';
import { DISPATCH_ROLES } from '../sales/index.ts';
import { getSettings } from '../settings/index.ts';

type Client = typeof prisma;

export class BranchError extends AppError {
  static override area = 'SUCURSAL';
}

const MAX_NAME_LENGTH = 60;
const MAX_ADDRESS_LENGTH = 200;
const MODE_LABELS: Record<string, string> = { DIRECT: 'Directo', SEPARATE_CASHIER: 'Vendedor y caja', STAGED: 'Por etapas' };
const ROLE_LABELS: Record<string, string> = { SELLER: 'vendedor', CASHIER: 'cajero', WAREHOUSE: 'almacén' };

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002';

// Sucursal en la que se registra una operación de stock: la propia, o la que indique el administrador.
export async function resolveBranchId(
  db: Pick<typeof prisma, 'branch'>,
  user: { branchId: number; role: string },
  requested: unknown,
): Promise<number> {
  if (requested === undefined || requested === null || requested === '') return user.branchId;
  const branchId = parseInt(String(requested), 10);
  if (Number.isNaN(branchId)) throw new BranchError('Sucursal no válida.');
  if (branchId === user.branchId) return branchId;
  if (user.role !== 'ADMINISTRADOR') throw new BranchError('Solo puede registrar movimientos en su propia sucursal.', 403);
  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { active: true } });
  if (!branch || !branch.active) throw new BranchError('La sucursal no existe o está desactivada.', 404);
  return branchId;
}

export async function listBranches(client: Client, includeInactive = false) {
  const branches = await client.branch.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { id: 'asc' },
    include: { _count: { select: { users: true, cashRegisters: true } } },
  });
  return branches.map(({ _count, ...b }) => ({ ...b, userCount: _count.users, cashRegisterCount: _count.cashRegisters }));
}

function parseBranchInput(input: Record<string, unknown>, partial = false) {
  const data: { name?: string; address?: string | null } = {};
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

// Un modo con pedidos necesita Caja (ahí se cobra) y "por etapas", además, Despacho. Trabajar con pedidos
// es parte del plan Profesional.
async function parseSaleFlowMode(client: Client, value: unknown) {
  if (!SALE_FLOW_MODES.includes(value as string)) throw new BranchError('Modo de trabajo no válido.');
  const mode = value as 'DIRECT' | 'SEPARATE_CASHIER' | 'STAGED';
  if (mode !== 'DIRECT') requireFeature('split_flow');
  const { enabledModules } = await getSettings(client);
  if (mode !== 'DIRECT' && !enabledModules.includes('caja')) {
    throw new BranchError('Para trabajar con pedidos active primero el módulo Caja (ahí se cobran).');
  }
  if (mode === 'STAGED' && !enabledModules.includes('despacho')) {
    throw new BranchError('Para trabajar por etapas active primero el módulo Despacho.');
  }
  return mode;
}

function parseDeliveriesEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new BranchError('Valor no válido para los envíos a domicilio.');
  return value;
}

// Varias sucursales son parte del plan Empresa.
export async function createBranch(client: Client, input: Record<string, unknown>) {
  requireFeature('branches');
  requireWithinLimit('maxBranches', await client.branch.count({ where: { active: true } }), 'sucursal(es)');
  const data = {
    ...parseBranchInput(input) as { name: string; address?: string | null },
    ...(input.saleFlowMode !== undefined && { saleFlowMode: await parseSaleFlowMode(client, input.saleFlowMode) }),
    ...(input.deliveriesEnabled !== undefined && { deliveriesEnabled: parseDeliveriesEnabled(input.deliveriesEnabled) }),
  };
  try {
    return await client.branch.create({ data });
  } catch (error) {
    if (isUniqueViolation(error)) throw new BranchError('Ya existe una sucursal con ese nombre.', 409);
    throw error;
  }
}

const OPEN_ORDER = { status: { in: ['PENDING_PAYMENT', 'PAID'] } } satisfies Prisma.VentaWhereInput;

// Una sucursal no se borra (tiene ventas y movimientos); se desactiva cuando ya no opera.
export async function updateBranch(client: Client, id: number, input: Record<string, unknown>, user: { id: number; name: string } | null = null) {
  const branch = await client.branch.findUnique({ where: { id } });
  if (!branch) throw new BranchError('La sucursal no existe.', 404);
  const data: Parameters<typeof client.branch.update>[0]['data'] & Record<string, unknown> = parseBranchInput(input, true);

  if (input.deliveriesEnabled !== undefined) data.deliveriesEnabled = parseDeliveriesEnabled(input.deliveriesEnabled);
  if (input.dispatchRole !== undefined) {
    if (input.dispatchRole !== null && !(DISPATCH_ROLES as readonly unknown[]).includes(input.dispatchRole)) {
      throw new BranchError('Responsable de despacho no válido.');
    }
    if (input.dispatchRole === 'WAREHOUSE' && !(await getSettings(client)).enabledModules.includes('despacho')) {
      throw new BranchError('Para que despache almacén active primero el módulo Despacho.');
    }
    data.dispatchRole = input.dispatchRole as 'SELLER' | 'CASHIER' | 'WAREHOUSE' | null;
  }

  if (input.saleFlowMode !== undefined && input.saleFlowMode !== branch.saleFlowMode) {
    data.saleFlowMode = await parseSaleFlowMode(client, input.saleFlowMode);
    // Cambiar de modo con pedidos en curso los dejaría sin pantalla donde cobrarlos o despacharlos.
    const openOrders = await client.venta.count({ where: { branchId: id, ...OPEN_ORDER } });
    if (openOrders > 0) {
      throw new BranchError(`${branch.name} tiene ${openOrders} pedido(s) sin cobrar o sin despachar. Complételos o anúlelos antes de cambiar el modo.`, 409);
    }
  }

  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new BranchError('Estado no válido.');
    if (!input.active && branch.active) {
      const [others, users, stock, openOrders] = await Promise.all([
        client.branch.count({ where: { active: true, id: { not: id } } }),
        client.usuario.count({ where: { branchId: id, active: true } }),
        client.branchStock.count({ where: { branchId: id, OR: [{ stock: { not: 0 } }, { reserved: { not: 0 } }] } }),
        client.venta.count({ where: { branchId: id, ...OPEN_ORDER } }),
      ]);
      if (others === 0) throw new BranchError('Debe quedar al menos una sucursal activa.', 409);
      if (users > 0) throw new BranchError(`Tiene ${users} usuario(s) activo(s): asígnelos a otra sucursal antes de desactivarla.`, 409);
      if (stock > 0) throw new BranchError('Todavía tiene stock: transfiéralo a otra sucursal antes de desactivarla.', 409);
      if (openOrders > 0) throw new BranchError('Tiene pedidos sin cobrar o sin despachar.', 409);
    }
    data.active = input.active;
  }

  try {
    return await client.$transaction(async (tx) => {
      const saved = await tx.branch.update({ where: { id }, data });
      const audit = (summary: string, details: Record<string, unknown>) =>
        recordAudit(tx, { action: 'SETTINGS_CHANGED', entity: 'Sucursal', entityId: id, summary, details, user });
      if (data.deliveriesEnabled !== undefined && saved.deliveriesEnabled !== branch.deliveriesEnabled) {
        await audit(`${saved.name}: envíos a domicilio ${saved.deliveriesEnabled ? 'activados' : 'desactivados'}`,
          { deliveriesEnabled: { before: branch.deliveriesEnabled, after: saved.deliveriesEnabled } });
      }
      if (data.dispatchRole !== undefined && saved.dispatchRole !== branch.dispatchRole) {
        await audit(`${saved.name}: despacha ${ROLE_LABELS[saved.dispatchRole ?? ''] ?? 'según el modo'}`,
          { dispatchRole: { before: branch.dispatchRole, after: saved.dispatchRole } });
      }
      if (data.saleFlowMode) {
        await audit(`${saved.name}: modo de trabajo ${MODE_LABELS[branch.saleFlowMode]} → ${MODE_LABELS[saved.saleFlowMode]}`,
          { saleFlowMode: { before: branch.saleFlowMode, after: saved.saleFlowMode } });
      }
      return saved;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new BranchError('Ya existe una sucursal con ese nombre.', 409);
    throw error;
  }
}
