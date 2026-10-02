// Receta de una venta de farmacia, sin base de datos: qué pide cada producto y si la venta lo trae.
import { z } from '@ferresys/contracts/zod';
import type { PharmacySaleData } from '@ferresys/contracts/industries';

const optionalText = (label: string, max: number) =>
  z.string({ message: `${label}: debe ser un texto.` }).trim().max(max, `${label}: hasta ${max} caracteres.`)
    .optional().transform(value => value || undefined);

export const pharmacySale = z.object({
  prescriptionNumber: optionalText('N° de receta', 30),
  prescriber: optionalText('Médico', 120),
  patient: optionalText('Paciente', 120),
}).transform((data): PharmacySaleData => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));

/** Lo que pide la venta: nada, el número de receta, o (con un controlado) también médico y paciente. */
export type PrescriptionNeed = 'none' | 'prescription' | 'controlled';

// Lo que dice un producto; un producto sin datos de farmacia (importado, por ejemplo) no pide receta.
export function needOf(productData: unknown): PrescriptionNeed {
  const data = (productData ?? {}) as Record<string, unknown>;
  if (data.controlled === true) return 'controlled';
  return data.requiresPrescription === true ? 'prescription' : 'none';
}

const RANK: Record<PrescriptionNeed, number> = { none: 0, prescription: 1, controlled: 2 };
export const strongestNeed = (needs: readonly PrescriptionNeed[]): PrescriptionNeed =>
  needs.reduce<PrescriptionNeed>((max, need) => (RANK[need] > RANK[max] ? need : max), 'none');

// null = la venta trae lo que hace falta; si no, el mensaje (con los productos que lo piden).
export function prescriptionProblem(need: PrescriptionNeed, sale: PharmacySaleData | undefined, products: readonly string[]): string | null {
  if (need === 'none') return null;
  const which = products.join(', ');
  if (!sale?.prescriptionNumber) return `${which} se vende(n) solo con receta: indique el número de receta.`;
  if (need === 'controlled' && (!sale.prescriber || !sale.patient)) {
    return `${which} es controlado: indique también el médico (con su CMP) y el paciente.`;
  }
  return null;
}
