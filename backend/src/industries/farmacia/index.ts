// Paquete de farmacia: registro sanitario y receta en los productos.
import type { IndustryPackage } from '../hooks.ts';
import { pharmacyProduct } from './product.ts';

export const farmacia: IndustryPackage = {
  id: 'farmacia',
  hooks: {},
  vocabulary: {
    business: 'farmacia',
    businesses: 'farmacias',
    product: 'producto',
    products: 'productos',
    sampleTradeName: 'Farmacia San Martín',
  },
  fields: {
    product: pharmacyProduct,
  },
};
