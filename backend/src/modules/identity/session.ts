// Sesión y permisos en cada petición: la cookie de sesión, el usuario de la petición y los módulos que puede usar.
import type { NextFunction, Request, Response } from 'express';
import { passwordFingerprint, readSessionToken, SESSION_MAX_AGE_SECONDS } from '@ferresys/shared/sessionTokens';
import { setRequestUser } from '@ferresys/shared/logger';
import { prisma } from '../../db.ts';
import { getActiveModules } from '../licensing/index.ts';
import { getSettings } from '../settings/index.ts';
import type { SessionUser } from '../../types/express.d.ts';
import { canUseAnyModule, isAdmin } from './permissions.ts';

export const SESSION_COOKIE = 'ferresys_session';

// Secure solo con HTTPS (COOKIE_SECURE=true en producción); en HTTP local el navegador la rechazaría.
const cookieAttributes = () => ['HttpOnly', 'SameSite=Strict', 'Path=/api', ...(process.env.COOKIE_SECURE === 'true' ? ['Secure'] : [])];

export function setSessionCookie(res: Response, token: string): void {
  res.setHeader('Set-Cookie', [`${SESSION_COOKIE}=${token}`, `Max-Age=${SESSION_MAX_AGE_SECONDS}`, ...cookieAttributes()].join('; '));
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', [`${SESSION_COOKIE}=`, 'Max-Age=0', ...cookieAttributes()].join('; '));
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

// Identifica al usuario de la petición. Los datos se leen de la base en cada petición para que desactivar
// un usuario, cambiarle los módulos o la contraseña tenga efecto inmediato.
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const claims = readSessionToken(readCookie(req, SESSION_COOKIE));
    if (!claims) return res.status(401).json({ error: 'Sesión no iniciada o vencida.', codigo: 'SESION_INVALIDA' });

    const user = await prisma.usuario.findUnique({
      where: { id: claims.sub },
      select: {
        id: true, name: true, user: true, role: true, modules: true, active: true, mustChangePassword: true, pass: true, branchId: true,
        branch: { select: { id: true, name: true, saleFlowMode: true, deliveriesEnabled: true, dispatchRole: true } },
      },
    });
    if (!user || !user.active || passwordFingerprint(user.pass) !== claims.pwf) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Sesión no válida. Inicie sesión nuevamente.', codigo: 'SESION_INVALIDA' });
    }

    const { pass: _password, ...publicUser } = user;
    req.user = { ...publicUser, modules: Array.isArray(user.modules) ? user.modules as string[] : [] } as SessionUser;
    setRequestUser(req.user);
    next();
  } catch (error) {
    console.error('[sesión] Error al validar la sesión:', error);
    res.status(500).json({ error: 'No se pudo validar la sesión.' });
  }
}

// Mientras la clave sea temporal, la API solo permite cambiarla o cerrar sesión (rutas de /api/auth).
export function requirePasswordChanged(req: Request, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({ error: 'Debe cambiar su contraseña antes de continuar.', codigo: 'CAMBIO_CLAVE_REQUERIDO' });
  }
  next();
}

const forbidden = (res: Response) =>
  res.status(403).json({ error: 'No tiene permiso para realizar esta acción.', codigo: 'SIN_PERMISO' });

type Rule = string[] | 'authenticated' | 'admin';

// Reglas por método HTTP: { GET: ['pos', 'inventory'], POST: ['inventory'], default: [...] }.
// 'authenticated' permite a cualquier usuario con sesión; 'admin', solo al administrador.
export function allowModules(rules: Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'default', Rule>>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rule = rules[req.method as keyof typeof rules] ?? rules.default;
      if (rule === 'authenticated') return next();
      if (rule === 'admin') return isAdmin(req.user) ? next() : forbidden(res);
      if (!Array.isArray(rule)) return forbidden(res);
      const active = getActiveModules(await getSettings(prisma));
      return canUseAnyModule(active, req.user, rule) ? next() : forbidden(res);
    } catch (error) {
      console.error('[permisos] Error al verificar permisos:', error);
      res.status(500).json({ error: 'No se pudieron verificar los permisos.' });
    }
  };
}
