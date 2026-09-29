// Reglas de envíos, sin base de datos ni servidor:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DeliveryError, assertBranchDelivers, assertCourierChange, canDeliver, cancellationNote, deliveryRef, isWaitingDispatch,
  parseDeliveryRequest,
} from './delivery.ts';

test('sin tipo DELIVERY no hay envío: el cliente se lleva los productos', () => {
  assert.equal(parseDeliveryRequest(undefined), null);
  assert.equal(parseDeliveryRequest({ type: 'PICKUP', address: 'Jr. Lima 123' }), null);
});

test('el envío exige dirección de 5 a 250 caracteres y un teléfono válido', () => {
  assert.deepEqual(parseDeliveryRequest({ type: 'DELIVERY', address: ' Jr. Lima 456 ', contactPhone: '976 111 222' }), {
    address: 'Jr. Lima 456', contactName: null, contactPhone: '976 111 222', notes: null,
  });
  assert.throws(() => parseDeliveryRequest({ type: 'DELIVERY', address: 'abc' }), /mínimo 5/);
  assert.throws(() => parseDeliveryRequest({ type: 'DELIVERY', address: 'x'.repeat(251) }), /250/);
  assert.throws(() => parseDeliveryRequest({ type: 'DELIVERY', address: 'Jr. Lima 456', contactPhone: 'llámame' }), /teléfono/);
});

test('una sucursal sin envíos activados no programa envíos', () => {
  assert.doesNotThrow(() => assertBranchDelivers({ name: 'Centro', deliveriesEnabled: true }));
  assert.throws(() => assertBranchDelivers({ name: 'Norte', deliveriesEnabled: false }), /Norte no hace envíos/);
});

test('espera despacho mientras la venta no salió del almacén; las entregas antiguas nunca esperan', () => {
  assert.equal(isWaitingDispatch('PAID'), true);
  assert.equal(isWaitingDispatch('DISPATCHED'), false);
  assert.equal(isWaitingDispatch(null), false);
});

test('reparte el repartidor, el administrador o quien tenga Entregas, de la misma sucursal', () => {
  const base = { active: true, branchId: 1, modules: [] as string[] };
  assert.equal(canDeliver({ ...base, role: 'REPARTIDOR' }, 1), true);
  assert.equal(canDeliver({ ...base, role: 'ADMINISTRADOR' }, 1), true);
  assert.equal(canDeliver({ ...base, role: 'VENDEDOR', modules: ['deliveries'] }, 1), true);
  assert.equal(canDeliver({ ...base, role: 'VENDEDOR' }, 1), false);
  assert.equal(canDeliver({ ...base, role: 'REPARTIDOR' }, 2), false);
  assert.equal(canDeliver({ ...base, role: 'REPARTIDOR', active: false }, 1), false);
  assert.equal(canDeliver(null, 1), false);
});

test('un repartidor solo toma lo libre para sí y solo suelta lo suyo', () => {
  const rep = { id: 5, role: 'REPARTIDOR' };
  assert.doesNotThrow(() => assertCourierChange(rep, null, 5));
  assert.doesNotThrow(() => assertCourierChange(rep, { id: 5, name: 'Rep' }, null));
  assert.throws(() => assertCourierChange(rep, { id: 6, name: 'Luis' }, 5), /ya lo tomó Luis/);
  assert.throws(() => assertCourierChange(rep, null, 6), /para usted mismo/);
  assert.doesNotThrow(() => assertCourierChange({ id: 1, role: 'ADMINISTRADOR' }, { id: 6, name: 'Luis' }, 5));
  assert.throws(() => assertCourierChange(rep, null, 6), DeliveryError);
});

test('referencia del envío y nota de cancelación', () => {
  assert.equal(deliveryRef('T001-000007'), 'ENT-T001-000007');
  assert.equal(cancellationNote('Portón verde', 'Ana', ' Recoge mañana '), 'Portón verde · Envío cancelado por Ana: Recoge mañana');
  assert.equal(cancellationNote(null, 'Ana', ''), 'Envío cancelado por Ana');
});
