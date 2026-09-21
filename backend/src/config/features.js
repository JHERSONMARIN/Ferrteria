// Funciones licenciables que no son módulos del menú. El plan de cada empresa las define en su .env
// (LICENSED_FEATURES) junto con los límites (MAX_USERS, MAX_BRANCHES, MAX_CASH_REGISTERS).
// El catálogo de planes vive en deploy/plans.json.
export const AVAILABLE_FEATURES = [
  'split_flow',      // modos "vendedor y caja" y "por etapas"
  'shared_cash',     // varias cajas y turnos compartidos
  'deliveries',      // envíos a domicilio
  'wholesale',       // lista de precios mayorista
  'discounts',       // descuentos con tope por rol
  'period_reports',  // reportes por período y exportación CSV
  'branches',        // varias sucursales y transferencias
  'audit',           // auditoría
  'sunat',           // facturación electrónica (Fase 7)
];

// Límites del plan. 0 = sin límite.
export const LIMIT_VARIABLES = ['MAX_USERS', 'MAX_BRANCHES', 'MAX_CASH_REGISTERS'];
