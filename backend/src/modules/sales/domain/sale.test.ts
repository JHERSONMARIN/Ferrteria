// Reglas de ventas, sin base de datos ni servidor:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SaleError, assertCanCancel, assertCreditAvailable, assertExpectedTotal, computeDiscount, endOfBusinessDay, isQuoteValid,
  priceLine, splitPayment, toDocType, toPayMethod, unitPriceFor,
  type SellableProduct,
} from './sale.ts';
import { canDispatch, effectiveDispatchRole } from './dispatch.ts';
import { CartBody, DiscountBody } from '@ferresys/contracts/sales';
import { z } from '@ferresys/contracts/zod';
import { parseInput } from '../../../lib/validation.ts';
import { formatDocumentNumber, issuedNumber, nextFreeSeriesCode, nextQuoteNumber } from './documentNumber.ts';

// Lo que hace la ruta: el carrito y el descuento se validan con los esquemas del contrato.
const saleError = (message: string) => new SaleError(message);
const normalizeCart = (cart: unknown) => parseInput(z.object({ cart: CartBody }), { cart }, saleError).cart;
const parseDiscountRequest = (discount: unknown) => parseInput(z.object({ discount: DiscountBody }), { discount }, saleError).discount;

const cable: SellableProduct = {
  id: 1, name: 'Cable 14 AWG', code: 'CAB', price: 2.5, wholesalePrice: 2, active: true, allowsFractions: true, unit: 'Metro',
  saleUnits: [{ id: 9, name: 'Rollo x 100 m', factor: 100, price: 230, wholesalePrice: 210, allowsFractions: false }],
};

test('carrito: agrupa el mismo producto en la misma presentación y ordena por id', () => {
  assert.deepEqual(normalizeCart([{ id: 5, qty: 1 }, { id: 2, qty: 2 }, { id: 5, qty: 1.5 }, { id: 5, qty: 1, unitId: 9 }]), [
    { id: 2, unitId: null, qty: 2 }, { id: 5, unitId: null, qty: 2.5 }, { id: 5, unitId: 9, qty: 1 },
  ]);
});

test('carrito vacío, producto o cantidad inválidos se rechazan', () => {
  assert.throws(() => normalizeCart([]), /vacío/);
  assert.throws(() => normalizeCart([{ id: 0, qty: 1 }]), /producto inválido/);
  assert.throws(() => normalizeCart([{ id: 1, qty: -1, name: 'Cemento' }]), /Cantidad inválida para Cemento/);
  assert.throws(() => normalizeCart([{ id: 1, qty: 1, unitId: 'x' }]), /presentación/);
});

test('precio: la lista mayorista usa el precio mayorista si existe; la presentación tiene su propio precio', () => {
  assert.equal(unitPriceFor(cable, 'RETAIL'), 2.5);
  assert.equal(unitPriceFor(cable, 'WHOLESALE'), 2);
  assert.equal(unitPriceFor(cable, 'WHOLESALE', cable.saleUnits[0]!), 210);
  assert.equal(unitPriceFor({ ...cable, wholesalePrice: null }, 'WHOLESALE'), 2.5);
});

test('línea: 2.75 m a S/ 2.50 = 6.88; un rollo mueve 100 unidades del stock', () => {
  const metros = priceLine(cable, { id: 1, unitId: null, qty: 2.75 }, 2.5);
  assert.equal(metros.subtotal, 6.88);
  assert.equal(metros.baseQty, 2.75);
  const rollos = priceLine(cable, { id: 1, unitId: 9, qty: 2 }, 230);
  assert.deepEqual([rollos.subtotal, rollos.baseQty, rollos.unitName], [460, 200, 'Rollo x 100 m']);
});

test('cotización: vigente hasta el final de su plazo', () => {
  const created = new Date(2026, 8, 1, 10);
  assert.equal(isQuoteValid(created, 7, new Date(2026, 8, 8, 9)), true);
  assert.equal(isQuoteValid(created, 7, new Date(2026, 8, 8, 11)), false);
});

test('total desactualizado: se rechaza con PRECIOS_CAMBIARON y los precios nuevos', () => {
  const lines = [priceLine(cable, { id: 1, unitId: null, qty: 2 }, 2.5)];
  assert.doesNotThrow(() => assertExpectedTotal(5, lines, 5));
  assert.doesNotThrow(() => assertExpectedTotal(undefined, lines, 5));
  assert.throws(() => assertExpectedTotal(4, lines, 5), (e: unknown) =>
    e instanceof SaleError && e.codigo === 'PRECIOS_CAMBIARON' && Array.isArray(e.extra?.precios));
});

test('descuento: por porcentaje o monto, con tope por rol; el administrador no tiene tope', () => {
  assert.deepEqual(computeDiscount(100, null, 'VENDEDOR', 10), { discount: 0, total: 100 });
  assert.deepEqual(computeDiscount(100, { type: 'PERCENT', value: 10 }, 'VENDEDOR', 10), { discount: 10, total: 90 });
  assert.deepEqual(computeDiscount(100, { type: 'AMOUNT', value: 5 }, 'VENDEDOR', 10), { discount: 5, total: 95 });
  assert.throws(() => computeDiscount(100, { type: 'PERCENT', value: 20 }, 'VENDEDOR', 10), (e: unknown) =>
    e instanceof SaleError && e.codigo === 'DESCUENTO_EXCEDIDO' && /máximo es 10 %/.test(e.message));
  assert.throws(() => computeDiscount(100, { type: 'AMOUNT', value: 1 }, 'CAJERO', 0), /No tiene permitido/);
  assert.deepEqual(computeDiscount(100, { type: 'PERCENT', value: 50 }, 'ADMINISTRADOR', 0), { discount: 50, total: 50 });
  assert.throws(() => computeDiscount(100, { type: 'AMOUNT', value: 100 }, 'ADMINISTRADOR', 0), /todo el total/);
});

test('pedido de descuento: tipo válido, positivo y porcentaje hasta 100; 0 = sin descuento', () => {
  assert.equal(parseDiscountRequest(undefined), null);
  assert.equal(parseDiscountRequest({ type: 'PERCENT', value: 0 }), null);
  assert.throws(() => parseDiscountRequest({ type: 'REGALO', value: 5 }), /Tipo de descuento/);
  assert.throws(() => parseDiscountRequest({ type: 'PERCENT', value: 120 }), /100 %/);
});

test('pago: efectivo, digital, mixto que cuadre y fiado (que no entra a caja)', () => {
  assert.deepEqual(splitPayment('EFECTIVO', 50), { cash: 50, digital: 0 });
  assert.deepEqual(splitPayment('YAPE_PLIN', 50), { cash: 0, digital: 50 });
  assert.deepEqual(splitPayment('PAGO_MIXTO', 50, 20, 30), { cash: 20, digital: 30 });
  assert.throws(() => splitPayment('PAGO_MIXTO', 50, 20, 20), /no coincide/);
  assert.throws(() => splitPayment('PAGO_MIXTO', 50, -1, 51), /inválidos/);
  assert.deepEqual(splitPayment('FIADO', 50), { cash: 0, digital: 0 });
});

test('fiado: hasta el límite del cliente (1000 si no tiene uno propio)', () => {
  assert.doesNotThrow(() => assertCreditAvailable('Ana', 200, 800, null));
  assert.throws(() => assertCreditAvailable('Ana', 201, 800, null), (e: unknown) =>
    e instanceof SaleError && e.codigo === 'CREDITO_INSUFICIENTE' && /Disponible: S\/ 200.00/.test(e.message));
  assert.doesNotThrow(() => assertCreditAvailable('Ana', 2000, 0, 2500));
});

test('comprobante y medio de pago desde los nombres del POS', () => {
  assert.equal(toDocType('Factura'), 'FACTURA');
  assert.equal(toDocType('otro'), 'NOTA_VENTA');
  assert.equal(toPayMethod('Yape/Plin'), 'YAPE_PLIN');
  assert.equal(toPayMethod(undefined), 'EFECTIVO');
});

test('un pedido vence al cierre del día en Perú', () => {
  // 28/09 a las 23:00 en Lima (04:00 UTC del 29/09) todavía es el 28 allí.
  assert.equal(endOfBusinessDay(new Date('2026-09-29T04:00:00Z')).toISOString(), '2026-09-29T04:59:59.999Z');
});

test('anular: el vendedor sin caja solo los suyos y en su sucursal; el administrador, cualquiera', () => {
  const order = { sellerId: 7, branchId: 1, branchName: 'Principal' };
  assert.doesNotThrow(() => assertCanCancel(order, { id: 7, role: 'VENDEDOR', modules: ['pos'], branchId: 1 }));
  assert.throws(() => assertCanCancel(order, { id: 8, role: 'VENDEDOR', modules: ['pos'], branchId: 1 }), /propios pedidos/);
  assert.doesNotThrow(() => assertCanCancel(order, { id: 3, role: 'CAJERO', modules: ['caja'], branchId: 1 }));
  assert.throws(() => assertCanCancel(order, { id: 3, role: 'CAJERO', modules: ['caja'], branchId: 2 }), /sucursal Principal/);
  assert.doesNotThrow(() => assertCanCancel(order, { id: 1, role: 'ADMINISTRADOR', modules: [], branchId: 2 }));
});

test('despacho: responsable según el modo o la elección de la sucursal', () => {
  assert.equal(effectiveDispatchRole({ saleFlowMode: 'DIRECT' }), 'SELLER');
  assert.equal(effectiveDispatchRole({ saleFlowMode: 'STAGED' }), 'WAREHOUSE');
  assert.equal(effectiveDispatchRole({ saleFlowMode: 'STAGED', dispatchRole: 'CASHIER' }), 'CASHIER');
  assert.equal(canDispatch({ role: 'CAJERO', modules: ['caja'] }, { saleFlowMode: 'SEPARATE_CASHIER' }), true);
  assert.equal(canDispatch({ role: 'CAJERO', modules: ['caja'] }, { saleFlowMode: 'STAGED' }), false);
  assert.equal(canDispatch({ role: 'VENDEDOR', modules: ['despacho'] }, { saleFlowMode: 'DIRECT' }), true);
  assert.equal(canDispatch({ role: 'ADMINISTRADOR', modules: [] }, null), true);
});

test('numeración: series libres por letra, número con seis dígitos y cotizaciones correlativas', () => {
  assert.equal(nextFreeSeriesCode(new Set(['T001', 'T002']), 'T'), 'T003');
  assert.equal(formatDocumentNumber('B001', 42), 'B001-000042');
  assert.equal(issuedNumber('T002-000041', 'T002'), 41);
  assert.equal(issuedNumber(null, 'T002'), 0);
  assert.equal(nextQuoteNumber('COT-000009'), 'COT-000010');
  assert.equal(nextQuoteNumber(null), 'COT-000001');
});
