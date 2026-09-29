// Los paquetes de rubro disponibles y cómo los llama el núcleo. Sin dependencias del entorno: se prueba
// con paquetes falsos (registry.test.ts).
import { AppError } from '@ferresys/shared/errors';
import type { Industry } from '@ferresys/shared/industries';
import type { Tx } from '../db.ts';
import { ferreteria } from './ferreteria/index.ts';
import type { IndustryData, IndustryPackage, SaleContext, StockMovement } from './hooks.ts';

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

export class IndustryDataError extends AppError {
  static override area = 'RUBRO';
}

type Entity = keyof NonNullable<IndustryPackage['fields']>;

// Campos del rubro que llegan en una petición. undefined = no vienen (al editar, no se tocan). Sin esquema
// del paquete para esa entidad solo se acepta vacío: nada se guarda sin que el paquete lo haya validado.
export function parseIndustryData(pkg: IndustryPackage, entity: Entity, raw: unknown): IndustryData | undefined {
  if (raw === undefined) return undefined;
  const schema = pkg.fields?.[entity];
  if (!schema) {
    if (raw === null || (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0)) return {};
    throw new IndustryDataError('Estos datos no corresponden al rubro de la empresa.', 400, 'RUBRO_DATOS_INVALIDOS');
  }
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new IndustryDataError(parsed.error.issues[0]?.message ?? 'Datos del rubro no válidos.', 400, 'RUBRO_DATOS_INVALIDOS');
  }
  return parsed.data;
}
