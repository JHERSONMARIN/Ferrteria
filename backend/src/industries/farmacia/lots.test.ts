// Lotes de farmacia, sin base de datos:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { isExpired, planTakes, stockEntry, todayInLima, unlottedQuantity, type LotBalance } from './lots.ts';

const TODAY = '2026-09-29';
const lots: LotBalance[] = [
  { id: 1, lotNumber: 'B', expiresAt: '2027-03-01', quantity: 10 },
  { id: 2, lotNumber: 'A', expiresAt: '2026-12-01', quantity: 5 },
  { id: 3, lotNumber: 'V', expiresAt: '2026-09-28', quantity: 4 },
];

test('lote de una entrada: los dos datos o ninguno', () => {
  assert.deepEqual(stockEntry.parse({}), {});
  assert.deepEqual(stockEntry.parse({ lotNumber: ' ', expiresAt: '' }), {});
  assert.deepEqual(stockEntry.parse({ lotNumber: ' L-01 ', expiresAt: '2027-01-31' }), { lotNumber: 'L-01', expiresAt: '2027-01-31' });
  assert.throws(() => stockEntry.parse({ lotNumber: 'L-01' }), /lote y su vencimiento/);
  assert.throws(() => stockEntry.parse({ lotNumber: 'L-01', expiresAt: '2027-02-30' }), /fecha válida/);
});

test('vence al terminar su día, en hora de Lima', () => {
  assert.equal(isExpired('2026-09-29', TODAY), false);
  assert.equal(isExpired('2026-09-28', TODAY), true);
  assert.equal(todayInLima(new Date('2026-09-30T04:00:00Z')), '2026-09-29');
});

test('una venta sale de lo que vence antes, sin tocar lo vencido, y al final de lo que no tiene lote', () => {
  const { takes, missing } = planTakes(lots, 3, 17, TODAY, { includeExpired: false });
  assert.deepEqual(takes.map(t => [t.lotNumber, t.qty]), [['A', 5], ['B', 10], [null, 2]]);
  assert.equal(missing, 0);
});

test('si para completar la venta haría falta lo vencido, falta', () => {
  assert.equal(planTakes(lots, 0, 16, TODAY, { includeExpired: false }).missing, 1);
});

test('una salida manual retira primero lo vencido', () => {
  const { takes } = planTakes(lots, 0, 6, TODAY, { includeExpired: true });
  assert.deepEqual(takes.map(t => [t.lotNumber, t.qty]), [['V', 4], ['A', 2]]);
});

test('sin lote = stock de la sucursal menos lo que está en lotes', () => {
  assert.equal(unlottedQuantity(22, lots), 3);
  assert.equal(unlottedQuantity(10, lots), 0);
});
