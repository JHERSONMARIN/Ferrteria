// Enganche de stock de farmacia: cada entrada con lote suma a ese lote y cada salida descuenta de los lotes.
import type { Tx } from '../../db.ts';
import type { StockMovement } from '../hooks.ts';
import { PharmacyError, entryLotOf, planTakes, todayInLima, unlottedQuantity, type Take } from './lots.ts';
import { addToLot, lotsOf, takeFromLots } from './lotStore.ts';

// Una transferencia llega como una salida en el origen y una entrada en el destino, seguidas y en la misma
// transacción: lo que salió de cada lote se guarda aquí hasta que el destino lo recibe.
const inTransit = new WeakMap<Tx, Map<number, Take[][]>>();

function remember(tx: Tx, productId: number, takes: Take[]) {
  const byProduct = inTransit.get(tx) ?? new Map<number, Take[][]>();
  inTransit.set(tx, byProduct);
  byProduct.set(productId, [...(byProduct.get(productId) ?? []), takes]);
}

const takeRemembered = (tx: Tx, productId: number): Take[] => inTransit.get(tx)?.get(productId)?.shift() ?? [];

export async function onStockMovement(tx: Tx, movement: StockMovement): Promise<void> {
  const { productId, branchId, qty } = movement;
  if (movement.direction === 'in') {
    if (movement.source === 'transfer') {
      for (const take of takeRemembered(tx, productId)) {
        if (take.lotNumber && take.expiresAt) await addToLot(tx, productId, branchId, { lotNumber: take.lotNumber, expiresAt: take.expiresAt }, take.qty);
      }
      return;
    }
    const lot = entryLotOf(movement.data);
    if (lot) await addToLot(tx, productId, branchId, lot, qty);
    return;
  }

  const lots = await lotsOf(tx, productId, branchId);
  const unlotted = unlottedQuantity(movement.stockAfter + qty, lots);
  const { takes, missing } = planTakes(lots, unlotted, qty, todayInLima(), { includeExpired: movement.source !== 'sale' });
  if (missing > 0) {
    throw new PharmacyError('No hay stock vigente suficiente: el resto está vencido. Retírelo con una salida «Producto Vencido».', 409, 'FARMACIA_STOCK_VENCIDO');
  }
  await takeFromLots(tx, takes);
  if (movement.source === 'transfer') remember(tx, productId, takes);
}
