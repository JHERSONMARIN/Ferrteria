// Lote y vencimiento de lo que entra al stock (compra o ingreso manual). Los dos o ninguno: sin ellos entra
// "sin lote".
import type { IndustryFieldsProps } from '../index.ts';

const lotOf = (value: Record<string, unknown>) => ({
  lotNumber: typeof value.lotNumber === 'string' ? value.lotNumber : '',
  expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : '',
});

export function lotProblem(value: Record<string, unknown>): string | null {
  const { lotNumber, expiresAt } = lotOf(value);
  return Boolean(lotNumber.trim()) !== Boolean(expiresAt) ? 'Indique el lote y su vencimiento, o ninguno de los dos.' : null;
}

export function describeLot(value: Record<string, unknown>): string {
  const { lotNumber, expiresAt } = lotOf(value);
  return lotNumber.trim() ? `${lotNumber.trim()} · vence ${expiresAt.split('-').reverse().join('/')}` : 'Sin lote';
}

export default function LotFields({ value, onChange }: IndustryFieldsProps) {
  const { lotNumber, expiresAt } = lotOf(value);
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <label htmlFor="farmacia-lote" className="text-xs font-bold text-muted mb-1 block">Lote</label>
        <input
          id="farmacia-lote"
          type="text"
          maxLength={30}
          value={lotNumber}
          onChange={e => onChange({ ...value, lotNumber: e.target.value })}
          placeholder="Sin lote"
          className="w-full border border-line p-2 rounded outline-none text-sm"
        />
      </div>
      <div className="flex-1">
        <label htmlFor="farmacia-vence" className="text-xs font-bold text-muted mb-1 block">Vencimiento</label>
        <input
          id="farmacia-vence"
          type="date"
          value={expiresAt}
          onChange={e => onChange({ ...value, expiresAt: e.target.value })}
          className="w-full border border-line p-2 rounded outline-none text-sm"
        />
      </div>
    </div>
  );
}
