// Nombres en castellano de las funciones del plan (espejo de backend/src/config/features.js).
// Sirven para mostrarle al cliente qué incluye su plan y qué no.
export const FEATURE_LABELS = {
  split_flow: 'Vendedor y caja separados (pedidos y flujo por etapas)',
  shared_cash: 'Varias cajas y turnos compartidos entre cajeros',
  deliveries: 'Envíos a domicilio',
  wholesale: 'Lista de precios mayorista',
  discounts: 'Descuentos en las ventas',
  period_reports: 'Reportes por período y exportación a Excel',
  branches: 'Varias sucursales y transferencias de stock',
  audit: 'Auditoría de operaciones',
  sunat: 'Facturación electrónica SUNAT',
};

export const FEATURE_ORDER = Object.keys(FEATURE_LABELS);
