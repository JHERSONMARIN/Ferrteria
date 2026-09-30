// Los lotes en la base (tabla farmacia_lotes), siempre dentro de la transacción del paso del núcleo.
import type { Tx } from '../../db.ts';
import { roundQuantity } from '../../utils/quantities.ts';
import type { EntryLot, LotBalance, Take } from './lots.ts';

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

export async function lotsOf(tx: Tx, productId: number, branchId: number): Promise<LotBalance[]> {
  const rows = await tx.pharmacyLot.findMany({
    where: { productoId: productId, branchId, quantity: { gt: 0 } },
    select: { id: true, lotNumber: true, expiresAt: true, quantity: true },
  });
  return rows.map(r => ({ id: r.id, lotNumber: r.lotNumber, expiresAt: toDay(r.expiresAt), quantity: Number(r.quantity) }));
}

export async function addToLot(tx: Tx, productId: number, branchId: number, lot: EntryLot, qty: number): Promise<void> {
  const expiresAt = toDate(lot.expiresAt);
  await tx.pharmacyLot.upsert({
    where: { productoId_branchId_lotNumber_expiresAt: { productoId: productId, branchId, lotNumber: lot.lotNumber, expiresAt } },
    create: { productoId: productId, branchId, lotNumber: lot.lotNumber, expiresAt, quantity: roundQuantity(qty) },
    update: { quantity: { increment: roundQuantity(qty) } },
  });
}

export async function takeFromLots(tx: Tx, takes: readonly Take[]): Promise<void> {
  for (const take of takes) {
    if (take.lotId !== null) await tx.pharmacyLot.update({ where: { id: take.lotId }, data: { quantity: { decrement: take.qty } } });
  }
}
