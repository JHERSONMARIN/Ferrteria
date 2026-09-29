// Módulo de identidad (núcleo): inicio de sesión, sesión de cada petición, permisos por módulo y personal.
// Es lo único que el resto del sistema importa de este módulo.
export { ROLES, StaffError, isAdmin, type Role } from './permissions.ts';
export { SESSION_COOKIE, allowModules, authenticate, requirePasswordChanged } from './session.ts';
export { authRoutes, staffRoutes } from './routes.ts';
