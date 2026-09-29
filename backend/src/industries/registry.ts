// Los paquetes de rubro disponibles y cómo los llama el núcleo. Sin dependencias del entorno: se prueba
// con paquetes falsos (registry.test.ts).
import type { Industry } from '@ferresys/shared/industries';
import type { Tx } from '../db.ts';
import { ferreteria } from './ferreteria/index.ts';
import type { IndustryPackage, SaleContext, StockMovement } from './hooks.ts';

// Un paquete por rubro de packages/shared/industries.js: si falta uno, el typecheck lo avisa aquí.
export const PACKAGES: Record<Industry, IndustryPackage> = { ferreteria };

// Lo que el núcleo llama en sus pasos. Un enganche que el paquete no define no hace nada.
export function hooksFor(pkg: IndustryPackage) {
  return {
    beforeSale: async (tx: Tx, sale: SaleContext) => { await pkg.hooks.beforeSale?.(tx, sale); },
    onStockMovement: async (tx: Tx, movement: StockMovement) => { await pkg.hooks.onStockMovement?.(tx, movement); },
  };
}

export type CoreHooks = ReturnType<typeof hooksFor>;
