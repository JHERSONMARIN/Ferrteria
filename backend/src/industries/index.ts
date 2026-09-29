// Rubros: el paquete de la empresa (según su licencia) y los enganches que llama el núcleo.
// Es lo único que los módulos importan de aquí.
import { INDUSTRY } from '../modules/licensing/index.ts';
import { PACKAGES, hooksFor } from './registry.ts';

export type { SaleContext, SaleLine, StockMovement } from './hooks.ts';

export const industryPackage = PACKAGES[INDUSTRY];
export const industryHooks = hooksFor(industryPackage);
export const vocabulary = industryPackage.vocabulary;
