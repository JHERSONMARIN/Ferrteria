// Receta en el Punto de Venta: aparece cuando el carrito tiene productos que la piden. Con un controlado se
// piden también el médico y el paciente (van al libro de controlados).
import type { Product } from '@ferresys/contracts/catalog';
import type { PharmacySaleData } from '@ferresys/contracts/industries';
import type { SaleFieldsProps } from '../index.ts';

type Need = 'none' | 'prescription' | 'controlled';

function needOf(products: readonly Product[]): { need: Need; names: string[] } {
  const controlled = products.filter(p => p.industryData?.controlled === true);
  if (controlled.length > 0) return { need: 'controlled', names: controlled.map(p => p.name) };
  const prescription = products.filter(p => p.industryData?.requiresPrescription === true);
  return prescription.length > 0 ? { need: 'prescription', names: prescription.map(p => p.name) } : { need: 'none', names: [] };
}

export const needsPrescription = (products: readonly Product[]) => needOf(products).need !== 'none';

export function prescriptionProblem(value: Record<string, unknown>, products: readonly Product[]): string | null {
  const { need } = needOf(products);
  const data = value as PharmacySaleData;
  if (need === 'none') return null;
  if (!data.prescriptionNumber?.trim()) return 'Indique el número de receta.';
  if (need === 'controlled' && (!data.prescriber?.trim() || !data.patient?.trim())) return 'Indique el médico (con su CMP) y el paciente.';
  return null;
}

export default function PrescriptionFields({ value, onChange, products }: SaleFieldsProps) {
  const { need, names } = needOf(products);
  const data = value as PharmacySaleData;
  const set = (patch: Partial<PharmacySaleData>) => onChange({ ...data, ...patch });
  const input = 'w-full border border-line p-2 rounded outline-none text-sm bg-surface';

  return (
    <div className="flex flex-col gap-2 border border-warning/30 bg-warning-soft rounded-lg p-3">
      <p className="text-xs text-ink-soft">
        <i className="fa-solid fa-prescription text-warning mr-1.5"></i>
        {need === 'controlled' ? 'Controlado' : 'Con receta'}: {names.join(', ')}
      </p>
      <input
        aria-label="N° de receta"
        maxLength={30}
        value={data.prescriptionNumber ?? ''}
        onChange={e => set({ prescriptionNumber: e.target.value })}
        placeholder="N° de receta"
        className={input}
      />
      {need === 'controlled' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input aria-label="Médico" maxLength={120} value={data.prescriber ?? ''} onChange={e => set({ prescriber: e.target.value })}
            placeholder="Médico y CMP" className={input} />
          <input aria-label="Paciente" maxLength={120} value={data.patient ?? ''} onChange={e => set({ patient: e.target.value })}
            placeholder="Paciente" className={input} />
        </div>
      )}
    </div>
  );
}
