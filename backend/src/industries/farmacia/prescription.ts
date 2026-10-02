// Receta de una venta de farmacia, sin base de datos: qué pide cada producto y si la venta lo trae.
import type { PharmacySaleData } from '@ferresys/contracts/industries';

// El esquema de la receta está en el contrato.
export { PharmacySaleBody as pharmacySale } from '@ferresys/contracts/industries';

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
