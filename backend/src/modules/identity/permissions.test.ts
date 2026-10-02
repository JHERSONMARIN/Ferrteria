// Reglas de permisos, sin base de datos:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { UpdateStaffBody } from '@ferresys/contracts/identity';
import { parseInput } from '../../lib/validation.ts';
import { StaffError, assertCanManage, canUseAnyModule } from './permissions.ts';

// Lo que hace la ruta: el rol se valida con el esquema del contrato; vacío = el que ya tenía.
const parseRole = (role: unknown, fallback: string) =>
  parseInput(UpdateStaffBody, { name: 'Ana', user: 'ana', role }, m => new StaffError(m)).role ?? fallback;

test('un módulo se usa si está activo en la empresa y asignado; el administrador, todos los activos', () => {
  const active = ['pos', 'caja', 'inventory'];
  assert.equal(canUseAnyModule(active, { role: 'CAJERO', modules: ['caja'] }, ['caja']), true);
  assert.equal(canUseAnyModule(active, { role: 'CAJERO', modules: ['caja'] }, ['inventory']), false);
  assert.equal(canUseAnyModule(active, { role: 'VENDEDOR', modules: ['compras'] }, ['compras']), false); // no activo
  assert.equal(canUseAnyModule(active, { role: 'ADMINISTRADOR', modules: [] }, ['inventory']), true);
  assert.equal(canUseAnyModule(active, { role: 'ADMINISTRADOR', modules: [] }, ['audit']), false);
});

test('rol: uno de los conocidos, o el de siempre si no viene', () => {
  assert.equal(parseRole('CAJERO', 'VENDEDOR'), 'CAJERO');
  assert.equal(parseRole(undefined, 'VENDEDOR'), 'VENDEDOR');
  assert.throws(() => parseRole('SUPERUSUARIO', 'VENDEDOR'), StaffError);
});

test('sin ser administrador no se crean ni se tocan administradores', () => {
  const manager = { role: 'VENDEDOR' };
  assert.doesNotThrow(() => assertCanManage(manager, { newRole: 'CAJERO' }));
  assert.doesNotThrow(() => assertCanManage(manager, { currentRole: 'CAJERO', newRole: 'ALMACEN' }));
  for (const target of [{ newRole: 'ADMINISTRADOR' }, { currentRole: 'ADMINISTRADOR', newRole: 'ADMINISTRADOR' }, { currentRole: 'ADMINISTRADOR' }]) {
    assert.throws(() => assertCanManage(manager, target), (e: unknown) => e instanceof StaffError && e.status === 403);
  }
  assert.doesNotThrow(() => assertCanManage({ role: 'ADMINISTRADOR' }, { newRole: 'ADMINISTRADOR' }));
});
