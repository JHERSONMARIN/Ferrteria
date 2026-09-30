// Paquete de farmacia: registro sanitario y receta en los productos, lotes con vencimiento en el stock, y
// ventas que piden receta y no toman lo vencido.
import type { IndustryPackage } from '../hooks.ts';
import { stockEntry } from './lots.ts';
import { pharmacySale } from './prescription.ts';
import { pharmacyProduct } from './product.ts';
import { beforeSale } from './sale.ts';
import { onStockMovement } from './stock.ts';

export const farmacia: IndustryPackage = {
  id: 'farmacia',
  hooks: { beforeSale, onStockMovement },
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
    sale: pharmacySale,
  },
};
