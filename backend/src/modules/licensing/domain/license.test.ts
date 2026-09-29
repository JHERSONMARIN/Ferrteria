// Reglas de la licencia, sin base de datos ni servidor:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURES, LicenseError, assertFeature, assertWithinLimit, licenseStatus, parseFeatures, parseLimit, parseModules,
  type License,
} from './license.ts';

const AVAILABLE = ['pos', 'caja', 'inventory', 'personal', 'audit'];
const ALWAYS = ['personal'];

const license = (overrides: Partial<License> = {}): License => ({
  plan: 'profesional',
  modules: AVAILABLE,
  features: [...FEATURES],
  limits: { maxUsers: null, maxBranches: null, maxCashRegisters: null },
  expiresAt: null,
  ...overrides,
});

test('módulos: sin valor, todos; con lista, esos más los que nunca se bloquean', () => {
  assert.deepEqual(parseModules(undefined, AVAILABLE, ALWAYS).licensed, AVAILABLE);
  assert.deepEqual(parseModules('  ', AVAILABLE, ALWAYS).licensed, AVAILABLE);
  assert.deepEqual(parseModules('caja, pos', AVAILABLE, ALWAYS).licensed, ['pos', 'caja', 'personal']);
});

test('módulos: los desconocidos se ignoran y se informan', () => {
  const parsed = parseModules('pos,farmacia', AVAILABLE, ALWAYS);
  assert.deepEqual(parsed.licensed, ['pos', 'personal']);
  assert.deepEqual(parsed.unknown, ['farmacia']);
});

test('funciones: sin variable o "*", todas; vacía, ninguna (plan Básico)', () => {
  assert.deepEqual(parseFeatures(undefined).licensed, [...FEATURES]);
  assert.deepEqual(parseFeatures('*').licensed, [...FEATURES]);
  assert.deepEqual(parseFeatures('').licensed, []);
  assert.deepEqual(parseFeatures('audit,branches,magia'), { licensed: ['branches', 'audit'], unknown: ['magia'] });
});

test('límites: 0, vacío o inválido = sin límite', () => {
  assert.equal(parseLimit('3'), 3);
  for (const raw of [undefined, '', '0', '-2', 'diez']) assert.equal(parseLimit(raw), null);
});

test('una función no contratada se rechaza con PLAN_NO_INCLUYE y un mensaje para el cliente', () => {
  assert.doesNotThrow(() => assertFeature(license(), 'audit'));
  assert.throws(() => assertFeature(license({ features: [] }), 'branches'), (error: unknown) =>
    error instanceof LicenseError && error.status === 403 && error.codigo === 'PLAN_NO_INCLUYE'
    && error.message.includes('las sucursales'));
});

test('límite: se puede crear hasta llegar al máximo, no más', () => {
  const tres = license({ limits: { maxUsers: 3, maxBranches: null, maxCashRegisters: null } });
  assert.doesNotThrow(() => assertWithinLimit(tres, 'maxUsers', 2, 'usuarios'));
  assert.throws(() => assertWithinLimit(tres, 'maxUsers', 3, 'usuarios'), /hasta 3 usuarios/);
  assert.doesNotThrow(() => assertWithinLimit(tres, 'maxBranches', 99, 'sucursales'));
});

test('vencimiento: vale hasta el final del día en Perú', () => {
  const vence = license({ expiresAt: '2026-10-31' });
  // 31/10 a las 23:00 en Lima (04:00 UTC del 1/11): todavía vigente.
  assert.equal(licenseStatus(vence, new Date('2026-11-01T04:00:00Z')).expired, false);
  // 1/11 a la 01:00 en Lima: vencida.
  const status = licenseStatus(vence, new Date('2026-11-01T06:00:00Z'));
  assert.equal(status.expired, true);
  assert.equal(licenseStatus(license(), new Date()).daysLeft, null);
});
