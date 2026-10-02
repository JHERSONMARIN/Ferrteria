// Sesión y personal (módulo identity del backend).
import type { IsoDate } from './common.ts';

export type Role = 'ADMINISTRADOR' | 'VENDEDOR' | 'CAJERO' | 'REPARTIDOR' | 'ALMACEN';
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

export interface LoginRequest {
  user: string;
  pass: string;
}

export interface LoginResponse {
  success: true;
  user: SessionUser;
}

export interface MeResponse {
  user: SessionUser;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

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

/** POST /api/personal y PUT /api/personal/:id (sin pass al editar = conserva la contraseña). */
export interface StaffRequest {
  name: string;
  user: string;
  pass?: string;
  role: Role;
  modules: string[];
  active: boolean;
  branchId?: number;
}
