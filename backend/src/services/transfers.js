// Transferencias de stock entre sucursales, en un solo paso: en la misma transacción las unidades salen
// del disponible del origen (nunca de lo reservado para pedidos) y entran al destino, con su movimiento
// de kardex en cada sucursal. El total de la empresa no cambia.

import { takeAvailableStock, addStock } from './stock.js';
import { resolveBranchId } from './branches.js';
import { quantityProblem, roundQuantity, MAX_QUANTITY_DECIMALS } from '../utils/quantities.js';
import { recordAudit } from './audit.js';

export class TransferError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_NOTES_LENGTH = 200;
const LIST_LIMIT = 100;

export const transferNumber = (id) => `TRF-${String(id).padStart(6, '0')}`;

// Agrupa productos repetidos y los ordena por id: las transferencias concurrentes bloquean filas en el mismo orden.
function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new TransferError('Agregue al menos un producto a transferir.');
  const quantities = new Map();
  for (const item of items) {
    const id = Number(item?.id);
    const qty = Number(item?.qty);
    if (!Number.isInteger(id) || id <= 0) throw new TransferError('La transferencia contiene un producto inválido.');
    if (!Number.isFinite(qty) || qty <= 0 || roundQuantity(qty) !== qty) {
      throw new TransferError(`Cantidad inválida: debe ser mayor a 0 y con hasta ${MAX_QUANTITY_DECIMALS} decimales.`);
    }
    quantities.set(id, roundQuantity((quantities.get(id) || 0) + qty));
  }
  return [...quantities].map(([id, qty]) => ({ id, qty })).sort((a, b) => a.id - b.id);
}

const TRANSFER_INCLUDE = {
  fromBranch: { select: { id: true, name: true } },
  toBranch: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  items: { select: { quantity: true, producto: { select: { id: true, code: true, name: true, unit: true } } } },
};

function formatTransfer(t) {
  return {
    id: t.id,
    number: transferNumber(t.id),
    createdAt: t.createdAt,
    notes: t.notes,
    from: t.fromBranch,
    to: t.toBranch,
    createdBy: t.createdBy?.name ?? 'Sistema',
    items: t.items.map(i => ({ ...i.producto, qty: i.quantity })),
  };
}

// user: quien transfiere. Solo puede sacar de su propia sucursal (el administrador, de cualquiera).
export async function createTransfer(db, input, user) {
  const fromBranchId = await resolveBranchId(db, user, input.fromBranchId);
  const toBranchId = parseInt(input.toBranchId, 10);
  if (Number.isNaN(toBranchId)) throw new TransferError('Elija la sucursal de destino.');
  if (toBranchId === fromBranchId) throw new TransferError('El origen y el destino deben ser sucursales distintas.');
  const notes = String(input.notes ?? '').trim().slice(0, MAX_NOTES_LENGTH) || null;
  const items = normalizeItems(input.items);

  return db.$transaction(async (tx) => {
    const branches = await tx.branch.findMany({ where: { id: { in: [fromBranchId, toBranchId] } }, select: { id: true, name: true, active: true } });
    const from = branches.find(b => b.id === fromBranchId);
    const to = branches.find(b => b.id === toBranchId);
    if (!to || !to.active) throw new TransferError('La sucursal de destino no existe o está desactivada.', 404);
    if (!from || !from.active) throw new TransferError('La sucursal de origen no existe o está desactivada.', 404);

    const products = await tx.producto.findMany({
      where: { id: { in: items.map(i => i.id) } },
      select: { id: true, code: true, name: true, unit: true, active: true, allowsFractions: true },
    });
    const byId = new Map(products.map(p => [p.id, p]));
    for (const item of items) {
      const product = byId.get(item.id);
      if (!product || !product.active) throw new TransferError(`El producto ${product?.name || item.id} no existe o no está activo.`);
      const problem = quantityProblem(item.qty, product.allowsFractions);
      if (problem) throw new TransferError(`La cantidad de ${product.name} ${problem}.`);
    }

    const transfer = await tx.stockTransfer.create({
      data: { fromBranchId, toBranchId, notes, createdById: user.id },
    });
    const number = transferNumber(transfer.id);

    for (const item of items) {
      const product = byId.get(item.id);
      const originAfter = await takeAvailableStock(tx, item.id, item.qty, fromBranchId);
      const destinationAfter = await addStock(tx, item.id, item.qty, toBranchId);
      await tx.stockTransferItem.create({ data: { transferId: transfer.id, productoId: item.id, quantity: item.qty } });
      await tx.movimientoKardex.createMany({
        data: [
          { productoId: item.id, type: 'SALIDA', qty: item.qty, stockAfter: originAfter, ref: `${number} a ${to.name}`, usuarioId: user.id, branchId: fromBranchId },
          { productoId: item.id, type: 'ENTRADA', qty: item.qty, stockAfter: destinationAfter, ref: `${number} desde ${from.name}`, usuarioId: user.id, branchId: toBranchId },
        ],
      });
    }

    await recordAudit(tx, {
      action: 'STOCK_TRANSFERRED',
      entity: 'Transferencia',
      entityId: transfer.id,
      summary: `${number}: ${items.length} producto(s) de ${from.name} a ${to.name}${notes ? ` (${notes})` : ''}`,
      details: { from: from.name, to: to.name, items: items.map(i => `${i.qty} ${byId.get(i.id).unit} de ${byId.get(i.id).code} ${byId.get(i.id).name}`), notes },
      user,
    });

    return formatTransfer(await tx.stockTransfer.findUnique({ where: { id: transfer.id }, include: TRANSFER_INCLUDE }));
  });
}

// Últimas transferencias; con branchId, solo las que salen o llegan a esa sucursal.
export async function listTransfers(db, { branchId } = {}) {
  const where = {};
  if (branchId) {
    const id = parseInt(branchId, 10);
    if (Number.isNaN(id)) throw new TransferError('Sucursal no válida.');
    where.OR = [{ fromBranchId: id }, { toBranchId: id }];
  }
  const transfers = await db.stockTransfer.findMany({ where, include: TRANSFER_INCLUDE, orderBy: { id: 'desc' }, take: LIST_LIMIT });
  return transfers.map(formatTransfer);
}
