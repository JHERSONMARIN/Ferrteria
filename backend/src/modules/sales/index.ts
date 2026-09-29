// Módulo de ventas (núcleo): venta directa, pedidos por estados, cotizaciones y numeración de comprobantes.
// Los tres modos de trabajo son el mismo ciclo de venta; la configuración de la sucursal decide qué pasos
// ocurren solos. Es lo único que el resto del sistema importa de este módulo.
export { SaleError } from './domain/sale.ts';
export { DocumentSeriesError } from './domain/documentNumber.ts';
export { DISPATCH_ROLES, DISPATCH_ROLE_MODULE, canDispatch, effectiveDispatchRole } from './domain/dispatch.ts';
export { initializeDocumentSeries, nextDocumentNumber } from './infrastructure/documentSeries.ts';
export { expireOrders } from './application/orders.ts';
export { orderRoutes, quoteRoutes, salesRoutes } from './interface/routes.ts';
