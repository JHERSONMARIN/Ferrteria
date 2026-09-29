// Módulo de inventario (núcleo): stock por sucursal con reservas, kardex y transferencias.
// Las unidades de venta y las fracciones (metro, kilo) son de ferretería: viven en el catálogo.
// Es lo único que el resto del sistema importa de este módulo.
export { StockError, TransferError } from './domain/inventory.ts';
export {
  addStock, consumeReservedStock, ensureBranchStockRows, mainBranchId, releaseReservedStock, reserveStock,
  takeAvailableStock,
} from './infrastructure/stockOperations.ts';
export { kardexRoutes, transferRoutes } from './interface/routes.ts';
