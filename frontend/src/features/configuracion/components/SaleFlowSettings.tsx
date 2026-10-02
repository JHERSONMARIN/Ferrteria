// Modo de trabajo de cada sucursal (directo, vendedor y caja, por etapas), sus envíos a domicilio y quién
// despacha. Se guarda al momento, aparte del formulario de Configuración.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Branch, UpdateBranchRequest } from '@ferresys/contracts/branches';
import type { DispatchRole, SaleFlowMode } from '@ferresys/contracts/identity';
import type { BusinessSettings, SettingsRequest, SettingsSaved } from '@ferresys/contracts/settings';
import { api } from '../../../api/client.ts';
import { queryKeys } from '../../../api/queryClient.ts';
import { useBranches } from '../../../api/queries.ts';
import { DISPATCH_ROLE_OPTIONS, effectiveDispatchRole } from '../../../shared/constants/dispatch.ts';
import { useConfirm } from '../../../shared/ui/index.ts';

type Message = { type: 'success' | 'error'; text: string };

interface SaleFlowOption {
  id: SaleFlowMode;
  title: string;
  icon: string;
  description: string;
  steps: string[];
  requires: string[];
}

const SALE_FLOW_OPTIONS: SaleFlowOption[] = [
  {
    id: 'DIRECT',
    title: 'Directo',
    icon: 'fa-user',
    description: 'Una persona atiende, cobra y entrega. Ideal para locales pequeños.',
    steps: ['Venta y cobro en el Punto de Venta'],
    requires: [],
  },
  {
    id: 'SEPARATE_CASHIER',
    title: 'Vendedor y caja',
    icon: 'fa-users',
    description: 'El vendedor arma el pedido; el cliente paga en caja y ahí recibe sus productos.',
    steps: ['Vendedor: pedido', 'Caja: cobro y entrega'],
    requires: ['caja'],
  },
  {
    id: 'STAGED',
    title: 'Por etapas',
    icon: 'fa-people-arrows',
    description: 'Vendedor, caja y almacén separados: el cliente recoge en despacho después de pagar.',
    steps: ['Vendedor: pedido', 'Caja: cobro', 'Almacén: despacho'],
    requires: ['caja', 'despacho'],
  },
];

interface Props {
  /** Sucursal que se muestra primero: la del usuario. */
  initialBranchId: number | null;
  savedSettings: BusinessSettings;
  hasFeature: (feature: string) => boolean;
  isLicensed: (moduleId: string) => boolean;
  /** La configuración guardada al activar los módulos que pide un modo. */
  onSettingsSaved: (settings: BusinessSettings) => void;
}

export default function SaleFlowSettings({ initialBranchId, savedSettings, hasFeature, isLicensed, onSettingsSaved }: Props) {
  const confirmar = useConfirm();
  const queryClient = useQueryClient();
  const branches = useBranches().data ?? [];
  const [modeBranchId, setModeBranchId] = useState<number | null>(initialBranchId);
  const [modeMessage, setModeMessage] = useState<Message | null>(null);
  const [savingMode, setSavingMode] = useState(false);

  // El modo, los envíos y quién despacha cambian las pantallas de quien trabaja en esa sucursal:
  // se refrescan las sucursales y la sesión (sin volver a entrar).
  const refreshBranches = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.branches }),
    queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  ]);

  const modeBranch: Branch | null = branches.find(b => b.id === modeBranchId) ?? branches[0] ?? null;
  // Envíos a domicilio: hacen falta la función del plan y el módulo Entregas contratado.
  const deliveriesAvailable = hasFeature('deliveries') && isLicensed('deliveries');

  // Guarda un cambio de la sucursal elegida y muestra el resultado junto al modo de trabajo.
  const saveBranchMode = async (change: () => Promise<unknown>, successText: string) => {
    try {
      setSavingMode(true);
      setModeMessage(null);
      await change();
      await refreshBranches();
      setModeMessage({ type: 'success', text: successText });
    } catch (err) {
      setModeMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingMode(false);
    }
  };

  const chooseDispatchRole = async (roleId: DispatchRole) => {
    if (!modeBranch || roleId === effectiveDispatchRole(modeBranch)) return;
    const title = DISPATCH_ROLE_OPTIONS.find(o => o.id === roleId)?.title ?? roleId;
    await saveBranchMode(() => api.put(`/sucursales/${modeBranch.id}`, { dispatchRole: roleId } satisfies UpdateBranchRequest), `Ahora despacha: ${title.toLowerCase()}.`);
  };

  const toggleDeliveries = async () => {
    if (!modeBranch) return;
    const enable = !modeBranch.deliveriesEnabled;
    await saveBranchMode(
      () => api.put(`/sucursales/${modeBranch.id}`, { deliveriesEnabled: enable } satisfies UpdateBranchRequest),
      enable ? 'Envíos a domicilio activados.' : 'Envíos a domicilio desactivados: la opción ya no aparece al cobrar.',
    );
  };

  // Al elegir un modo se activan (y guardan) los módulos que necesita, y se guarda el modo de la sucursal.
  const selectSaleFlow = async (option: SaleFlowOption) => {
    if (!modeBranch || !savedSettings || option.id === modeBranch.saleFlowMode || option.requires.some(m => !isLicensed(m))) return;
    const label = branches.length > 1 ? `${modeBranch.name}` : 'la empresa';
    const seguro = await confirmar({
      title: 'Cambiar el modo de trabajo',
      description: `${label === 'la empresa' ? 'La empresa' : label} pasará a trabajar en modo "${option.title}".`,
      confirmText: 'Cambiar',
    });
    if (!seguro) return;
    await saveBranchMode(async () => {
      const missing = option.requires.filter(m => !savedSettings.enabledModules.includes(m));
      if (missing.length > 0) {
        const res = await api.put<SettingsSaved>('/settings', { ...savedSettings, enabledModules: [...savedSettings.enabledModules, ...missing] } satisfies SettingsRequest);
        onSettingsSaved(res.settings);
      }
      await api.put(`/sucursales/${modeBranch.id}`, { saleFlowMode: option.id } satisfies UpdateBranchRequest);
    }, `Modo "${option.title}" guardado. Asigne en Personal los módulos a cada empleado.`);
  };

  return (
    <>
      {branches.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-bold text-ink-soft">Sucursal:</span>
          {branches.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => { setModeBranchId(b.id); setModeMessage(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${modeBranch?.id === b.id ? 'bg-panel text-white border-white/10' : 'bg-surface text-ink-soft border-line hover:bg-surface-muted'}`}
            >
              {b.name}
              <span className="ml-1.5 font-normal opacity-75">· {SALE_FLOW_OPTIONS.find(o => o.id === b.saleFlowMode)?.title}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SALE_FLOW_OPTIONS.filter(option => option.id === 'DIRECT' || hasFeature('split_flow')).map(option => {
          const selected = modeBranch?.saleFlowMode === option.id;
          const missing = option.requires.filter(m => !isLicensed(m));
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => selectSaleFlow(option)}
              disabled={missing.length > 0 || savingMode || (option.id !== 'DIRECT' && !hasFeature('split_flow'))}
              className={`text-left rounded-xl border p-4 transition-colors flex flex-col gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                selected ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-line hover:bg-surface-muted'
              }`}
            >
              <div className="flex items-center gap-2">
                <i className={`fa-solid ${option.icon} ${selected ? 'text-brand' : 'text-muted'}`}></i>
                <span className="font-bold text-ink">{option.title}</span>
                {selected && <i className="fa-solid fa-circle-check text-brand ml-auto"></i>}
              </div>
              <p className="text-xs text-muted">{option.description}</p>
              <ol className="text-[11px] text-ink-soft flex flex-col gap-0.5 mt-1">
                {option.steps.map((step, i) => (
                  <li key={step}><span className="font-bold text-brand">{i + 1}.</span> {step}</li>
                ))}
              </ol>
              {missing.length > 0 ? (
                <span className="text-[10px] text-muted">
                  <i className="fa-solid fa-lock mr-1"></i>Requiere un módulo no incluido en su plan
                </span>
              ) : option.id !== 'DIRECT' && !hasFeature('split_flow') && (
                <span className="text-[10px] text-muted">
                  <i className="fa-solid fa-lock mr-1"></i>No incluido en su plan
                </span>
              )}
            </button>
          );
        })}
      </div>
      {modeBranch && deliveriesAvailable && (
        <label className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${savedSettings.enabledModules.includes('deliveries') ? 'border-line cursor-pointer hover:bg-surface-muted' : 'border-line opacity-60'}`}>
          <input
            type="checkbox"
            checked={modeBranch.deliveriesEnabled}
            onChange={toggleDeliveries}
            disabled={savingMode || !savedSettings.enabledModules.includes('deliveries')}
            className="mt-0.5 accent-orange-600"
          />
          <span>
            <span className="font-bold text-ink text-sm">
              <i className="fa-solid fa-truck-fast mr-1.5 text-muted"></i>
              Envíos a domicilio{branches.length > 1 ? ` en ${modeBranch.name}` : ''}
            </span>
            <span className="block text-xs text-muted mt-0.5">
              {savedSettings.enabledModules.includes('deliveries')
                ? 'Al cobrar se ofrece "Envío a domicilio" y el repartidor lo ve en Entregas. Funciona con cualquier modo de trabajo.'
                : 'Su plan no incluye Entregas: consúltelo con VALETEC.'}
            </span>
          </span>
        </label>
      )}
      {modeBranch && (modeBranch.saleFlowMode === 'STAGED' || (deliveriesAvailable && modeBranch.deliveriesEnabled)) && (
        <div className="mt-4 rounded-xl border border-line p-4">
          <p className="font-bold text-ink text-sm">
            <i className="fa-solid fa-dolly mr-1.5 text-muted"></i>
            ¿Quién despacha{branches.length > 1 ? ` en ${modeBranch.name}` : ''}?
          </p>
          <p className="text-xs text-muted mt-0.5 mb-3">
            Atiende "Por despachar": {modeBranch.saleFlowMode === 'STAGED' ? 'todo lo cobrado' : 'las ventas con envío a domicilio'}.
            Ve los productos a preparar y marca cuándo los entrega{modeBranch.saleFlowMode === 'STAGED' ? '' : ' al repartidor'}.
            El administrador también puede despachar.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {DISPATCH_ROLE_OPTIONS.map(option => {
              const selected = effectiveDispatchRole(modeBranch) === option.id;
              const locked = option.id === 'WAREHOUSE' && !savedSettings.enabledModules.includes('despacho');
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => chooseDispatchRole(option.id)}
                  disabled={savingMode || locked}
                  className={`text-left rounded-lg border px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed ${selected ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-line hover:bg-surface-muted'}`}
                >
                  <span className="font-bold text-sm text-ink flex items-center gap-1.5">
                    {option.title}
                    {selected && <i className="fa-solid fa-circle-check text-brand ml-auto"></i>}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {locked ? 'Active primero el módulo Despacho.' : option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {modeMessage && (
        <p className={`mt-3 text-xs rounded-lg px-3 py-2 border ${modeMessage.type === 'error' ? 'text-danger bg-danger-soft border-danger/30' : 'text-success bg-success-soft border-success/30'}`}>
          {modeMessage.text}
        </p>
      )}
    </>
  );
}
