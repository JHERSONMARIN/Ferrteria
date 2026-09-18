import { prisma } from '../db.js';
import { getSettings } from '../services/settings.js';
import { getActiveModules } from '../services/license.js';

const isAdmin = (user) => user.role === 'ADMINISTRADOR';

// Un módulo se puede usar si está contratado y activo en la empresa, y asignado al usuario.
// El administrador tiene todos los módulos activos de la empresa sin asignárselos uno a uno.
async function canUseAnyModule(user, modules) {
  const activeModules = getActiveModules(await getSettings(prisma));
  return modules.some(m => activeModules.includes(m) && (isAdmin(user) || user.modules.includes(m)));
}

const forbidden = (res) =>
  res.status(403).json({ error: 'No tiene permiso para realizar esta acción.', codigo: 'SIN_PERMISO' });

// Reglas por método HTTP: { GET: ['pos', 'inventory'], POST: ['inventory'], default: [...] }.
// Un valor 'authenticated' permite a cualquier usuario con sesión; 'admin', solo al administrador.
export function allowModules(rules) {
  return async (req, res, next) => {
    try {
      const rule = rules[req.method] ?? rules.default;
      if (rule === 'authenticated') return next();
      if (rule === 'admin') return isAdmin(req.user) ? next() : forbidden(res);
      if (!Array.isArray(rule)) return forbidden(res);
      return (await canUseAnyModule(req.user, rule)) ? next() : forbidden(res);
    } catch (error) {
      console.error('[authorize] Error al verificar permisos:', error);
      res.status(500).json({ error: 'No se pudieron verificar los permisos.' });
    }
  };
}
