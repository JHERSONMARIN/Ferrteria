// Paquete de ferretería: lo propio del rubro sobre el núcleo comercial.
import type { IndustryPackage } from '../hooks.ts';

// Presentaciones y venta fraccionada no están aquí: son del núcleo (ver modules/catalog).
export const ferreteria: IndustryPackage = {
  id: 'ferreteria',
  hooks: {},
  vocabulary: {
    business: 'ferretería',
    businesses: 'ferreterías',
    product: 'producto',
    products: 'productos',
    sampleTradeName: 'Ferretería Los Andes',
  },
};
