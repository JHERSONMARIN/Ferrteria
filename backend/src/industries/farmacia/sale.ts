// Enganche de venta de farmacia: pide la receta que corresponda y no deja vender lo vencido.
import type { Tx } from '../../db.ts';
import type { SaleContext } from '../hooks.ts';
import { roundQuantity } from '../../utils/quantities.ts';
import { PharmacyError, isExpired, todayInLima } from './lots.ts';
import { lotsOf } from './lotStore.ts';
import { needOf, prescriptionProblem, strongestNeed } from './prescription.ts';

export async function beforeSale(tx: Tx, sale: SaleContext): Promise<void> {
  const qtyByProduct = new Map<number, number>();
  for (const line of sale.lines) qtyByProduct.set(line.productId, roundQuantity((qtyByProduct.get(line.productId) ?? 0) + line.baseQty));

  const products = await tx.producto.findMany({
    where: { id: { in: [...qtyByProduct.keys()] } },
    select: { id: true, name: true, industryData: true, branchStocks: { where: { branchId: sale.branchId }, select: { stock: true, reserved: true } } },
  });

  const withNeed = products.map(p => ({ ...p, need: needOf(p.industryData) }));
  const need = strongestNeed(withNeed.map(p => p.need));
  const asking = withNeed.filter(p => p.need === need).map(p => p.name);
  const problem = prescriptionProblem(need, sale.data, asking);
  if (problem) throw new PharmacyError(problem, 400, 'FARMACIA_RECETA');

  // Lo vencido sigue en el stock hasta que se retira: no cuenta como disponible para vender.
  const today = todayInLima();
  for (const product of products) {
    const expired = (await lotsOf(tx, product.id, sale.branchId))
      .filter(lot => isExpired(lot.expiresAt, today))
      .reduce((sum, lot) => sum + lot.quantity, 0);
    if (expired <= 0) continue;
    const row = product.branchStocks[0];
    const available = row ? Number(row.stock) - Number(row.reserved) : 0;
    const valid = Math.max(0, roundQuantity(available - expired));
    if (qtyByProduct.get(product.id)! > valid) {
      throw new PharmacyError(
        `${product.name}: solo hay ${valid} vigente(s); ${roundQuantity(expired)} está(n) vencido(s) y no se pueden vender.`,
        409, 'FARMACIA_STOCK_VENCIDO',
      );
    }
  }
}
