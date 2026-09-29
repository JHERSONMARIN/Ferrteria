// Módulo de catálogo: productos, categorías y presentaciones de venta.
// Núcleo: producto, precio, precio mayorista, categoría. Propio de ferretería: las presentaciones (caja x 12,
// rollo x 100 m) y la venta fraccionada (metro, kilo); un paquete de rubro podrá reemplazarlas o extenderlas.
// Es lo único que el resto del sistema importa de este módulo.
export { CategoryError, ProductError } from './domain/catalog.ts';
export { categoryRoutes, productRoutes } from './interface/routes.ts';
