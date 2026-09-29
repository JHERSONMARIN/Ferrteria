// Reglas de la auditoría, sin base de datos:  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditQueryError, auditFilter, changedFields } from './audit.ts';

test('solo se registran los campos que cambiaron; lo que no viene no se está cambiando', () => {
  assert.deepEqual(changedFields({ price: 30, name: 'Cemento' }, { price: 32, name: 'Cemento' }, ['price', 'name']), {
    price: { before: 30, after: 32 },
  });
  assert.equal(changedFields({ price: 30 }, { price: 30 }, ['price']), null);
  assert.equal(changedFields({ price: 30 }, { name: 'x' }, ['price']), null);
  assert.deepEqual(changedFields({ wholesalePrice: 27 }, { wholesalePrice: null }, ['wholesalePrice']), {
    wholesalePrice: { before: 27, after: null },
  });
});

test('filtro de la consulta: acción, usuario y días de Perú', () => {
  const { where, page } = auditFilter({ action: 'PRICE_CHANGED', userId: '3', from: '2026-09-01', to: '2026-09-30', page: '2' });
  assert.equal(where.action, 'PRICE_CHANGED');
  assert.equal(where.userId, 3);
  assert.deepEqual(where.createdAt, {
    gte: new Date('2026-09-01T05:00:00.000Z'),
    lte: new Date('2026-10-01T04:59:59.999Z'),
  });
  assert.equal(page, 2);
  assert.equal(auditFilter({}).page, 1);
});

test('valores inválidos en la consulta se rechazan', () => {
  assert.throws(() => auditFilter({ action: 'BORRAR_TODO' }), AuditQueryError);
  assert.throws(() => auditFilter({ userId: 'ana' }), /Usuario no válido/);
  assert.throws(() => auditFilter({ from: '01/09/2026' }), /AAAA-MM-DD/);
});
