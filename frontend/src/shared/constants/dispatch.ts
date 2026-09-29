// Espejo de backend/src/modules/sales/domain/dispatch.ts: quién atiende "Por despachar" en cada sucursal.
import type { DispatchRole, SaleFlowMode } from '../../api/types.ts';

export interface DispatchRoleOption {
  id: DispatchRole;
  title: string;
  module: string;
  description: string;
}

// Lo que se necesita saber de la sucursal (la de la sesión o la que se edita en Configuración).
export interface DispatchBranch {
  saleFlowMode?: SaleFlowMode | null;
  dispatchRole?: DispatchRole | null;
}

export const DISPATCH_ROLE_OPTIONS: DispatchRoleOption[] = [
  { id: 'SELLER', title: 'Vendedor', module: 'pos', description: 'Quien vende prepara y entrega los envíos al repartidor.' },
  { id: 'CASHIER', title: 'Cajero', module: 'caja', description: 'Quien cobra prepara y entrega los envíos al repartidor.' },
  { id: 'WAREHOUSE', title: 'Almacén', module: 'despacho', description: 'Personal de almacén con el módulo Despacho.' },
];

const DEFAULT_BY_MODE: Record<SaleFlowMode, DispatchRole> = { DIRECT: 'SELLER', SEPARATE_CASHIER: 'CASHIER', STAGED: 'WAREHOUSE' };

export const effectiveDispatchRole = (branch: DispatchBranch | null | undefined): DispatchRole =>
  branch?.dispatchRole ?? (branch?.saleFlowMode ? DEFAULT_BY_MODE[branch.saleFlowMode] : undefined) ?? 'WAREHOUSE';

export const dispatchRoleModule = (branch: DispatchBranch | null | undefined): string | undefined => DISPATCH_ROLE_OPTIONS.find(o => o.id === effectiveDispatchRole(branch))?.module;
