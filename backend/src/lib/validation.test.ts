// Comportamiento del ayudante de validación (Zod 4):  npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { AppError } from '@ferresys/shared/errors';
import { id, optionalId, parseInput } from './validation.ts';

const error = (message: string) => new AppError(message, 400);
const Body = z.object({ toId: id('Elija el destino.'), fromId: optionalId('Origen no válido.'), notes: z.unknown().optional() });

test('un id opcional puede faltar, venir vacío o null', () => {
  assert.deepEqual(parseInput(Body, { toId: 3 }, error), { toId: 3 });
  assert.equal(parseInput(Body, { toId: 3, fromId: '' }, error).fromId, undefined);
  assert.equal(parseInput(Body, { toId: 3, fromId: null }, error).fromId, undefined);
  assert.equal(parseInput(Body, { toId: '3', fromId: '7' }, error).fromId, 7);
});

test('un id inválido responde con el mensaje del esquema', () => {
  assert.throws(() => parseInput(Body, { toId: 'abc' }, error), /Elija el destino/);
  assert.throws(() => parseInput(Body, { toId: 3, fromId: -1 }, error), /Origen no válido/);
  assert.throws(() => parseInput(Body, {}, error), /Elija el destino/);
});

test('sin cuerpo se valida como objeto vacío', () => {
  assert.throws(() => parseInput(Body, undefined, error), (e: unknown) => e instanceof AppError && e.status === 400);
});

test('los mensajes que arma Zod solo salen en español', () => {
  assert.throws(() => parseInput(z.object({ n: z.number() }), { n: 'x' }, error), (e: unknown) =>
    e instanceof Error && !/expected|Invalid input/.test(e.message));
});
