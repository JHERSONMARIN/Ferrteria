// Enganches de rubro, con paquetes falsos:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Tx } from '../db.ts';
import type { SaleContext, StockMovement } from './hooks.ts';
import { z } from 'zod';
import { IndustryDataError, PACKAGES, hooksFor, parseIndustryData } from './registry.ts';

const tx = {} as Tx;
const vocabulary = { business: 'botica', businesses: 'boticas', product: 'medicamento', products: 'medicamentos', sampleTradeName: 'Botica Salud' };
const sale: SaleContext = {
  kind: 'direct', branchId: 1, customerId: null, user: {} as SaleContext['user'],
  lines: [{ productId: 7, unitId: null, qty: 2, baseQty: 2, name: 'Paracetamol' }],
};
const movement: StockMovement = { direction: 'in', source: 'purchase', productId: 7, qty: 10, branchId: 1, ref: 'Compra', userId: 1 };

test('un paquete sin enganches no cambia nada', async () => {
  const hooks = hooksFor({ id: 'vacio', hooks: {}, vocabulary });
  await hooks.beforeSale(tx, sale);
  await hooks.onStockMovement(tx, movement);
});

test('un enganche puede rechazar la venta: el error llega tal cual al núcleo', async () => {
  const hooks = hooksFor({
    id: 'farmacia', vocabulary,
    hooks: { beforeSale: async (_tx, s) => { if (s.lines.some(l => l.name === 'Paracetamol')) throw new Error('Producto vencido'); } },
  });
  await assert.rejects(hooks.beforeSale(tx, sale), /vencido/);
});

test('los movimientos de stock llegan al paquete con su dirección y origen', async () => {
  const seen: StockMovement[] = [];
  const hooks = hooksFor({ id: 'farmacia', vocabulary, hooks: { onStockMovement: async (_tx, m) => { seen.push(m); } } });
  await hooks.onStockMovement(tx, movement);
  assert.deepEqual(seen, [movement]);
});

test('cada rubro del catálogo tiene su paquete, con todas sus palabras', () => {
  for (const [id, pkg] of Object.entries(PACKAGES)) {
    assert.equal(pkg.id, id);
    for (const [key, word] of Object.entries(pkg.vocabulary)) assert.ok(word.trim(), `${id}: falta la palabra ${key}`);
  }
});

test('campos del rubro: sin esquema del paquete solo se acepta vacío', () => {
  const pkg = { id: 'ferreteria', hooks: {}, vocabulary };
  assert.equal(parseIndustryData(pkg, 'product', undefined), undefined);
  assert.deepEqual(parseIndustryData(pkg, 'product', {}), {});
  assert.deepEqual(parseIndustryData(pkg, 'product', null), {});
  assert.throws(() => parseIndustryData(pkg, 'product', { lote: 'A1' }), IndustryDataError);
});

test('campos del rubro: el esquema del paquete valida y da el mensaje', () => {
  const pkg = {
    id: 'farmacia', hooks: {}, vocabulary,
    fields: { product: z.object({ registroSanitario: z.string({ message: 'Falta el registro sanitario.' }).min(3) }) },
  };
  assert.deepEqual(parseIndustryData(pkg, 'product', { registroSanitario: 'EE-01234', otro: 1 }), { registroSanitario: 'EE-01234' });
  assert.throws(() => parseIndustryData(pkg, 'product', {}), /registro sanitario/);
});
