// Identificadores de módulo; deben coincidir con los del menú del frontend (constants/modules.js).
export const AVAILABLE_MODULES = [
  'pos', 'cotizaciones', 'caja', 'inventory', 'categories', 'kardex',
  'compras', 'deliveries', 'despacho', 'client-dir', 'customers', 'personal', 'dashboard',
];

export const SALE_FLOW_MODES = ['DIRECT', 'SEPARATE_CASHIER', 'STAGED'];

// Sin "personal" nadie podría administrar usuarios ni reactivar módulos.
export const ALWAYS_ENABLED_MODULES = ['personal'];
