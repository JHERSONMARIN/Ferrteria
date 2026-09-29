// Sucursal de una operación de stock, sin base de datos (con una sucursal de ejemplo):  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { BranchError, resolveBranchId } from './branches.ts';

// Solo lo que usa resolveBranchId: la sucursal 2 existe y está activa; la 3 está desactivada.
const db = {
  branch: {
    findUnique: async ({ where }: { where: { id: number } }) => (where.id === 2 ? { active: true } : where.id === 3 ? { active: false } : null),
  },
} as unknown as Parameters<typeof resolveBranchId>[0];

const seller = { branchId: 1, role: 'VENDEDOR' };
const admin = { branchId: 1, role: 'ADMINISTRADOR' };

test('sin indicar sucursal se usa la propia', async () => {
  assert.equal(await resolveBranchId(db, seller, undefined), 1);
  assert.equal(await resolveBranchId(db, seller, ''), 1);
  assert.equal(await resolveBranchId(db, seller, '1'), 1);
});

test('solo el administrador opera en otra sucursal, y solo si está activa', async () => {
  await assert.rejects(resolveBranchId(db, seller, 2), (e: unknown) => e instanceof BranchError && e.status === 403);
  assert.equal(await resolveBranchId(db, admin, '2'), 2);
  await assert.rejects(resolveBranchId(db, admin, 3), (e: unknown) => e instanceof BranchError && e.status === 404);
  await assert.rejects(resolveBranchId(db, admin, 9), /no existe/);
  await assert.rejects(resolveBranchId(db, admin, 'norte'), /no válida/);
});
