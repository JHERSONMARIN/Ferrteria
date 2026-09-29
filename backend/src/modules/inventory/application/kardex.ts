// Kardex: historial de movimientos de stock y ajustes manuales (entradas, mermas, conteos).
import type { prisma } from '../../../db.ts';
import { recordAudit } from '../../audit/index.ts';
import { resolveBranchId } from '../../branches/index.ts';
import { quantityProblem } from '../../../utils/quantities.js';
import type { SessionUser } from '../../../types/express.d.ts';
import { StockError, movementTotals, periodRange, type MovementType } from '../domain/inventory.ts';
import { addStock, branchStockOf, takeAvailableStock } from '../infrastructure/stockOperations.ts';

type Client = typeof prisma;

export interface MovementFilter {
  branchId?: number;
  productCode?: string;
  type?: MovementType;
  period: string;
  startDate?: string;
  endDate?: string;
}

export async function listMovements(client: Client, filter: MovementFilter) {
  const createdAt = periodRange(filter.period, new Date(), filter.startDate, filter.endDate);
  const records = await client.movimientoKardex.findMany({
    where: {
      ...(filter.branchId !== undefined && { branchId: filter.branchId }),
      ...(filter.productCode && { producto: { code: filter.productCode } }),
      ...(filter.type && { type: filter.type }),
      ...(createdAt && { createdAt }),
    },
    select: {
      id: true,
      type: true,
      qty: true,
      stockAfter: true,
      ref: true,
      createdAt: true,
      producto: { select: { code: true, name: true, unit: true, price: true } },
      usuario: { select: { id: true, name: true, user: true, role: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { id: 'desc' },
  });

  const movements = records.map(r => ({ ...r, qty: Number(r.qty), stockAfter: Number(r.stockAfter) }));
  return {
    records: movements.map(r => ({
      id: r.id,
      date: r.createdAt.toLocaleString('es-PE'),
      timestamp: r.createdAt,
      code: r.producto?.code || '',
      name: r.producto?.name || '',
      unit: r.producto?.unit || 'Unidad',
      type: r.type,
      qty: r.qty,
      stockAfter: r.stockAfter,
      ref: r.ref,
      user: r.usuario ? r.usuario.name : 'Sistema / General',
      userRole: r.usuario ? r.usuario.role : '',
      branch: r.branch,
    })),
    summary: { ...movementTotals(movements), period: filter.period },
  };
}

export interface ManualMovement {
  productoId: number;
  type: MovementType;
  qty: number;
  ref?: string;
  branchId?: number;
}

// Lo reservado por pedidos no se puede sacar a mano: la salida solo toma del disponible.
export async function recordManualMovement(client: Client, input: ManualMovement, user: SessionUser) {
  const branchId: number = await resolveBranchId(client, user, input.branchId);
  return client.$transaction(async (tx) => {
    const product = await tx.producto.findUnique({ where: { id: input.productoId } });
    if (!product) throw new StockError('Producto no encontrado.', 404);
    const problem = quantityProblem(input.qty, product.allowsFractions);
    if (problem) throw new StockError(`La cantidad ${problem}.`, 400);

    const stockBefore = await branchStockOf(tx, product.id, branchId);
    const newStock = input.type === 'ENTRADA'
      ? await addStock(tx, product.id, input.qty, branchId)
      : await takeAvailableStock(tx, product.id, input.qty, branchId);

    const km = await tx.movimientoKardex.create({
      data: {
        productoId: product.id,
        type: input.type,
        qty: input.qty,
        stockAfter: newStock,
        ref: input.ref?.trim() || 'Movimiento Manual',
        usuarioId: user.id,
        branchId,
      },
    });

    await recordAudit(tx, {
      action: 'STOCK_ADJUSTED',
      entity: 'Producto',
      entityId: product.id,
      summary: `${km.type === 'ENTRADA' ? 'Entrada' : 'Salida'} manual de ${input.qty} ${product.unit} de ${product.code} ${product.name} `
        + `(stock ${stockBefore} → ${newStock}): ${km.ref}`,
      details: { type: km.type, qty: input.qty, stockBefore, stockAfter: newStock, ref: km.ref, branchId },
      user,
    });

    return { km, newStock };
  });
}
