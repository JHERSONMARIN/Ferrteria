// Rubros: el paquete de la empresa (según su licencia) y los enganches que llama el núcleo.
// Es lo único que los módulos importan de aquí.
import { INDUSTRY } from '../modules/licensing/index.ts';
import type { IndustryData } from './hooks.ts';
import { PACKAGES, hooksFor, parseIndustryData } from './registry.ts';

export type { IndustryData, SaleContext, SaleLine, StockMovement } from './hooks.ts';
export { IndustryDataError } from './registry.ts';

export const industryPackage = PACKAGES[INDUSTRY];
export const industryHooks = hooksFor(industryPackage);
export const vocabulary = industryPackage.vocabulary;

// Lo que viene de la columna JSON, como objeto (Prisma la tipa como cualquier valor JSON).
export const industryDataOf = (value: unknown): IndustryData =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as IndustryData : {};

export const parseProductData = (raw: unknown) => parseIndustryData(industryPackage, 'product', raw);
export const parseStockEntryData = (raw: unknown) => parseIndustryData(industryPackage, 'stockEntry', raw);
export const parseSaleData = (raw: unknown) => parseIndustryData(industryPackage, 'sale', raw);
