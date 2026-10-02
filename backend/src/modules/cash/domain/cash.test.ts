// Reglas de caja, sin base de datos ni servidor:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CashError, assertCanClose, assertCanDeactivate, closingDifference, expectedCash, membershipToLeave,
  parseAmount, parseRegisterName, summarizeSales, type SaleForCash,
} from './cash.ts';

const sale = (overrides: Partial<SaleForCash>): SaleForCash => ({
  total: 10, payMethod: 'EFECTIVO', mixCash: null, mixDigital: null, paidById: 1, paidByName: 'Ana', ...overrides,
});

test('el efectivo del turno suma efectivo y la parte en efectivo del pago mixto; el fiado no entra', () => {
  const summary = summarizeSales([
    sale({ total: 30 }),
    sale({ total: 20, payMethod: 'YAPE_PLIN' }),
    sale({ total: 50, payMethod: 'PAGO_MIXTO', mixCash: 15, mixDigital: 35 }),
    sale({ total: 99, payMethod: 'FIADO' }),
  ]);
  assert.equal(summary.cash, 45);
  assert.equal(summary.digital, 55);
});

test('el desglose es por cajero, y las ventas sin cobrador quedan como "Sin registrar"', () => {
  const summary = summarizeSales([
    sale({ total: 30, paidById: 1, paidByName: 'Ana' }),
    sale({ total: 50, paidById: 2, paidByName: 'Luis' }),
    sale({ total: 5, paidById: 1, paidByName: 'Ana' }),
    sale({ total: 7, paidById: null, paidByName: null }),
  ]);
  assert.deepEqual(summary.byCashier.map(c => [c.name, c.sales, c.cash]), [['Ana', 2, 35], ['Luis', 1, 50], ['Sin registrar', 1, 7]]);
});

test('sin errores de redondeo: 0.1 + 0.2 da 0.30 en la caja', () => {
  const summary = summarizeSales([sale({ total: 0.1 }), sale({ total: 0.2 })]);
  assert.equal(summary.cash, 0.3);
  assert.equal(expectedCash(100, summary), 100.3);
});

test('arqueo: esperado = monto inicial + efectivo; la diferencia es lo contado menos lo esperado', () => {
  const expected = expectedCash(100, summarizeSales([sale({ total: 30 }), sale({ total: 50 }), sale({ total: 10 })]));
  assert.equal(expected, 190);
  assert.equal(closingDifference(185, expected), -5);
  assert.equal(closingDifference(190, expected), 0);
});

test('montos: entre 0 y el máximo, redondeados a céntimos', () => {
  assert.equal(parseAmount('80', 'El monto'), 80);
  assert.equal(parseAmount(12.345, 'El monto'), 12.35);
  for (const bad of [-5, '', null, undefined, 'diez', 2_000_000]) {
    assert.throws(() => parseAmount(bad, 'El monto inicial'), /El monto inicial debe ser un monto/);
  }
});

test('nombre de caja: de 2 a 40 caracteres, sin espacios sobrantes', () => {
  assert.equal(parseRegisterName('  Caja 2 '), 'Caja 2');
  assert.throws(() => parseRegisterName(' '), CashError);
  assert.throws(() => parseRegisterName('x'.repeat(41)), CashError);
});

test('cierra el turno uno de sus cajeros o un administrador; nadie más', () => {
  const cajero = { id: 3, role: 'CAJERO', branchId: 1 };
  assert.doesNotThrow(() => assertCanClose(cajero, [3, 4]));
  assert.doesNotThrow(() => assertCanClose({ id: 1, role: 'ADMINISTRADOR', branchId: 1 }, [3]));
  assert.throws(() => assertCanClose({ id: 9, role: 'VENDEDOR', branchId: 1 }, [3]), (e: unknown) =>
    e instanceof CashError && e.status === 403);
});

test('salir del turno: solo si está en él y no es el último cajero', () => {
  const members = [{ id: 10, userId: 3 }, { id: 11, userId: 4 }];
  assert.equal(membershipToLeave(members, 4).id, 11);
  assert.throws(() => membershipToLeave(members, 9), (e: unknown) => e instanceof CashError && e.status === 404);
  assert.throws(() => membershipToLeave([{ id: 10, userId: 3 }], 3), (e: unknown) => e instanceof CashError && e.status === 409);
});

test('desactivar una caja: no con turno abierto, y siempre queda una activa por sucursal', () => {
  assert.doesNotThrow(() => assertCanDeactivate(false, 1));
  assert.doesNotThrow(() => assertCanDeactivate(false, null)); // ya estaba desactivada
  assert.throws(() => assertCanDeactivate(true, 3), /turno abierto/);
  assert.throws(() => assertCanDeactivate(false, 0), /al menos una caja activa/);
});
