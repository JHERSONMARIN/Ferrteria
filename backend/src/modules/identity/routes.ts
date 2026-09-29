// Rutas HTTP de sesión (/api/auth) y de personal (/api/personal).
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { AppError, errorBody } from '@ferresys/shared/errors';
import { hashPassword, validateNewPassword, verifyPassword } from '@ferresys/shared/passwords';
import { createSessionToken } from '@ferresys/shared/sessionTokens';
import { registerFailure, registerSuccess, secondsBlocked } from '@ferresys/shared/loginThrottle';
import { prisma } from '../../db.ts';
import { id, parseInput } from '../../lib/validation.ts';
import { StaffError } from './permissions.ts';
import { authenticate, clearSessionCookie, setSessionCookie } from './session.ts';
import { createStaff, deleteStaff, listStaff, updateStaff } from './staff.ts';

type Handler = (req: Request, res: Response) => Promise<unknown>;

const handle = (failure: string, fn: Handler) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
    const code = (error as { code?: string }).code;
    if (code === 'P2002') return res.status(400).json({ error: 'El usuario ya se encuentra registrado.' });
    if (code === 'P2003') {
      return res.status(400).json({ error: 'No se puede eliminar el usuario porque tiene ventas o movimientos vinculados. En su lugar, desactívelo desde Editar.' });
    }
    console.error(`[identidad] ${failure}`, error);
    res.status(500).json({ error: failure });
  }
};

const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

// ---------- /api/auth ----------

export const authRoutes = express.Router();

// Si el usuario no existe se verifica igual contra este hash, para que el tiempo de respuesta no delate
// qué nombres de usuario existen.
const DUMMY_HASH = await hashPassword('ferresys-usuario-inexistente');

const LoginBody = z.object({
  user: z.string({ error: 'Usuario y contraseña requeridos.' }).trim().min(1, { error: 'Usuario y contraseña requeridos.' }),
  pass: z.string({ error: 'Usuario y contraseña requeridos.' }).min(1, { error: 'Usuario y contraseña requeridos.' }),
});

// POST /api/auth/login { user, pass }: con límite de intentos por usuario e IP.
authRoutes.post('/login', handle('Error interno de servidor en autenticación.', async (req, res) => {
  const { user, pass } = parseInput(LoginBody, req.body, m => new AppError(m, 400));
  const blockedFor = secondsBlocked(user, req.ip);
  if (blockedFor > 0) {
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Intente nuevamente en ${Math.ceil(blockedFor / 60)} minuto(s).`,
      codigo: 'DEMASIADOS_INTENTOS',
    });
  }

  const account = await prisma.usuario.findUnique({
    where: { user },
    select: {
      id: true, name: true, user: true, pass: true, role: true, modules: true, active: true, mustChangePassword: true, branchId: true,
      branch: { select: { id: true, name: true, saleFlowMode: true, deliveriesEnabled: true, dispatchRole: true } },
    },
  });
  const validPassword = await verifyPassword(pass, account ? account.pass : DUMMY_HASH);
  if (!account || !validPassword || !account.active) {
    registerFailure(user, req.ip);
    return res.status(401).json({ error: 'Credenciales incorrectas o usuario inactivo.' });
  }

  registerSuccess(user, req.ip);
  setSessionCookie(res, createSessionToken(account));
  const { pass: _password, ...publicUser } = account;
  res.json({ success: true, user: publicUser });
}));

// POST /api/auth/change-password { currentPassword, newPassword }
authRoutes.post('/change-password', authenticate, handle('No se pudo cambiar la contraseña.', async (req, res) => {
  const { currentPassword, newPassword } = body(req);
  const stored = await prisma.usuario.findUnique({ where: { id: req.user.id }, select: { pass: true } });
  if (!stored || !(await verifyPassword(String(currentPassword ?? ''), stored.pass))) {
    throw new AppError('La contraseña actual no es correcta.', 400);
  }
  validateNewPassword(newPassword);
  if (newPassword === currentPassword) throw new AppError('La nueva contraseña debe ser distinta de la actual.', 400);

  const updated = await prisma.usuario.update({
    where: { id: req.user.id },
    data: { pass: await hashPassword(String(newPassword)), mustChangePassword: false },
  });
  // La huella de la contraseña cambió: se entrega una sesión nueva y las demás quedan inválidas.
  setSessionCookie(res, createSessionToken(updated));
  res.json({ success: true, user: { ...req.user, mustChangePassword: false } });
}));

// POST /api/auth/logout
authRoutes.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

// GET /api/auth/me: usuario de la sesión (también sirve de latido para detectar cambios).
authRoutes.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// ---------- /api/personal ----------

export const staffRoutes = express.Router();

const Params = z.object({ id: id('ID de usuario inválido.') });
const staffId = (req: Request) => parseInput(Params, req.params, m => new StaffError(m)).id;

staffRoutes.get('/', handle('Error al listar personal.', async (req, res) => {
  res.json(await listStaff(prisma));
}));

staffRoutes.post('/', handle('Error al guardar personal.', async (req, res) => {
  res.status(201).json(await createStaff(prisma, body(req), req.user));
}));

staffRoutes.put('/:id', handle('Error al actualizar usuario en la base de datos.', async (req, res) => {
  res.json(await updateStaff(prisma, staffId(req), body(req), req.user));
}));

staffRoutes.delete('/:id', handle('Error al eliminar usuario.', async (req, res) => {
  res.json(await deleteStaff(prisma, staffId(req), req.user));
}));
