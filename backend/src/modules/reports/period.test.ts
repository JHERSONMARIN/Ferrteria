// Reglas de los reportes, sin base de datos:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportError, dailySeries, parseRange, rotation, todayInLima, withAverage } from './period.ts';

test('sin fechas: los últimos 30 días hasta hoy', () => {
  const period = parseRange({}, '2026-09-28');
  assert.deepEqual([period.from, period.to, period.days], ['2026-08-30', '2026-09-28', 30]);
  assert.equal(period.start.toISOString(), '2026-08-30T05:00:00.000Z');
  assert.equal(period.end.toISOString(), '2026-09-29T05:00:00.000Z');
});

test('rango inválido, invertido o de más de 366 días se rechaza', () => {
  assert.throws(() => parseRange({ from: '2026/09/01' }), /AAAA-MM-DD/);
  assert.throws(() => parseRange({ from: '2026-09-10', to: '2026-09-01' }), ReportError);
  assert.throws(() => parseRange({ from: '2025-01-01', to: '2026-09-01' }), /366 días/);
});

test('"hoy" es el día de Perú, no el de UTC', () => {
  assert.equal(todayInLima(new Date('2026-09-29T03:00:00Z')), '2026-09-28');
});

test('la serie diaria incluye los días sin ventas', () => {
  const period = parseRange({ from: '2026-09-01', to: '2026-09-03' });
  assert.deepEqual(dailySeries(period, [{ day: '2026-09-02', sales: 2, total: 40.005 }]), [
    { day: '2026-09-01', sales: 0, total: 0 },
    { day: '2026-09-02', sales: 2, total: 40.01 },
    { day: '2026-09-03', sales: 0, total: 0 },
  ]);
});

test('rotación: lo que se acaba pronto y lo que no se vende', () => {
  const base = { unit: 'Unidad', price: 10 };
  const { lowCoverage, noMovement } = rotation([
    { ...base, id: 1, code: 'LIJ', name: 'Lija', stock: 1, sold: 60 },        // 2 por día: alcanza 0 días
    { ...base, id: 2, code: 'CEM', name: 'Cemento', stock: 100, sold: 30 },   // 1 por día: 100 días
    { ...base, id: 3, code: 'CAN', name: 'Candado', stock: 5, sold: 0 },
    { ...base, id: 4, code: 'OTR', name: 'Agotado', stock: 0, sold: 0 },
  ], 30);
  assert.deepEqual(lowCoverage.map(p => [p.code, p.coverageDays]), [['LIJ', 0]]);
  assert.deepEqual(noMovement.map(p => [p.code, p.stockValue]), [['CAN', 50]]);
});

test('promedio por venta', () => {
  assert.deepEqual(withAverage({ name: 'Ana', sales: 3, total: 100 }), { name: 'Ana', sales: 3, total: 100, average: 33.33 });
  assert.equal(withAverage({ sales: 0, total: 0 }).average, 0);
});
