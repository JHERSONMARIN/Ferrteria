// Reglas del catálogo, sin base de datos ni servidor:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CategoryError, ProductError, assertUnitCodesDiffer, categoryMetrics, checkImportRows, hasDecimalStock, parseCategoryImportRow,
  parseCategoryName, parseProductImportRow, parseSaleUnits, parseWholesalePrice,
} from './catalog.ts';

test('precio mayorista: vacío = sin precio; cero, negativo o texto = inválido', () => {
  assert.equal(parseWholesalePrice(''), null);
  assert.equal(parseWholesalePrice(undefined), null);
  assert.equal(parseWholesalePrice('27.5'), 27.5);
  assert.equal(parseWholesalePrice(0), false);
  assert.equal(parseWholesalePrice('x'), false);
});

test('presentaciones: nombre, factor y precio válidos; sin repetir nombre ni código', () => {
  const [caja] = parseSaleUnits([{ name: 'Caja x 12', factor: 12, price: '110.456', code: 'CAJ-12' }], 'Unidad')!;
  assert.deepEqual(caja, { id: null, name: 'Caja x 12', factor: 12, price: 110.46, wholesalePrice: null, code: 'CAJ-12', allowsFractions: false });
  assert.equal(parseSaleUnits(undefined, 'Unidad'), undefined);
  assert.deepEqual(parseSaleUnits([], 'Unidad'), []);
  assert.throws(() => parseSaleUnits([{ name: 'unidad', factor: 1, price: 1 }], 'Unidad'), /igual a la unidad base/);
  assert.throws(() => parseSaleUnits([{ name: 'Caja', factor: 0, price: 1 }], 'Unidad'), /cuántas unidades base/);
  assert.throws(() => parseSaleUnits([{ name: 'Caja', factor: 12, price: 0 }], 'Unidad'), /precio de Caja/);
  assert.throws(() => parseSaleUnits([{ name: 'A', factor: 2, price: 1, code: 'X' }, { name: 'B', factor: 3, price: 1, code: 'X' }], 'Unidad'), /repetido/);
  assert.throws(() => parseSaleUnits(Array.from({ length: 11 }, (_, i) => ({ name: `P${i}`, factor: 2, price: 1 })), 'Unidad'), /hasta 10/);
  assert.throws(() => parseSaleUnits('caja', 'Unidad'), ProductError);
});

test('una presentación no puede tener el código de su propio producto', () => {
  assert.throws(() => assertUnitCodesDiffer([{ id: null, name: 'Caja', factor: 12, price: 1, wholesalePrice: null, code: 'CEM', allowsFractions: false }], 'CEM'));
  assert.doesNotThrow(() => assertUnitCodesDiffer(undefined, 'CEM'));
});

test('stock con decimales en alguna sucursal', () => {
  assert.equal(hasDecimalStock([{ stock: 10, reserved: 0 }, { stock: 2.5, reserved: 0 }]), true);
  assert.equal(hasDecimalStock([{ stock: 10, reserved: 1 }]), false);
});

test('importación de productos: valores por defecto, coma decimal y reglas del formulario', () => {
  const ok = parseProductImportRow({ code: 'CAB', name: 'Cable 14', price: '2,50', stock: '100.5', allowsFractions: 'sí' });
  assert.deepEqual('data' in ok && ok.data, {
    code: 'CAB', name: 'Cable 14', unit: 'Unidad', category: 'General', allowsFractions: true,
    price: 2.5, wholesalePrice: null, stock: 100.5, minStock: 10,
  });
  const error = (row: Record<string, unknown>) => {
    const result = parseProductImportRow(row);
    return 'error' in result ? result.error : null;
  };
  assert.match(error({ code: 'X', name: 'Algo', price: 1 })!, /código/);
  assert.match(error({ code: 'AB', name: 'Algo', price: 0 })!, /precio/);
  assert.match(error({ code: 'AB', name: 'Algo', price: 1, stock: 1.5 })!, /stock inicial/);
  assert.match(error({ code: 'AB', name: 'Algo', price: 1, wholesalePrice: 'x' })!, /mayorista/);
});

test('importación: las filas repetidas se marcan con la fila donde aparecieron primero', () => {
  const { valid, errors } = checkImportRows(
    [{ code: 'A1', name: 'Uno', price: 1 }, { code: 'a1', name: 'Otro', price: 1 }, { code: 'B2', name: 'Dos', price: 2 }],
    parseProductImportRow, r => r.code, (r, first) => `El código ${r.code} se repite en la fila ${first}.`,
  );
  assert.deepEqual(valid.map(v => [v.index, v.code]), [[0, 'A1'], [2, 'B2']]);
  assert.deepEqual(errors, [{ index: 1, error: 'El código a1 se repite en la fila 1.' }]);
});

test('categorías: nombre obligatorio al crear, opcional al editar; ícono y color del catálogo', () => {
  assert.equal(parseCategoryName(' Pinturas ', true), 'Pinturas');
  assert.equal(parseCategoryName(undefined, false), undefined);
  assert.throws(() => parseCategoryName('', true), /obligatorio/);
  assert.throws(() => parseCategoryName('x', false), CategoryError);
  const row = parseCategoryImportRow({ name: 'Pinturas', icon: 'Brush', color: 'BLUE' });
  assert.deepEqual('data' in row && row.data, { name: 'Pinturas', description: null, icon: 'fa-brush', color: 'blue' });
  assert.ok('error' in parseCategoryImportRow({ name: 'Pinturas', color: 'fucsia' }));
});

test('métricas de una categoría', () => {
  assert.deepEqual(categoryMetrics([{ stock: 5, minStock: 10, price: 2 }, { stock: 20, minStock: null, price: 1.5 }]), {
    productCount: 2, totalStock: 25, inventoryValue: 40, lowStockCount: 1,
  });
});
