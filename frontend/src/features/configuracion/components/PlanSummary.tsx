import type { LicenseStatus } from '@ferresys/contracts/settings';
import { FEATURE_LABELS, FEATURE_ORDER } from '../../../shared/constants/features.ts';
import { MODULE_OPTIONS } from '../../../shared/constants/modules.ts';

// Resumen del plan: lo que la empresa tiene y lo que podría sumar. Es el único lugar donde se nombra
// lo no contratado; en el resto de las pantallas simplemente no aparece.
interface PlanSummaryProps {
  license: LicenseStatus | null;
  licensedModules: readonly string[] | null;
  licensedFeatures: readonly string[] | null;
}

export default function PlanSummary({ license, licensedModules, licensedFeatures }: PlanSummaryProps) {
  const incluidos = (licensedModules ?? MODULE_OPTIONS.map(m => m.value));
  const funcionesIncluidas = licensedFeatures ?? FEATURE_ORDER;
  const moduloLabel = (value: string) => MODULE_OPTIONS.find(m => m.value === value)?.label ?? value;
  const faltantes = [
    ...MODULE_OPTIONS.filter(m => !incluidos.includes(m.value)).map(m => m.label),
    ...FEATURE_ORDER.filter(f => !funcionesIncluidas.includes(f)).map(f => FEATURE_LABELS[f]),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-panel text-white text-xs font-bold px-2.5 py-1 rounded-lg">
          Plan {license?.plan ? license.plan.toUpperCase() : 'sin restricciones'}
        </span>
        {license?.expiresAt && (
          <span className={`text-xs ${license.expired ? 'text-danger font-bold' : 'text-muted'}`}>
            {license.expired ? `Venció el ${license.expiresAt}` : `Vigente hasta el ${license.expiresAt}`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-bold text-ink-soft mb-1">Incluye</p>
          <ul className="text-xs text-ink-soft flex flex-col gap-0.5">
            {incluidos.map(value => (
              <li key={value}>
                <i className="fa-solid fa-check text-success mr-1.5"></i>
                {moduloLabel(value)}
              </li>
            ))}
            {funcionesIncluidas.map(f => (
              <li key={f}><i className="fa-solid fa-check text-success mr-1.5"></i>{FEATURE_LABELS[f]}</li>
            ))}
          </ul>
        </div>

        {faltantes.length > 0 && (
          <div>
            <p className="text-xs font-bold text-ink-soft mb-1">Puede sumar a su plan</p>
            <ul className="text-xs text-muted flex flex-col gap-0.5">
              {faltantes.map(label => <li key={label}><i className="fa-solid fa-plus text-muted mr-1.5"></i>{label}</li>)}
            </ul>
            <p className="text-[11px] text-muted mt-1.5">Consulte con VALETEC para ampliar su plan.</p>
          </div>
        )}
      </div>
    </div>
  );
}
