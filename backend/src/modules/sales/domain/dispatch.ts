// Quién despacha en cada sucursal: atiende "Por despachar" (los envíos a domicilio en cualquier modo y,
// por etapas, todo lo cobrado). Se elige en Configuración → Modo de trabajo; sin elección, depende del modo.
export const DISPATCH_ROLES = ['SELLER', 'CASHIER', 'WAREHOUSE'] as const;
export type DispatchRole = (typeof DISPATCH_ROLES)[number];

// Módulo que identifica a cada responsable.
export const DISPATCH_ROLE_MODULE: Record<DispatchRole, string> = { SELLER: 'pos', CASHIER: 'caja', WAREHOUSE: 'despacho' };

const DEFAULT_BY_MODE: Record<string, DispatchRole> = { DIRECT: 'SELLER', SEPARATE_CASHIER: 'CASHIER', STAGED: 'WAREHOUSE' };

interface DispatchBranch {
  dispatchRole?: string | null;
  saleFlowMode?: string | null;
}

export const effectiveDispatchRole = (branch: DispatchBranch | null | undefined): DispatchRole =>
  (branch?.dispatchRole as DispatchRole | null | undefined) ?? DEFAULT_BY_MODE[branch?.saleFlowMode ?? ''] ?? 'WAREHOUSE';

// El administrador y quien tenga el módulo Despacho pueden despachar siempre.
export function canDispatch(user: { role: string; modules: unknown }, branch: DispatchBranch | null | undefined): boolean {
  const modules = Array.isArray(user.modules) ? user.modules : [];
  return user.role === 'ADMINISTRADOR'
    || modules.includes('despacho')
    || modules.includes(DISPATCH_ROLE_MODULE[effectiveDispatchRole(branch)]);
}
