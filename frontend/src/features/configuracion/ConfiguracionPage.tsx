// Configuración: plan, identidad, datos de la empresa, comprobantes, descuentos, sucursales, cajas y
// modo de trabajo. El formulario se guarda con su botón; sucursales, cajas y modo, al momento.
import { useState, useEffect, useMemo, type InputHTMLAttributes } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionUser } from '@ferresys/contracts/identity';
import type { BusinessSettings, LicenseStatus, SettingsResponse, SettingsRequest, SettingsSaved } from '@ferresys/contracts/settings';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { useSettings } from '../../api/queries.ts';
import { borderClass } from '../../shared/utils/validators.ts';
import { useVocabulary } from '../../industries/vocabulary.ts';
import CashRegistersSettings from './components/CashRegistersSettings.tsx';
import BranchesSettings from './components/BranchesSettings.tsx';
import Card, { Field } from './components/SettingsCard.tsx';
import PlanSummary from './components/PlanSummary.tsx';
import LogoField from './components/LogoField.tsx';
import DocumentSeriesList from './components/DocumentSeriesList.tsx';
import SaleFlowSettings from './components/SaleFlowSettings.tsx';
import { EDITABLE_FIELDS, toForm, validateForm, type Errors, type SettingsForm, type TextField } from './settingsForm.ts';

type Message = { type: 'success' | 'error'; text: string };

interface Props {
  currentUser: SessionUser;
  hasFeature?: (feature: string) => boolean;
  licensedFeatures?: string[] | null;
  license?: LicenseStatus | null;
}

export default function ConfiguracionPage({ currentUser, hasFeature = () => true, licensedFeatures = null, license = null }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useSettings();
  const vocabulary = useVocabulary();
  const savedSettings = settingsQuery.data?.settings ?? null;
  const licensedModules = settingsQuery.data?.licensedModules ?? null;
  const documentSeries = settingsQuery.data?.documentSeries ?? [];
  const loadError = settingsQuery.error ? settingsQuery.error.message || 'No se pudo cargar la configuración.' : '';
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saveMessage, setSaveMessage] = useState<Message | null>(null);
  const [saving, setSaving] = useState(false);

  // El formulario parte de lo guardado cuando llega.
  useEffect(() => {
    if (savedSettings && !form) setForm(toForm(savedSettings));
  }, [savedSettings, form]);

  // Lo guardado se comparte con el resto del sistema (nombre, logo y colores del menú, descuento del POS).
  const storeSettings = (saved: BusinessSettings) =>
    queryClient.setQueryData<SettingsResponse>(queryKeys.settings, old => (old ? { ...old, settings: saved } : old));

  const hasChanges = useMemo(() => {
    if (!form || !savedSettings) return false;
    const saved = toForm(savedSettings);
    return EDITABLE_FIELDS.some(field => JSON.stringify(form[field]) !== JSON.stringify(saved[field]));
  }, [form, savedSettings]);

  const setField = <K extends keyof SettingsForm>(field: K, value: SettingsForm[K]) => {
    setForm(prev => (prev ? { ...prev, [field]: value } : prev));
    setErrors(prev => ({ ...prev, [field]: '' }));
    setSaveMessage(null);
  };

  const isLicensed = (moduleId: string) => !licensedModules || licensedModules.includes(moduleId);

  const handleSave = async () => {
    if (!form) return;
    const validation = validateForm(form);
    setErrors(validation);
    if (Object.values(validation).some(Boolean)) {
      setSaveMessage({ type: 'error', text: 'Revise los campos marcados.' });
      return;
    }

    try {
      setSaving(true);
      const res = await api.put<SettingsSaved>('/settings', {
        ...form, taxRate: Number(form.taxRate), maxDiscountPercent: Number(form.maxDiscountPercent),
      } satisfies SettingsRequest);
      storeSettings(res.settings);
      setForm(toForm(res.settings));
      setSaveMessage({ type: 'success', text: 'Configuración guardada.' });
    } catch (err) {
      setSaveMessage({ type: 'error', text: (err as Error).message || 'No se pudo guardar la configuración.' });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <i className="fa-solid fa-triangle-exclamation text-3xl text-danger mb-3"></i>
        <p className="text-sm text-ink-soft mb-3">{loadError}</p>
        <button onClick={() => settingsQuery.refetch()} className="text-sm font-bold text-brand hover:underline">Reintentar</button>
      </div>
    );
  }

  if (!form || !savedSettings) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-sm">
        <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando configuración…
      </div>
    );
  }

  const input = (field: TextField, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      value={form[field]}
      onChange={e => setField(field, e.target.value)}
      className={`w-full border px-3 py-2 rounded-lg outline-none text-sm focus:border-brand ${borderClass(errors[field])}`}
      {...props}
    />
  );

  return (
    <div className="tab-content active h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-4 pb-28 flex flex-col gap-5">
        <Card icon="fa-id-card" title="Mi plan" description="Qué incluye el sistema contratado con VALETEC.">
          <PlanSummary license={license} licensedModules={licensedModules} licensedFeatures={licensedFeatures} />
        </Card>

        <Card icon="fa-palette" title="Identidad" description="El nombre y el logo con los que sus empleados ven el sistema.">
          <div className="flex flex-col gap-4">
            <LogoField logo={form.logo} onChange={value => setField('logo', value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nombre comercial" error={errors.tradeName} hint="Es el que se muestra en el sistema.">
                {input('tradeName', { maxLength: 100, placeholder: vocabulary.sampleTradeName })}
              </Field>
              <Field label="Razón social" error={errors.legalName} hint="Para los comprobantes.">
                {input('legalName', { maxLength: 150 })}
              </Field>
            </div>
          </div>
        </Card>

        <Card icon="fa-building" title="Datos de la empresa" description="RUC, dirección y contacto: se imprimen en los comprobantes.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="RUC" error={errors.taxId}>
              {input('taxId', {
                maxLength: 11,
                inputMode: 'numeric',
                placeholder: '11 dígitos',
                onChange: e => setField('taxId', e.target.value.replace(/\D/g, '')),
              })}
            </Field>
            <Field label="Teléfono" error={errors.phone}>
              {input('phone', { maxLength: 30, placeholder: 'Ej. 976 123 456' })}
            </Field>
            <Field label="Dirección" error={errors.address}>
              {input('address', { maxLength: 200, placeholder: 'Av. / Jr. …, distrito, ciudad' })}
            </Field>
            <Field label="Correo" error={errors.email}>
              {input('email', { maxLength: 120, type: 'email', placeholder: 'ventas@empresa.com' })}
            </Field>
          </div>
        </Card>

        <Card icon="fa-receipt" title="Comprobantes" description="Moneda, impuesto y texto al pie del ticket.">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Field label="Símbolo de moneda" error={errors.currencySymbol} hint="Se usa en el ticket impreso.">
              {input('currencySymbol', { maxLength: 5 })}
            </Field>
            <Field label="IGV (%)" error={errors.taxRate}>
              {input('taxRate', { type: 'number', min: 0, max: 100, step: '0.01' })}
            </Field>
            <div className="sm:col-span-2">
              <Field label="Pie del ticket" error={errors.ticketFooter} hint="Por defecto: “¡Gracias por su preferencia!”">
                <textarea
                  value={form.ticketFooter}
                  onChange={e => setField('ticketFooter', e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="Ej. No se aceptan devoluciones después de 7 días."
                  className="w-full border border-line px-3 py-2 rounded-lg outline-none text-sm focus:border-brand resize-none"
                />
              </Field>
            </div>
          </div>

          <div className="mt-5">
            <DocumentSeriesList documentSeries={documentSeries} />
          </div>
        </Card>

        {hasFeature('discounts') && <Card icon="fa-percent" title="Descuentos" description="Cuánto puede descontar el personal en el Punto de Venta.">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-start">
            <Field label="Descuento máximo (%)" error={errors.maxDiscountPercent} hint="0 = solo el administrador descuenta.">
              {input('maxDiscountPercent', { type: 'number', min: 0, max: 100, step: '0.01' })}
            </Field>
            <p className="sm:col-span-3 text-xs text-muted leading-relaxed sm:pt-6">
              Vendedores y cajeros pueden rebajar el total de una venta o pedido hasta este porcentaje.
              El administrador no tiene tope. Cada venta guarda el monto descontado y quién lo aplicó.
            </p>
          </div>
        </Card>}

        {hasFeature('branches') && (
          <Card icon="fa-store" title="Sucursales" description="Sucursales o almacenes con stock propio. Con una sola, el sistema no muestra nada de sucursales. Se guarda al momento.">
            {/* Las cajas muestran el nombre de su sucursal. */}
            <BranchesSettings onChanged={() => queryClient.invalidateQueries({ queryKey: queryKeys.cashRegisters })} />
          </Card>
        )}

        {hasFeature('shared_cash') && (
          <Card icon="fa-cash-register" title="Cajas" description="Gavetas físicas. Varios cajeros pueden compartir el turno de una caja. Se guarda al momento.">
            <CashRegistersSettings />
          </Card>
        )}

        <Card
          icon="fa-route"
          title="Modo de trabajo"
          description="Define cómo se reparte una venta entre las personas del negocio. Cada sucursal tiene el suyo. Se guarda al momento."
        >
          <SaleFlowSettings
            initialBranchId={currentUser.branchId ?? null}
            savedSettings={savedSettings}
            hasFeature={hasFeature}
            isLicensed={isLicensed}
            onSettingsSaved={storeSettings}
          />
        </Card>

      </div>

      {/* Barra fija para guardar: visible siempre para dar feedback del estado */}
      <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-line px-4 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <p className={`text-sm font-semibold ${
            saveMessage?.type === 'error' ? 'text-danger' : saveMessage?.type === 'success' ? 'text-success' : 'text-muted'
          }`}>
            {saveMessage?.text || (hasChanges ? 'Hay cambios sin guardar.' : 'Sin cambios.')}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setForm(toForm(savedSettings)); setErrors({}); setSaveMessage(null); }}
              disabled={!hasChanges || saving}
              className="px-4 py-2 rounded-lg text-sm font-bold text-ink-soft bg-surface-muted hover:bg-surface-muted disabled:opacity-40"
            >
              Descartar
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="px-5 py-2 rounded-lg text-sm font-bold text-brand-contrast bg-brand hover:bg-brand-strong shadow-sm disabled:opacity-40 flex items-center gap-2"
            >
              {saving ? <><i className="fa-solid fa-spinner fa-spin"></i> Guardando…</> : <><i className="fa-solid fa-check"></i> Guardar cambios</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
