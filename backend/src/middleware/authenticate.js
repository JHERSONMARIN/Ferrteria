import { prisma } from '../db.js';
import { readSessionToken, passwordFingerprint, SESSION_MAX_AGE_SECONDS } from '../services/sessionTokens.js';

export const SESSION_COOKIE = 'ferresys_session';

// Secure solo con HTTPS (COOKIE_SECURE=true en producción); en HTTP local el navegador la rechazaría.
const cookieAttributes = () => [
  'HttpOnly',
  'SameSite=Strict',
  'Path=/api',
  ...(process.env.COOKIE_SECURE === 'true' ? ['Secure'] : []),
];

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', [`${SESSION_COOKIE}=${token}`, `Max-Age=${SESSION_MAX_AGE_SECONDS}`, ...cookieAttributes()].join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [`${SESSION_COOKIE}=`, 'Max-Age=0', ...cookieAttributes()].join('; '));
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

// Identifica al usuario de la petición. Los datos se leen de la base en cada petición para
// que desactivar un usuario o cambiar sus módulos tenga efecto inmediato.
export async function authenticate(req, res, next) {
  try {
    const claims = readSessionToken(readCookie(req, SESSION_COOKIE));
    if (!claims) return res.status(401).json({ error: 'Sesión no iniciada o vencida.', codigo: 'SESION_INVALIDA' });

    const user = await prisma.usuario.findUnique({
      where: { id: claims.sub },
      select: {
        id: true, name: true, user: true, role: true, modules: true, active: true,
        mustChangePassword: true, pass: true, branchId: true, branch: { select: { id: true, name: true } },
      },
    });
    if (!user || !user.active || passwordFingerprint(user.pass) !== claims.pwf) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Sesión no válida. Inicie sesión nuevamente.', codigo: 'SESION_INVALIDA' });
    }

    const { pass: _password, ...publicUser } = user;
    req.user = { ...publicUser, modules: Array.isArray(user.modules) ? user.modules : [] };
    next();
  } catch (error) {
    console.error('[authenticate] Error al validar la sesión:', error);
    res.status(500).json({ error: 'No se pudo validar la sesión.' });
  }
}

// Mientras la clave sea temporal, la API solo permite cambiarla o cerrar sesión (rutas de /api/auth).
export function requirePasswordChanged(req, res, next) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({ error: 'Debe cambiar su contraseña antes de continuar.', codigo: 'CAMBIO_CLAVE_REQUERIDO' });
  }
  next();
}
