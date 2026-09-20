// Acceso del personal de VALETEC a la consola. Mismo esquema que las empresas: contraseña con scrypt y
// sesión en cookie firmada, pero con su propia base y su propio secreto.
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword, validateNewPassword, PasswordPolicyError } from './passwords.js';
import { createSessionToken, readSessionToken, passwordFingerprint, SESSION_MAX_AGE_SECONDS } from './sessionTokens.js';

export const SESSION_COOKIE = 'ferresys_console';
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export { PasswordPolicyError };

// Primer arranque: crea el super administrador con la clave de CONSOLE_ADMIN_PASSWORD o una generada.
export async function bootstrapConsoleUser() {
  if (await prisma.consoleUser.count() > 0) return;
  const user = (process.env.CONSOLE_ADMIN_USER || 'valetec').trim();
  const provided = process.env.CONSOLE_ADMIN_PASSWORD?.trim();
  const password = provided || randomBytes(9).toString('base64url');
  await prisma.consoleUser.create({
    data: { name: 'Super administrador', user, pass: await hashPassword(password), mustChangePassword: true },
  });
  console.log(`[consola] Usuario inicial: ${user}`);
  if (!provided) console.log(`[consola] Contraseña generada (se muestra solo esta vez): ${password}`);
}

export async function login(username, password) {
  const account = await prisma.consoleUser.findUnique({ where: { user: String(username ?? '').trim() } });
  const valid = await verifyPassword(String(password ?? ''), account ? account.pass : DUMMY_HASH);
  if (!account || !valid || !account.active) return null;
  const { pass: _, ...publicUser } = account;
  return { user: publicUser, token: createSessionToken(account) };
}

export async function userFromToken(token) {
  const claims = readSessionToken(token);
  if (!claims) return null;
  const account = await prisma.consoleUser.findUnique({ where: { id: claims.sub } });
  if (!account || !account.active || passwordFingerprint(account.pass) !== claims.pwf) return null;
  const { pass: _, ...publicUser } = account;
  return publicUser;
}

// Devuelve la sesión nueva: al cambiar la contraseña, la anterior deja de valer.
export async function changePassword(userId, currentPassword, newPassword) {
  const account = await prisma.consoleUser.findUnique({ where: { id: userId } });
  if (!account || !(await verifyPassword(String(currentPassword ?? ''), account.pass))) return null;
  validateNewPassword(newPassword);
  if (newPassword === currentPassword) throw new PasswordPolicyError('La nueva contraseña debe ser distinta de la actual.');
  const updated = await prisma.consoleUser.update({
    where: { id: userId },
    data: { pass: await hashPassword(newPassword), mustChangePassword: false },
  });
  const { pass: _, ...publicUser } = updated;
  return { user: publicUser, token: createSessionToken(updated) };
}

export const sessionCookie = (token) =>
  `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`;

export const clearedCookie = () =>
  `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`;

export const readCookie = (req, name) => {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const found = raw.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
};
