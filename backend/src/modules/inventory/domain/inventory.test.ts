// Reglas de inventario, sin base de datos ni servidor:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TransferError, movementTotals, normalizeTransferItems, periodRange, transferNotes, transferNumber,
} from './inventory.ts';

test('transferencia: productos repetidos se suman y quedan ordenados por id', () => {
  assert.deepEqual(
    normalizeTransferItems([{ id: 7, qty: 10 }, { id: 2, qty: 1 }, { id: 7, qty: 2.5 }]),
    [{ id: 2, qty: 1 }, { id: 7, qty: 12.5 }],
  );
});

test('transferencia: vacía, producto inválido o cantidad inválida se rechazan', () => {
  assert.throws(() => normalizeTransferItems([]), /al menos un producto/);
  assert.throws(() => normalizeTransferItems(null), TransferError);
  assert.throws(() => normalizeTransferItems([{ id: 'x', qty: 1 }]), /producto inválido/);
  assert.throws(() => normalizeTransferItems([{ id: 1, qty: 0 }]), /Cantidad inválida/);
  assert.throws(() => normalizeTransferItems([{ id: 1, qty: 1.0001 }]), /hasta 3 decimales/);
});

test('número de transferencia con seis dígitos', () => {
  assert.equal(transferNumber(42), 'TRF-000042');
});

test('la nota de la transferencia se recorta y vacía queda sin nota', () => {
  assert.equal(transferNotes('  Reposición  '), 'Reposición');
  assert.equal(transferNotes('   '), null);
  assert.equal(transferNotes(undefined), null);
  assert.equal(transferNotes('x'.repeat(250))?.length, 200);
});

test('períodos del kardex', () => {
  const now = new Date(2026, 8, 28, 15, 30); // 28/09/2026 15:30, hora local
  assert.deepEqual(periodRange('today', now), { gte: new Date(2026, 8, 28) });
  assert.deepEqual(periodRange('month', now), { gte: new Date(2026, 8, 1) });
  assert.deepEqual(periodRange('week', now), { gte: new Date(2026, 8, 21) });
  assert.equal(periodRange('all', now), null);
  assert.equal(periodRange('custom', now), null); // sin fechas = todo
  const custom = periodRange('custom', now, '2026-09-01', '2026-09-10');
  assert.equal(custom?.lte?.getHours(), 23);
});

test('totales del kardex: entradas, salidas y saldo', () => {
  assert.deepEqual(
    movementTotals([{ type: 'ENTRADA', qty: 10 }, { type: 'SALIDA', qty: 2.5 }, { type: 'ENTRADA', qty: 1 }]),
    { totalIn: 11, totalOut: 2.5, netBalance: 8.5, movementCount: 3 },
  );
});
