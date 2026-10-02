// Módulo de catálogo (núcleo): productos, precios, categorías y presentaciones de venta.
// Las presentaciones (caja x 12, rollo x 100 m, blíster x 10) y la venta fraccionada (metro, kilo, tableta)
// son del núcleo y cada producto las configura: las usa cualquier comercio y cambian precio y cantidad,
// algo que un paquete de rubro no puede tocar.
// Es lo único que el resto del sistema importa de este módulo.
export { CategoryError, ProductError } from './domain/catalog.ts';
export { categoryRoutes, productRoutes } from './interface/routes.ts';
