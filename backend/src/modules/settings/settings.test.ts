// Reglas de la configuración, sin base de datos:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { SettingsValidationError, assertModesStillServed, validateSettingsInput } from './settings.ts';

const base = { legalName: 'Ferretería El Martillo S.A.C.', taxRate: 18, currencySymbol: 'S/' };

test('datos mínimos válidos; lo opcional vacío queda en null y lo que no viene no se toca', () => {
  const data = validateSettingsInput({ ...base, tradeName: '  ', taxId: '20600000001' });
  assert.equal(data.tradeName, null);
  assert.equal(data.taxId, '20600000001');
  assert.equal(data.logo, undefined);
  assert.equal(data.enabledModules, undefined);
  assert.equal(data.maxDiscountPercent, undefined);
});

test('razón social, RUC, correo, IGV y moneda se validan', () => {
  const invalid = (input: Record<string, unknown>) => () => validateSettingsInput({ ...base, ...input });
  assert.throws(invalid({ legalName: 'X' }), /razón social/);
  assert.throws(invalid({ taxId: '123' }), /11 dígitos/);
  assert.throws(invalid({ email: 'ventas@' }), /correo/);
  assert.throws(invalid({ taxRate: 120 }), /IGV/);
  assert.throws(invalid({ currencySymbol: '' }), /moneda/);
  assert.throws(invalid({ maxDiscountPercent: 101 }), /descuento máximo/);
});

test('logo y colores: formato controlado, vacío vuelve al estilo por defecto', () => {
  assert.equal(validateSettingsInput({ ...base, logo: '' }).logo, null);
  assert.throws(() => validateSettingsInput({ ...base, logo: 'http://sitio/logo.png' }), /PNG, JPG/);
  assert.equal(validateSettingsInput({ ...base, primaryColor: '#EA580C' }).primaryColor, '#ea580c');
  assert.throws(() => validateSettingsInput({ ...base, navColor: 'naranja' }), /#RRGGBB/);
});

test('no se apaga Caja ni Despacho mientras una sucursal los necesite', () => {
  assert.doesNotThrow(() => assertModesStillServed(['pos'], ['DIRECT']));
  assert.throws(() => assertModesStillServed(['pos', 'despacho'], ['DIRECT', 'SEPARATE_CASHIER']), /Caja debe seguir activo/);
  assert.throws(() => assertModesStillServed(['pos', 'caja'], ['STAGED']), SettingsValidationError);
});
