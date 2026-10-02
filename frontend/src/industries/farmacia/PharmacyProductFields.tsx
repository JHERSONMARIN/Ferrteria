// Datos de farmacia en el formulario de producto: registro sanitario, principio activo, laboratorio y receta.
import type { PharmacyProductData } from '@ferresys/contracts/industries';
import type { IndustryFieldsProps } from '../index.ts';

type TextField = 'sanitaryRegistration' | 'activeIngredient' | 'laboratory';

const TEXT_FIELDS: { field: TextField; label: string; maxLength: number; placeholder: string }[] = [
  { field: 'sanitaryRegistration', label: 'Registro sanitario', maxLength: 30, placeholder: 'EE-01234' },
  { field: 'activeIngredient', label: 'Principio activo', maxLength: 120, placeholder: 'Paracetamol' },
  { field: 'laboratory', label: 'Laboratorio', maxLength: 80, placeholder: 'Opcional' },
];

export default function PharmacyProductFields({ value, onChange }: IndustryFieldsProps) {
  const data = value as Partial<PharmacyProductData>;
  const set = (patch: Partial<PharmacyProductData>) => onChange({ ...data, ...patch });

  return (
    <fieldset className="border border-line rounded-lg p-3 flex flex-col gap-3">
      <legend className="text-xs font-bold text-muted px-1">Farmacia</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TEXT_FIELDS.map(({ field, label, maxLength, placeholder }) => (
          <div key={field}>
            <label htmlFor={`farmacia-${field}`} className="text-xs font-bold text-muted mb-1 block">{label}</label>
            <input
              id={`farmacia-${field}`}
              type="text"
              maxLength={maxLength}
              value={data[field] ?? ''}
              onChange={e => set({ [field]: e.target.value })}
              placeholder={placeholder}
              className="w-full border border-line p-2 rounded outline-none text-sm"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={Boolean(data.requiresPrescription || data.controlled)}
            disabled={Boolean(data.controlled)}
            onChange={e => set({ requiresPrescription: e.target.checked })}
            className="accent-orange-600 w-4 h-4 mt-0.5"
          />
          <span>
            <span className="font-semibold">Requiere receta</span>
            <span className="block text-xs text-muted">Al venderlo se pide el número de receta.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={Boolean(data.controlled)}
            onChange={e => set({ controlled: e.target.checked, ...(e.target.checked ? { requiresPrescription: true } : {}) })}
            className="accent-orange-600 w-4 h-4 mt-0.5"
          />
          <span>
            <span className="font-semibold">Controlado</span>
            <span className="block text-xs text-muted">Pide receta y cada venta queda en el libro de controlados.</span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}
