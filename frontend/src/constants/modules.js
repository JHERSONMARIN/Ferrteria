// Módulos del sistema; los "value" deben coincidir con AVAILABLE_MODULES del backend.
export const MODULE_OPTIONS = [
  { value: 'pos', label: 'Punto de Venta', icon: 'fa-cash-register' },
  { value: 'cotizaciones', label: 'Cotizaciones', icon: 'fa-file-invoice' },
  { value: 'caja', label: 'Arqueo de Caja', icon: 'fa-vault' },
  { value: 'inventory', label: 'Almacén (Productos)', icon: 'fa-box' },
  { value: 'categories', label: 'Categorías', icon: 'fa-tags' },
  { value: 'kardex', label: 'Kardex / Movimientos', icon: 'fa-receipt' },
  { value: 'compras', label: 'Compras', icon: 'fa-cart-flatbed' },
  { value: 'deliveries', label: 'Entregas', icon: 'fa-truck-fast' },
  { value: 'client-dir', label: 'Dir. Clientes', icon: 'fa-users' },
  { value: 'customers', label: 'Créditos / Fiados', icon: 'fa-book-journal-whills' },
  { value: 'personal', label: 'Módulo Personal', icon: 'fa-id-badge' },
  { value: 'dashboard', label: 'Finanzas / Reportes', icon: 'fa-chart-pie' },
];

// Módulos que la empresa no puede desactivar (ver ALWAYS_ENABLED_MODULES en el backend).
export const ALWAYS_ENABLED_MODULES = ['personal'];
