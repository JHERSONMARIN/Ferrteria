// Sesión y personal (módulo identity del backend).
import type { IsoDate } from './common.ts';
import { optionalId, z } from './zod.ts';

export const ROLES = ['ADMINISTRADOR', 'VENDEDOR', 'CAJERO', 'REPARTIDOR', 'ALMACEN'] as const;
export type Role = (typeof ROLES)[number];
export type SaleFlowMode = 'DIRECT' | 'SEPARATE_CASHIER' | 'STAGED';
export type DispatchRole = 'SELLER' | 'CASHIER' | 'WAREHOUSE';

/** La sucursal del usuario, con lo que decide cómo trabaja (modo de venta, envíos y quién despacha). */
export interface SessionBranch {
  id: number;
  name: string;
  saleFlowMode: SaleFlowMode;
  deliveriesEnabled: boolean;
  dispatchRole: DispatchRole | null;
}

/** El usuario de la sesión: POST /api/auth/login, GET /api/auth/me. */
export interface SessionUser {
  id: number;
  name: string;
  user: string;
  role: Role;
  modules: string[];
  active: boolean;
  mustChangePassword: boolean;
  branchId: number;
  branch: SessionBranch | null;
}

/** POST /api/auth/login */
export const LoginBody = z.object({
  user: z.string({ error: 'Usuario y contraseña requeridos.' }).trim().min(1, { error: 'Usuario y contraseña requeridos.' }),
  pass: z.string({ error: 'Usuario y contraseña requeridos.' }).min(1, { error: 'Usuario y contraseña requeridos.' }),
});
export type LoginRequest = z.input<typeof LoginBody>;

export interface LoginResponse {
  success: true;
  user: SessionUser;
}

export interface MeResponse {
  user: SessionUser;
}

/** POST /api/auth/change-password. Las reglas de la nueva contraseña las aplica el servidor (las comparte con la consola). */
export const ChangePasswordBody = z.object({
  currentPassword: z.string().nullish().transform(value => value ?? ''),
  newPassword: z.string().nullish(),
});
export type ChangePasswordRequest = z.input<typeof ChangePasswordBody>;

/** GET /api/personal */
export interface StaffMember {
  id: number;
  name: string;
  user: string;
  role: Role;
  modules: string[];
  active: boolean;
  branchId: number;
  branch: { id: number; name: string };
  createdAt: IsoDate;
}

const staffText = z.string().nullish().transform(value => value?.trim() ?? '');
const staffFields = {
  // Vacío = el de siempre (al crear, vendedor; al editar, el que tenía).
  role: z.preprocess(value => (value === '' || value === null ? undefined : value),
    z.enum(ROLES, { error: 'Rol no válido.' }).optional()),
  // Que estén en el plan de la empresa lo revisa el servidor. Sin lista, se conservan.
  modules: z.array(z.string(), { error: 'La lista de módulos no es válida.' }).nullish(),
  branchId: optionalId('La sucursal elegida no existe o está desactivada.'),
  active: z.boolean().optional().catch(undefined),
};

/** POST /api/personal. La contraseña es temporal: el empleado la cambia al ingresar. */
export const CreateStaffBody = z.object({
  name: staffText,
  user: staffText,
  pass: z.string().nullish(),
  ...staffFields,
}).refine(data => data.name && data.user && data.pass, { error: 'Nombre, usuario y contraseña son obligatorios.' })
  .transform(data => ({ ...data, pass: data.pass! }));
export type CreateStaffRequest = z.input<typeof CreateStaffBody>;

/** PUT /api/personal/:id (sin pass, o vacía, conserva la contraseña). */
export const UpdateStaffBody = z.object({
  name: staffText,
  user: staffText,
  pass: z.string().nullish().transform(value => (value?.trim() ? value : undefined)),
  ...staffFields,
}).refine(data => data.name && data.user, { error: 'El nombre y el usuario son obligatorios.' });
export type UpdateStaffRequest = z.input<typeof UpdateStaffBody>;
