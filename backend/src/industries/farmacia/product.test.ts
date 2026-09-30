// Datos de farmacia en un producto:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { pharmacyProduct } from './product.ts';

test('farmacia: todo es opcional; sin datos no pide receta', () => {
  assert.deepEqual(pharmacyProduct.parse({}), { requiresPrescription: false, controlled: false });
});

test('farmacia: textos recortados y vacíos como ausentes', () => {
  const data = pharmacyProduct.parse({ sanitaryRegistration: ' EE-01234 ', laboratory: '  ', activeIngredient: 'Paracetamol' });
  assert.equal(data.sanitaryRegistration, 'EE-01234');
  assert.equal(data.laboratory, undefined);
  assert.equal(data.activeIngredient, 'Paracetamol');
});

test('farmacia: un controlado siempre pide receta', () => {
  assert.equal(pharmacyProduct.parse({ controlled: true }).requiresPrescription, true);
});

test('farmacia: tipos y largos con mensaje para el usuario', () => {
  assert.throws(() => pharmacyProduct.parse({ requiresPrescription: 'si' }), /Requiere receta/);
  assert.throws(() => pharmacyProduct.parse({ sanitaryRegistration: 'x'.repeat(31) }), /hasta 30/);
});
