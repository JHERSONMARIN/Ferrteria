// Proveedores y compras. Una compra suma al stock de la sucursal y deja su entrada en el kardex.
// Módulo simple: reglas y acceso a datos en un solo archivo.
import type { prisma } from '../../db.ts';
import { AppError } from '@ferresys/shared/errors';
import { resolveBranchId } from '../branches/index.ts';
import { quantityProblem, roundMoney } from '../../utils/quantities.ts';
import type { SessionUser } from '../../types/express.d.ts';
import { addStock } from '../inventory/index.ts';
import { industryHooks, parseStockEntryData, type IndustryData } from '../../industries/index.ts';
import type { z } from '@ferresys/contracts/zod';
import type { PurchaseBody, SupplierBody } from '@ferresys/contracts/purchasing';

type Client = typeof prisma;

export class PurchaseError extends AppError {
  static override area = 'COMPRA';
}

// ---------- Proveedores ----------

export const listSuppliers = (client: Client) => client.proveedor.findMany({ orderBy: { id: 'desc' } });

export const createSupplier = (client: Client, input: z.infer<typeof SupplierBody>) => client.proveedor.create({ data: input });

// ---------- Compras ----------

export async function listPurchases(client: Client) {
  const purchases = await client.compra.findMany({
    select: {
      id: true, numDoc: true, total: true, createdAt: true,
      proveedor: { select: { name: true, ruc: true } },
      detalles: { select: { quantity: true, unitPrice: true, subtotal: true, producto: { select: { name: true, code: true } } } },
    },
    orderBy: { id: 'desc' },
  });
  return purchases.map(p => ({
    id: p.id,
    numDoc: p.numDoc,
    provider: p.proveedor.name,
    providerRuc: p.proveedor.ruc,
    total: p.total,
    date: p.createdAt.toLocaleString('es-PE'),
    detalles: p.detalles,
  }));
}

export type PurchaseInput = z.infer<typeof PurchaseBody>;

// La mercadería entra a la sucursal del usuario (o a la que indique el administrador). Cada línea se valida
// contra su producto: enteros, o hasta 3 decimales si se vende fraccionado.
export async function registerPurchase(client: Client, input: PurchaseInput, user: SessionUser) {
  const branchId: number = await resolveBranchId(client, user, input.branchId);
  const numDoc = input.numDoc;

  return client.$transaction(async (tx) => {
    const supplier = await tx.proveedor.findUnique({ where: { id: input.proveedorId }, select: { id: true } });
    if (!supplier) throw new PurchaseError('El proveedor no existe.', 404);

    const lines: { id: number; qty: number; cost: number; subtotal: number; data?: IndustryData }[] = [];
    for (const item of input.items) {
      const product = await tx.producto.findUnique({
        where: { id: item.id },
        select: { id: true, name: true, active: true, allowsFractions: true },
      });
      if (!product || !product.active) throw new PurchaseError(`El producto ${item.name || item.id} no existe o no está activo.`);
      const problem = quantityProblem(item.qty, product.allowsFractions);
      if (problem) throw new PurchaseError(`La cantidad de ${product.name} ${problem}.`);
      if (!Number.isFinite(item.cost) || item.cost < 0) throw new PurchaseError(`El costo de ${product.name} no es válido.`);
      const data = parseStockEntryData(item.industryData);
      lines.push({ id: product.id, qty: item.qty, cost: item.cost, subtotal: roundMoney(item.qty * item.cost), data });
    }

    const purchase = await tx.compra.create({
      data: { proveedorId: supplier.id, numDoc, total: roundMoney(lines.reduce((sum, l) => sum + l.subtotal, 0)), branchId },
    });
    for (const line of lines) {
      await tx.detalleCompra.create({
        data: { compraId: purchase.id, productoId: line.id, quantity: line.qty, unitPrice: line.cost, subtotal: line.subtotal },
      });
      const stockAfter = await addStock(tx, line.id, line.qty, branchId);
      const ref = `Compra a Proveedor (Doc: ${numDoc})`;
      await tx.movimientoKardex.create({
        data: { productoId: line.id, type: 'ENTRADA', qty: line.qty, stockAfter, ref, usuarioId: user.id, branchId },
      });
      await industryHooks.onStockMovement(tx, {
        direction: 'in', source: 'purchase', productId: line.id, qty: line.qty, branchId, stockAfter, ref, userId: user.id, data: line.data,
      });
    }
    return purchase;
  });
}
