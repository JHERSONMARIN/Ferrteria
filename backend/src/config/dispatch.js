// Quién despacha en cada sucursal: atiende "Por despachar" (los envíos a domicilio en cualquier modo y,
// por etapas, todo lo cobrado). Se elige en Configuración → Modo de trabajo; sin elección, depende del modo.
export const DISPATCH_ROLES = ['SELLER', 'CASHIER', 'WAREHOUSE'];

// Módulo que identifica a cada responsable.
export const DISPATCH_ROLE_MODULE = { SELLER: 'pos', CASHIER: 'caja', WAREHOUSE: 'despacho' };

const DEFAULT_BY_MODE = { DIRECT: 'SELLER', SEPARATE_CASHIER: 'CASHIER', STAGED: 'WAREHOUSE' };

export const effectiveDispatchRole = (branch) => branch?.dispatchRole ?? DEFAULT_BY_MODE[branch?.saleFlowMode] ?? 'WAREHOUSE';

// El administrador y quien tenga el módulo Despacho asignado pueden despachar siempre.
export function canDispatch(user, branch) {
  const modules = Array.isArray(user.modules) ? user.modules : [];
  return user.role === 'ADMINISTRADOR'
    || modules.includes('despacho')
    || modules.includes(DISPATCH_ROLE_MODULE[effectiveDispatchRole(branch)]);
}
