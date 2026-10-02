// Receta en las ventas de farmacia:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { needOf, pharmacySale, prescriptionProblem, strongestNeed } from './prescription.ts';

test('qué pide cada producto', () => {
  assert.equal(needOf({}), 'none');
  assert.equal(needOf(null), 'none');
  assert.equal(needOf({ requiresPrescription: true }), 'prescription');
  assert.equal(needOf({ requiresPrescription: true, controlled: true }), 'controlled');
  assert.equal(strongestNeed(['none', 'prescription', 'none']), 'prescription');
  assert.equal(strongestNeed(['prescription', 'controlled']), 'controlled');
  assert.equal(strongestNeed([]), 'none');
});

test('sin productos con receta no se pide nada', () => {
  assert.equal(prescriptionProblem('none', undefined, []), null);
});

test('con receta: basta el número', () => {
  assert.match(prescriptionProblem('prescription', {}, ['Amoxicilina'])!, /Amoxicilina.*número de receta/);
  assert.equal(prescriptionProblem('prescription', { prescriptionNumber: 'R-1' }, ['Amoxicilina']), null);
});

test('con un controlado: número, médico y paciente', () => {
  assert.match(prescriptionProblem('controlled', { prescriptionNumber: 'R-1' }, ['Clonazepam'])!, /médico.*paciente/);
  assert.equal(prescriptionProblem('controlled', { prescriptionNumber: 'R-1', prescriber: 'Dr. Pérez CMP 12345', patient: 'Ana Ruiz' }, ['Clonazepam']), null);
});

test('los datos de la receta se guardan recortados y sin vacíos', () => {
  assert.deepEqual(pharmacySale.parse({ prescriptionNumber: ' R-1 ', prescriber: '' }), { prescriptionNumber: 'R-1' });
});
