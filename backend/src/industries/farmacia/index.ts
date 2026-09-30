// Paquete de farmacia: registro sanitario y receta en los productos, y lotes con vencimiento en el stock.
import type { IndustryPackage } from '../hooks.ts';
import { stockEntry } from './lots.ts';
import { pharmacyProduct } from './product.ts';
import { onStockMovement } from './stock.ts';

export const farmacia: IndustryPackage = {
  id: 'farmacia',
  hooks: { onStockMovement },
  vocabulary: {
    business: 'farmacia',
    businesses: 'farmacias',
    product: 'producto',
    products: 'productos',
    sampleTradeName: 'Farmacia San Martín',
  },
  fields: {
    product: pharmacyProduct,
    stockEntry,
  },
};
