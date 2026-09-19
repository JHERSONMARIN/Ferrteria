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

export async function createBranch(db, input) {
  try {
    return await db.branch.create({ data: parseBranchInput(input) });
  } catch (error) {
    if (isUniqueViolation(error)) throw new BranchError('Ya existe una sucursal con ese nombre.', 409);
    throw error;
  }
}

// Una sucursal no se borra (tiene ventas y movimientos); se desactiva cuando ya no opera.
export async function updateBranch(db, id, input) {
  const branch = await db.branch.findUnique({ where: { id } });
  if (!branch) throw new BranchError('La sucursal no existe.', 404);
  const data = parseBranchInput(input, { partial: true });

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
    return await db.branch.update({ where: { id }, data });
  } catch (error) {
    if (isUniqueViolation(error)) throw new BranchError('Ya existe una sucursal con ese nombre.', 409);
    throw error;
  }
}
