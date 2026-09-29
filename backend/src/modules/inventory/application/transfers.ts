// Transferencias de stock entre sucursales, en un solo paso: en la misma transacción las unidades salen
// del disponible del origen (nunca de lo reservado para pedidos) y entran al destino, con su movimiento
// de kardex en cada sucursal. El total de la empresa no cambia.
import type { prisma } from '../../../db.ts';
import { recordAudit } from '../../audit/index.ts';
import { resolveBranchId } from '../../../services/branches.js';
import { quantityProblem } from '../../../utils/quantities.js';
import type { SessionUser } from '../../../types/express.d.ts';
import { TransferError, normalizeTransferItems, transferNotes, transferNumber } from '../domain/inventory.ts';
import { addStock, takeAvailableStock } from '../infrastructure/stockOperations.ts';

type Client = typeof prisma;

const LIST_LIMIT = 100;

const TRANSFER_INCLUDE = {
  fromBranch: { select: { id: true, name: true } },
  toBranch: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  items: { select: { quantity: true, producto: { select: { id: true, code: true, name: true, unit: true } } } },
} as const;

type TransferRow = NonNullable<Awaited<ReturnType<Client['stockTransfer']['findUnique']>>> & {
  fromBranch: { id: number; name: string };
  toBranch: { id: number; name: string };
  createdBy: { name: string } | null;
  items: { quantity: unknown; producto: { id: number; code: string; name: string; unit: string } }[];
};

function presentTransfer(t: TransferRow) {
  return {
    id: t.id,
    number: transferNumber(t.id),
    createdAt: t.createdAt,
    notes: t.notes,
    from: t.fromBranch,
    to: t.toBranch,
    createdBy: t.createdBy?.name ?? 'Sistema',
    items: t.items.map(i => ({ ...i.producto, qty: Number(i.quantity) })),
  };
}

export interface TransferInput {
  fromBranchId?: number;
  toBranchId: number;
  items?: unknown;
  notes?: unknown;
}

// Solo se saca de la propia sucursal; el administrador, de cualquiera.
export async function createTransfer(client: Client, input: TransferInput, user: SessionUser) {
  const fromBranchId: number = await resolveBranchId(client, user, input.fromBranchId);
  const toBranchId = input.toBranchId;
  if (toBranchId === fromBranchId) throw new TransferError('El origen y el destino deben ser sucursales distintas.');
  const notes = transferNotes(input.notes);
  const items = normalizeTransferItems(input.items);

  return client.$transaction(async (tx) => {
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

    const transfer = await tx.stockTransfer.create({ data: { fromBranchId, toBranchId, notes, createdById: user.id } });
    const number = transferNumber(transfer.id);

    for (const item of items) {
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

    const describe = (id: number) => {
      const p = byId.get(id)!;
      return `${p.unit} de ${p.code} ${p.name}`;
    };
    await recordAudit(tx, {
      action: 'STOCK_TRANSFERRED',
      entity: 'Transferencia',
      entityId: transfer.id,
      summary: `${number}: ${items.length} producto(s) de ${from.name} a ${to.name}${notes ? ` (${notes})` : ''}`,
      details: { from: from.name, to: to.name, items: items.map(i => `${i.qty} ${describe(i.id)}`), notes },
      user,
    });

    const saved = await tx.stockTransfer.findUnique({ where: { id: transfer.id }, include: TRANSFER_INCLUDE });
    return presentTransfer(saved as TransferRow);
  });
}

// Últimas transferencias; con branchId, solo las que salen o llegan a esa sucursal.
export async function listTransfers(client: Client, filter: { branchId?: number }) {
  const where = filter.branchId ? { OR: [{ fromBranchId: filter.branchId }, { toBranchId: filter.branchId }] } : {};
  const transfers = await client.stockTransfer.findMany({ where, include: TRANSFER_INCLUDE, orderBy: { id: 'desc' }, take: LIST_LIMIT });
  return (transfers as TransferRow[]).map(presentTransfer);
}
