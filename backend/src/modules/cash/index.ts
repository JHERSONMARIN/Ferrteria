// Módulo de caja (núcleo): cajas físicas, turnos compartidos y arqueo. Igual en cualquier comercio.
// Es lo único que el resto del sistema importa de este módulo.
export { CashError } from './domain/cash.ts';
export { requireOpenSession } from './application/cashService.ts';
export { default as cashRoutes } from './interface/routes.ts';
