import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';
import CashRegistersSettings from '../components/CashRegistersSettings.jsx';
import BranchesSettings from '../components/BranchesSettings.jsx';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import { MODULE_OPTIONS, ALWAYS_ENABLED_MODULES } from '../constants/modules.js';

const DOCUMENT_TYPE_LABELS = {
  NOTA_VENTA: 'Nota de venta',
  BOLETA: 'Boleta',
  FACTURA: 'Factura',
};

const EDITABLE_FIELDS = [
  'legalName', 'tradeName', 'taxId', 'address', 'phone', 'email',
  'currencySymbol', 'taxRate', 'ticketFooter', 'enabledModules', 'maxDiscountPercent',
];

const SALE_FLOW_OPTIONS = [
  {
    id: 'DIRECT',
    title: 'Directo',
    icon: 'fa-user',
    description: 'Una persona atiende, cobra y entrega. Ideal para ferreterías pequeñas.',
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

// Los módulos no contratados se muestran apagados y no se envían al guardar.
const toForm = (settings, licensedModules) => ({
  legalName: settings.legalName || '',
  tradeName: settings.tradeName || '',
  taxId: settings.taxId || '',
  address: settings.address || '',
  phone: settings.phone || '',
  email: settings.email || '',
  currencySymbol: settings.currencySymbol || 'S/',
  taxRate: String(settings.taxRate ?? 18),
  ticketFooter: settings.ticketFooter || '',
  enabledModules: (settings.enabledModules || []).filter(m => !licensedModules || licensedModules.includes(m)),
  maxDiscountPercent: String(settings.maxDiscountPercent ?? 0),
});

function validateForm(form) {
  const errors = {};
  if (form.legalName.trim().length < 2) errors.legalName = 'La razón social es obligatoria.';
  if (form.taxId.trim() && !/^\d{11}$/.test(form.taxId.trim())) errors.taxId = 'El RUC debe tener 11 dígitos.';
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Correo no válido.';
  const rate = Number(form.taxRate);
  if (form.taxRate === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) errors.taxRate = 'Debe estar entre 0 y 100.';
  if (!form.currencySymbol.trim()) errors.currencySymbol = 'Obligatorio.';
  const maxDiscount = Number(form.maxDiscountPercent);
  if (form.maxDiscountPercent === '' || !Number.isFinite(maxDiscount) || maxDiscount < 0 || maxDiscount > 100) {
    errors.maxDiscountPercent = 'Debe estar entre 0 y 100.';
  }
  return errors;
}

function Field({ label, error, hint, children }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-600 mb-1 block">{label}</label>
      {children}
      {error ? <FieldError msg={error} /> : hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function Card({ icon, title, description, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <i className={`fa-solid ${icon} text-orange-500`}></i> {title}
        </h3>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function SettingsPage({ currentUser, onSaved }) {
  // Al crear o renombrar sucursales se recarga la lista de cajas (muestra su sucursal).
  const [branchesVersion, setBranchesVersion] = useState(0);
  const [savedSettings, setSavedSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [documentSeries, setDocumentSeries] = useState([]);
  const [licensedModules, setLicensedModules] = useState(null);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [saveMessage, setSaveMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  // Modo de trabajo: es de cada sucursal y se guarda al momento, aparte del formulario.
  const [branches, setBranches] = useState([]);
  const [modeBranchId, setModeBranchId] = useState(currentUser?.branchId ?? null);
  const [modeMessage, setModeMessage] = useState(null);
  const [savingMode, setSavingMode] = useState(false);

  const loadBranches = () => api.get('/sucursales').then(setBranches).catch(() => setBranches([]));
  useEffect(() => { loadBranches(); }, [branchesVersion]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoadError('');
      const res = await api.get('/settings');
      setSavedSettings(res.settings);
      setLicensedModules(res.licensedModules || null);
      setForm(toForm(res.settings, res.licensedModules));
      setDocumentSeries(res.documentSeries || []);
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar la configuración.');
    }
  };

  const hasChanges = useMemo(() => {
    if (!form || !savedSettings) return false;
    const saved = toForm(savedSettings, licensedModules);
    return EDITABLE_FIELDS.some(field => JSON.stringify(form[field]) !== JSON.stringify(saved[field]));
  }, [form, savedSettings, licensedModules]);

  const setField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
    setSaveMessage(null);
  };

  const isLicensed = (moduleId) => !licensedModules || licensedModules.includes(moduleId);

  const toggleModule = (moduleId) => {
    if (ALWAYS_ENABLED_MODULES.includes(moduleId) || !isLicensed(moduleId)) return;
    setField(
      'enabledModules',
      form.enabledModules.includes(moduleId)
        ? form.enabledModules.filter(m => m !== moduleId)
        : [...form.enabledModules, moduleId]
    );
  };

  const modeBranch = branches.find(b => b.id === modeBranchId) || branches[0] || null;

  const toggleDeliveries = async () => {
    if (!modeBranch) return;
    const enable = !modeBranch.deliveriesEnabled;
    try {
      setSavingMode(true);
      setModeMessage(null);
      await api.put(`/sucursales/${modeBranch.id}`, { deliveriesEnabled: enable });
      await loadBranches();
      setModeMessage({ type: 'success', text: enable ? 'Envíos a domicilio activados.' : 'Envíos a domicilio desactivados: la opción ya no aparece al cobrar.' });
      window.dispatchEvent(new Event('refrescar-sesion'));
    } catch (err) {
      setModeMessage({ type: 'error', text: err.message });
    } finally {
      setSavingMode(false);
    }
  };

  // Al elegir un modo se activan (y guardan) los módulos que necesita, y se guarda el modo de la sucursal.
  const selectSaleFlow = async (option) => {
    if (!modeBranch || option.id === modeBranch.saleFlowMode || option.requires.some(m => !isLicensed(m))) return;
    const label = branches.length > 1 ? `${modeBranch.name}` : 'la empresa';
    if (!window.confirm(`¿Cambiar el modo de trabajo de ${label} a "${option.title}"?`)) return;
    try {
      setSavingMode(true);
      setModeMessage(null);
      const missing = option.requires.filter(m => !savedSettings.enabledModules.includes(m));
      if (missing.length > 0) {
        const res = await api.put('/settings', { ...savedSettings, enabledModules: [...savedSettings.enabledModules, ...missing] });
        setSavedSettings(res.settings);
        setForm(prev => ({ ...prev, enabledModules: [...new Set([...prev.enabledModules, ...missing])] }));
        if (onSaved) onSaved(res.settings);
      }
      await api.put(`/sucursales/${modeBranch.id}`, { saleFlowMode: option.id });
      await loadBranches();
      setModeMessage({ type: 'success', text: `Modo "${option.title}" guardado. Asigne en Personal los módulos a cada empleado.` });
      // Quien esté en esa sucursal ve sus pantallas nuevas sin volver a entrar.
      window.dispatchEvent(new Event('refrescar-sesion'));
    } catch (err) {
      setModeMessage({ type: 'error', text: err.message });
    } finally {
      setSavingMode(false);
    }
  };

  const handleSave = async () => {
    const validation = validateForm(form);
    setErrors(validation);
    if (Object.values(validation).some(Boolean)) {
      setSaveMessage({ type: 'error', text: 'Revise los campos marcados.' });
      return;
    }

    try {
      setSaving(true);
      const res = await api.put('/settings', { ...form, taxRate: Number(form.taxRate), maxDiscountPercent: Number(form.maxDiscountPercent) });
      setSavedSettings(res.settings);
      setForm(toForm(res.settings, licensedModules));
      setSaveMessage({ type: 'success', text: 'Configuración guardada.' });
      if (onSaved) onSaved(res.settings);
    } catch (err) {
      setSaveMessage({ type: 'error', text: err.message || 'No se pudo guardar la configuración.' });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <i className="fa-solid fa-triangle-exclamation text-3xl text-red-400 mb-3"></i>
        <p className="text-sm text-slate-600 mb-3">{loadError}</p>
        <button onClick={loadSettings} className="text-sm font-bold text-orange-600 hover:underline">Reintentar</button>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
        <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando configuración…
      </div>
    );
  }

  const input = (field, props = {}) => (
    <input
      value={form[field]}
      onChange={e => setField(field, e.target.value)}
      className={`w-full border px-3 py-2 rounded-lg outline-none text-sm focus:border-orange-500 ${borderClass(errors[field])}`}
      {...props}
    />
  );

  return (
    <div className="tab-content active h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-4 pb-28 flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Configuración de la empresa</h2>
          <p className="text-xs text-slate-500">
            Estos datos aparecen en los comprobantes y definen qué módulos usa el negocio.
          </p>
        </div>

        <Card icon="fa-building" title="Datos de la empresa" description="Se imprimen en la cabecera de tickets y comprobantes.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Razón social *" error={errors.legalName}>
              {input('legalName', { maxLength: 150, placeholder: 'Ej. Ferretería El Tornillo S.A.C.' })}
            </Field>
            <Field label="Nombre comercial" error={errors.tradeName} hint="Si se completa, es el nombre destacado en el ticket.">
              {input('tradeName', { maxLength: 100, placeholder: 'Ej. El Tornillo' })}
            </Field>
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
                  className="w-full border border-gray-300 px-3 py-2 rounded-lg outline-none text-sm focus:border-orange-500 resize-none"
                />
              </Field>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-bold text-slate-600 mb-2">Series de comprobantes</p>
            {documentSeries.length === 0 ? (
              <p className="text-xs text-slate-400">Las series se crean automáticamente al iniciar el servidor.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {documentSeries.map(s => (
                  <div key={s.id} className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">{DOCUMENT_TYPE_LABELS[s.documentType] || s.documentType}</span>
                      {!s.isActive && <span className="text-[10px] font-bold text-slate-400">INACTIVA</span>}
                    </div>
                    <p className="font-mono font-bold text-slate-800">{s.series}</p>
                    {new Set(documentSeries.map(x => x.branchId)).size > 1 && s.branch && (
                      <p className="text-[11px] text-slate-500"><i className="fa-solid fa-store mr-1"></i>{s.branch.name}</p>
                    )}
                    <p className="text-[11px] text-slate-500">
                      Último emitido: <span className="font-mono">{String(s.lastNumber).padStart(6, '0')}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card icon="fa-percent" title="Descuentos" description="Cuánto puede descontar el personal en el Punto de Venta.">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-start">
            <Field label="Descuento máximo (%)" error={errors.maxDiscountPercent} hint="0 = solo el administrador descuenta.">
              {input('maxDiscountPercent', { type: 'number', min: 0, max: 100, step: '0.01' })}
            </Field>
            <p className="sm:col-span-3 text-xs text-slate-500 leading-relaxed sm:pt-6">
              Vendedores y cajeros pueden rebajar el total de una venta o pedido hasta este porcentaje.
              El administrador no tiene tope. Cada venta guarda el monto descontado y quién lo aplicó.
            </p>
          </div>
        </Card>

        <Card icon="fa-store" title="Sucursales" description="Sucursales o almacenes con stock propio. Con una sola, el sistema no muestra nada de sucursales. Se guarda al momento.">
          <BranchesSettings onChanged={() => setBranchesVersion(v => v + 1)} />
        </Card>

        <Card icon="fa-cash-register" title="Cajas" description="Gavetas físicas. Varios cajeros pueden compartir el turno de una caja. Se guarda al momento.">
          <CashRegistersSettings key={branchesVersion} />
        </Card>

        <Card
          icon="fa-route"
          title="Modo de trabajo"
          description="Define cómo se reparte una venta entre las personas del negocio. Cada sucursal tiene el suyo. Se guarda al momento."
        >
          {branches.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs font-bold text-slate-600">Sucursal:</span>
              {branches.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => { setModeBranchId(b.id); setModeMessage(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${modeBranch?.id === b.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                >
                  {b.name}
                  <span className="ml-1.5 font-normal opacity-75">· {SALE_FLOW_OPTIONS.find(o => o.id === b.saleFlowMode)?.title}</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SALE_FLOW_OPTIONS.map(option => {
              const selected = modeBranch?.saleFlowMode === option.id;
              const missing = option.requires.filter(m => !isLicensed(m));
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectSaleFlow(option)}
                  disabled={missing.length > 0 || savingMode}
                  className={`text-left rounded-xl border p-4 transition-colors flex flex-col gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    selected ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <i className={`fa-solid ${option.icon} ${selected ? 'text-orange-600' : 'text-slate-400'}`}></i>
                    <span className="font-bold text-slate-800">{option.title}</span>
                    {selected && <i className="fa-solid fa-circle-check text-orange-600 ml-auto"></i>}
                  </div>
                  <p className="text-xs text-slate-500">{option.description}</p>
                  <ol className="text-[11px] text-slate-600 flex flex-col gap-0.5 mt-1">
                    {option.steps.map((step, i) => (
                      <li key={step}><span className="font-bold text-orange-600">{i + 1}.</span> {step}</li>
                    ))}
                  </ol>
                  {missing.length > 0 && (
                    <span className="text-[10px] text-slate-400">
                      <i className="fa-solid fa-lock mr-1"></i>Requiere un módulo no incluido en su plan
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {modeBranch && (
            <label className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${savedSettings.enabledModules.includes('deliveries') ? 'border-slate-200 cursor-pointer hover:bg-slate-50' : 'border-slate-200 opacity-60'}`}>
              <input
                type="checkbox"
                checked={modeBranch.deliveriesEnabled}
                onChange={toggleDeliveries}
                disabled={savingMode || !savedSettings.enabledModules.includes('deliveries')}
                className="mt-0.5 accent-orange-600"
              />
              <span>
                <span className="font-bold text-slate-800 text-sm">
                  <i className="fa-solid fa-truck-fast mr-1.5 text-slate-400"></i>
                  Envíos a domicilio{branches.length > 1 ? ` en ${modeBranch.name}` : ''}
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  {savedSettings.enabledModules.includes('deliveries')
                    ? 'Al cobrar se ofrece "Envío a domicilio" y el repartidor lo ve en Entregas. Funciona con cualquier modo de trabajo.'
                    : 'Active primero el módulo Entregas en "Módulos activos".'}
                </span>
              </span>
            </label>
          )}
          {modeMessage && (
            <p className={`mt-3 text-xs rounded-lg px-3 py-2 border ${modeMessage.type === 'error' ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
              {modeMessage.text}
            </p>
          )}
        </Card>

        <Card
          icon="fa-puzzle-piece"
          title="Módulos activos"
          description="Los módulos desactivados se ocultan para todos los usuarios, aunque los tengan asignados."
        >
          {licensedModules && licensedModules.length < MODULE_OPTIONS.length && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">
              <i className="fa-solid fa-lock mr-1.5 text-slate-400"></i>
              Los módulos bloqueados no están incluidos en su plan. Para habilitarlos, comuníquese con su proveedor.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {MODULE_OPTIONS.map(mod => {
              const alwaysOn = ALWAYS_ENABLED_MODULES.includes(mod.value);
              const notLicensed = !isLicensed(mod.value);
              const locked = alwaysOn || notLicensed;
              const enabled = alwaysOn || (!notLicensed && form.enabledModules.includes(mod.value));
              return (
                <button
                  key={mod.value}
                  type="button"
                  onClick={() => toggleModule(mod.value)}
                  disabled={locked}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    enabled
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  } ${locked ? 'cursor-not-allowed' : ''} ${notLicensed ? 'opacity-60' : ''}`}
                >
                  <i className={`fa-solid ${mod.icon} w-5 text-center ${enabled ? 'text-orange-600' : 'text-slate-400'}`}></i>
                  <span className={`flex-1 text-sm font-semibold ${enabled ? 'text-slate-800' : 'text-slate-500'}`}>
                    {mod.label}
                    {alwaysOn && <span className="block text-[10px] font-normal text-slate-400">Siempre activo</span>}
                    {notLicensed && (
                      <span className="block text-[10px] font-normal text-slate-400">
                        <i className="fa-solid fa-lock mr-1"></i>No incluido en su plan
                      </span>
                    )}
                  </span>
                  <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${enabled ? 'bg-orange-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`}></span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Barra fija para guardar: visible siempre para dar feedback del estado */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <p className={`text-sm font-semibold ${
            saveMessage?.type === 'error' ? 'text-red-600' : saveMessage?.type === 'success' ? 'text-emerald-600' : 'text-slate-500'
          }`}>
            {saveMessage?.text || (hasChanges ? 'Hay cambios sin guardar.' : 'Sin cambios.')}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setForm(toForm(savedSettings, licensedModules)); setErrors({}); setSaveMessage(null); }}
              disabled={!hasChanges || saving}
              className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
            >
              Descartar
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-sm disabled:opacity-40 flex items-center gap-2"
            >
              {saving ? <><i className="fa-solid fa-spinner fa-spin"></i> Guardando…</> : <><i className="fa-solid fa-check"></i> Guardar cambios</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
