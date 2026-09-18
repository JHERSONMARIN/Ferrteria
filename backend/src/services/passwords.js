import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const ALGORITHM = 'scrypt';
// Parámetros guardados junto al hash para poder endurecerlos sin invalidar claves antiguas.
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;

export class PasswordPolicyError extends Error {}

export const isPasswordHashed = (stored) => typeof stored === 'string' && stored.startsWith(`${ALGORITHM}$`);

export async function hashPassword(plainPassword) {
  const salt = randomBytes(16);
  const key = await scryptAsync(plainPassword, salt, KEY_LENGTH, {
    N: COST, r: BLOCK_SIZE, p: PARALLELIZATION,
  });
  return [ALGORITHM, COST, BLOCK_SIZE, PARALLELIZATION, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(plainPassword, stored) {
  if (!isPasswordHashed(stored) || typeof plainPassword !== 'string') return false;
  const [, cost, blockSize, parallelization, saltB64, keyB64] = stored.split('$');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(plainPassword, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(cost), r: Number(blockSize), p: Number(parallelization),
  });
  // Comparación en tiempo constante: no revela cuántos bytes coinciden.
  return timingSafeEqual(actual, expected);
}

export function validateNewPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.trim().length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (plainPassword.length > 128) {
    throw new PasswordPolicyError('La contraseña no puede superar 128 caracteres.');
  }
}
