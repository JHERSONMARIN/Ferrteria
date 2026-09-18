import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_HOURS = 12;
export const SESSION_MAX_AGE_SECONDS = SESSION_HOURS * 60 * 60;

function resolveSecret() {
  const configured = process.env.JWT_SECRET;
  if (configured && configured.length >= 32) return configured;
  console.warn('[sesiones] JWT_SECRET no definido o muy corto: se usa uno temporal y las sesiones se cierran al reiniciar.');
  return randomBytes(48).toString('hex');
}

const SECRET = resolveSecret();

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (data) => createHmac('sha256', SECRET).update(data).digest('base64url');

// Huella de la contraseña guardada: si la contraseña cambia, los tokens anteriores dejan de valer.
export const passwordFingerprint = (storedPassword) =>
  createHash('sha256').update(String(storedPassword)).digest('base64url').slice(0, 16);

export function createSessionToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: user.id, pwf: passwordFingerprint(user.pass), iat: now, exp: now + SESSION_MAX_AGE_SECONDS });
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

// Devuelve el contenido del token si la firma es válida y no venció; si no, null.
export function readSessionToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expected = Buffer.from(sign(`${header}.${payload}`));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!Number.isInteger(claims.sub) || typeof claims.exp !== 'number') return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
