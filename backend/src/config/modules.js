// Identificadores de módulo; deben coincidir con los del menú del frontend (constants/modules.js).
export const AVAILABLE_MODULES = [
  'pos', 'cotizaciones', 'caja', 'inventory', 'categories', 'kardex',
  'compras', 'deliveries', 'client-dir', 'customers', 'personal', 'dashboard',
];

// Sin "personal" nadie podría administrar usuarios ni reactivar módulos.
export const ALWAYS_ENABLED_MODULES = ['personal'];
