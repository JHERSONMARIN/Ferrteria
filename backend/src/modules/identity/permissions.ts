// Quién puede hacer qué: reglas puras de permisos y de administración del personal.
import { AppError } from '@ferresys/shared/errors';

export class StaffError extends AppError {
  static override area = 'PERSONAL';
}

export const ROLES = ['ADMINISTRADOR', 'VENDEDOR', 'CAJERO', 'REPARTIDOR', 'ALMACEN'] as const;
export type Role = (typeof ROLES)[number];

export const isAdmin = (user: { role: string }) => user.role === 'ADMINISTRADOR';

// Los módulos del usuario se guardan como JSON: se entregan siempre como lista de textos.
export const moduleList = (value: unknown): string[] =>
  (Array.isArray(value) ? value.filter((m): m is string => typeof m === 'string') : []);

// Un módulo se puede usar si está contratado y activo en la empresa, y asignado al usuario. El
// administrador tiene todos los módulos activos de la empresa sin asignárselos uno a uno.
export function canUseAnyModule(activeModules: readonly string[], user: { role: string; modules: readonly string[] }, required: readonly string[]) {
  return required.some(m => activeModules.includes(m) && (isAdmin(user) || user.modules.includes(m)));
}

export function parseRole(value: unknown, fallback: Role): Role {
  if (value === undefined || value === null || value === '') return fallback;
  if (!(ROLES as readonly unknown[]).includes(value)) throw new StaffError('Rol no válido.');
  return value as Role;
}

// Quien administra el personal sin ser administrador (tiene el módulo Personal) no puede crear
// administradores, dar ese rol ni tocar la cuenta de un administrador: sería una forma de volverse uno.
export function assertCanManage(actor: { role: string }, target: { currentRole?: string | null; newRole?: string | null }): void {
  if (isAdmin(actor)) return;
  if (target.currentRole === 'ADMINISTRADOR' || target.newRole === 'ADMINISTRADOR') {
    throw new StaffError('Solo un administrador puede crear o modificar administradores.', 403);
  }
}

// El administrador principal (el primero de la empresa) no se desactiva ni se elimina.
export const MAIN_ADMIN_ID = 1;
