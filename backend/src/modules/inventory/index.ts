// Módulo de inventario (núcleo): stock por sucursal con reservas, kardex y transferencias.
// El stock se lleva en la unidad base del producto; sus presentaciones y fracciones viven en el catálogo.
// Es lo único que el resto del sistema importa de este módulo.
export { StockError, TransferError } from './domain/inventory.ts';
export {
  addStock, consumeReservedStock, ensureBranchStockRows, mainBranchId, releaseReservedStock, reserveStock,
  takeAvailableStock,
} from './infrastructure/stockOperations.ts';
export { kardexRoutes, transferRoutes } from './interface/routes.ts';
