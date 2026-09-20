// Espejo de backend/src/config/dispatch.js: quién atiende "Por despachar" en cada sucursal.
export const DISPATCH_ROLE_OPTIONS = [
  { id: 'SELLER', title: 'Vendedor', module: 'pos', description: 'Quien vende prepara y entrega los envíos al repartidor.' },
  { id: 'CASHIER', title: 'Cajero', module: 'caja', description: 'Quien cobra prepara y entrega los envíos al repartidor.' },
  { id: 'WAREHOUSE', title: 'Almacén', module: 'despacho', description: 'Personal de almacén con el módulo Despacho.' },
];

const DEFAULT_BY_MODE = { DIRECT: 'SELLER', SEPARATE_CASHIER: 'CASHIER', STAGED: 'WAREHOUSE' };

export const effectiveDispatchRole = (branch) => branch?.dispatchRole ?? DEFAULT_BY_MODE[branch?.saleFlowMode] ?? 'WAREHOUSE';

export const dispatchRoleModule = (branch) => DISPATCH_ROLE_OPTIONS.find(o => o.id === effectiveDispatchRole(branch))?.module;
