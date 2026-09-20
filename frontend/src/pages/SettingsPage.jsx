import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api.js';
import CashRegistersSettings from '../components/CashRegistersSettings.jsx';
import BranchesSettings from '../components/BranchesSettings.jsx';
import { DISPATCH_ROLE_OPTIONS, effectiveDispatchRole } from '../constants/dispatch.js';
import { FEATURE_LABELS, FEATURE_ORDER } from '../constants/features.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import { MODULE_OPTIONS, ALWAYS_ENABLED_MODULES } from '../constants/modules.js';
import { applyTheme } from '../utils/theme.js';
import { useConfirm } from '../components/ui/index.js';

const DOCUMENT_TYPE_LABELS = {
  NOTA_VENTA: 'Nota de venta',
  BOLETA: 'Boleta',
  FACTURA: 'Factura',
};

const EDITABLE_FIELDS = [
  'legalName', 'tradeName', 'taxId', 'address', 'phone', 'email',
  'currencySymbol', 'taxRate', 'ticketFooter', 'logo', 'primaryColor', 'navColor', 'enabledModules', 'maxDiscountPercent',
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
  logo: settings.logo || null,
  primaryColor: settings.primaryColor || '',
  navColor: settings.navColor || '',
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
      <label className="text-xs font-bold text-ink-soft mb-1 block">{label}</label>
      {children}
      {error ? <FieldError msg={error} /> : hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

// Resumen del plan: lo que la empresa tiene y lo que podría sumar. Es el único lugar donde se nombra
// lo no contratado; en el resto de las pantallas simplemente no aparece.
function MiPlan({ license, licensedModules, licensedFeatures, enabledModules }) {
  const incluidos = (licensedModules ?? MODULE_OPTIONS.map(m => m.value));
  const funcionesIncluidas = licensedFeatures ?? FEATURE_ORDER;
  const moduloLabel = (value) => MODULE_OPTIONS.find(m => m.value === value)?.label ?? value;
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
                {!enabledModules.includes(value) && !ALWAYS_ENABLED_MODULES.includes(value) && (
                  <span className="text-muted"> (desactivado por usted)</span>
                )}
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

function Card({ icon, title, description, children }) {
  return (
    <section className="bg-surface rounded-2xl border border-line/80">
      <div className="px-6 pt-5 pb-4 flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-surface-muted text-muted flex items-center justify-center shrink-0">
          <i className={`fa-solid ${icon} text-sm`}></i>
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{title}</h3>
          {description && <p className="text-xs text-muted mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </section>
  );
}

// Logo de la empresa: se guarda con el resto de la configuración y se ve en el inicio y en el menú.
function LogoField({ logo, onChange }) {
  const [mensaje, setMensaje] = useState('');

  const elegir = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp|svg\+xml)$/.test(file.type)) return setMensaje('Use una imagen PNG, JPG, WEBP o SVG.');
    if (file.size > 280 * 1024) return setMensaje('La imagen no puede superar 280 KB.');
    const reader = new FileReader();
    reader.onload = () => { setMensaje(''); onChange(reader.result); };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="w-24 h-24 rounded-xl border border-dashed border-line bg-surface-muted flex items-center justify-center overflow-hidden shrink-0">
        {logo
          ? <img src={logo} alt="Logo de la empresa" className="max-w-full max-h-full object-contain" />
          : <i className="fa-solid fa-image text-2xl text-muted"></i>}
      </div>
      <div className="flex-1 min-w-[12rem]">
        <div className="flex flex-wrap gap-2">
          <label className="px-3 py-2 rounded-lg border border-line text-sm font-semibold text-ink-soft bg-surface hover:bg-surface-muted cursor-pointer">
            <i className="fa-solid fa-upload mr-1.5 text-muted"></i>
            {logo ? 'Cambiar logo' : 'Subir logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
              onChange={e => elegir(e.target.files?.[0])} />
          </label>
          {logo && (
            <button type="button" onClick={() => { setMensaje(''); onChange(null); }}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-muted hover:text-danger">
              Quitar
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted mt-1.5">
          PNG, JPG, WEBP o SVG, hasta 280 KB. Se muestra en el inicio de sesión y en el menú lateral.
        </p>
        {mensaje && <p className="text-[11px] text-danger mt-1">{mensaje}</p>}
      </div>
    </div>
  );
}

// Estilo de la empresa: color principal (botones y lo resaltado) y color del menú lateral.
// Los estilos vienen del servidor (backend/src/config/themes.json), los mismos que usa VALETEC.
// Se ve al instante mientras se elige; al salir sin guardar vuelve el estilo guardado.
function EstiloField({ themes, primaryColor, navColor, onChange }) {
  const iguales = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();
  const elegido = Object.entries(themes || {}).find(([, e]) =>
    iguales(e.primaryColor, primaryColor) && iguales(e.navColor, navColor));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(themes || {}).map(([id, estilo]) => {
          const activo = elegido?.[0] === id;
          return (
            <button
              key={id}
              type="button"
              title={estilo.descripcion}
              onClick={() => onChange(estilo.primaryColor, estilo.navColor)}
              className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors
                ${activo ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-muted'}`}
            >
              {/* Muestra en chico cómo queda: el menú y el color principal */}
              <span className="w-10 h-8 rounded-lg overflow-hidden flex shrink-0 border border-line">
                <span className="w-1/3 h-full" style={{ backgroundColor: estilo.navColor }} />
                <span className="flex-1 h-full bg-surface flex items-center justify-center">
                  <span className="w-3.5 h-3.5 rounded" style={{ backgroundColor: estilo.primaryColor }} />
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-ink truncate">{estilo.nombre}</span>
                {activo && <span className="block text-[10px] text-brand-text font-semibold">En uso</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft cursor-pointer">
          <input
            type="color"
            value={primaryColor || '#ea580c'}
            onChange={e => onChange(e.target.value.toLowerCase(), navColor)}
            className="w-8 h-8 rounded-lg border border-line bg-surface p-0.5 cursor-pointer"
          />
          Color principal
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft cursor-pointer">
          <input
            type="color"
            value={navColor || '#0f172a'}
            onChange={e => onChange(primaryColor, e.target.value.toLowerCase())}
            className="w-8 h-8 rounded-lg border border-line bg-surface p-0.5 cursor-pointer"
          />
          Color del menú
        </label>
        {(primaryColor || navColor) && (
          <button type="button" onClick={() => onChange('', '')}
            className="px-2 py-1 text-xs font-semibold text-muted hover:text-danger">
            Volver al estilo de fábrica
          </button>
        )}
      </div>

      <p className="text-[11px] text-muted">
        El color principal se usa en los botones y en lo que el sistema resalta; el resto queda en gris a
        propósito, para que se vea de un vistazo qué es lo importante de cada pantalla.
      </p>
    </div>
  );
}

export default function SettingsPage({ currentUser, onSaved, hasFeature = () => true, licensedFeatures = null, license = null }) {
  const confirmar = useConfirm();
  // Al crear o renombrar sucursales se recarga la lista de cajas (muestra su sucursal).
  const [branchesVersion, setBranchesVersion] = useState(0);
  const [savedSettings, setSavedSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [documentSeries, setDocumentSeries] = useState([]);
  const [themes, setThemes] = useState({});
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
      setThemes(res.themes || {});
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar la configuración.');
    }
  };

  // Al salir de Configuración sin guardar, vuelve el estilo que está guardado.
  const estiloGuardado = useRef({});
  estiloGuardado.current = { primaryColor: savedSettings?.primaryColor ?? null, navColor: savedSettings?.navColor ?? null };
  useEffect(() => () => applyTheme(estiloGuardado.current.primaryColor, estiloGuardado.current.navColor), []);

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
  // Envíos a domicilio: hacen falta la función del plan y el módulo Entregas contratado.
  const deliveriesAvailable = hasFeature('deliveries') && isLicensed('deliveries');

  const chooseDispatchRole = async (roleId) => {
    if (!modeBranch || roleId === effectiveDispatchRole(modeBranch)) return;
    try {
      setSavingMode(true);
      setModeMessage(null);
      await api.put(`/sucursales/${modeBranch.id}`, { dispatchRole: roleId });
      await loadBranches();
      setModeMessage({ type: 'success', text: `Ahora despacha: ${DISPATCH_ROLE_OPTIONS.find(o => o.id === roleId).title.toLowerCase()}.` });
      window.dispatchEvent(new Event('refrescar-sesion'));
    } catch (err) {
      setModeMessage({ type: 'error', text: err.message });
    } finally {
      setSavingMode(false);
    }
  };

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
    const seguro = await confirmar({
      title: 'Cambiar el modo de trabajo',
      description: `${label === 'la empresa' ? 'La empresa' : label} pasará a trabajar en modo "${option.title}".`,
      confirmText: 'Cambiar',
    });
    if (!seguro) return;
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
        <i className="fa-solid fa-triangle-exclamation text-3xl text-danger mb-3"></i>
        <p className="text-sm text-ink-soft mb-3">{loadError}</p>
        <button onClick={loadSettings} className="text-sm font-bold text-brand hover:underline">Reintentar</button>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-sm">
        <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando configuración…
      </div>
    );
  }

  const input = (field, props = {}) => (
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
          <MiPlan
            license={license}
            licensedModules={licensedModules}
            licensedFeatures={licensedFeatures}
            enabledModules={form.enabledModules}
          />
        </Card>

        <Card icon="fa-palette" title="Identidad" description="El nombre y el logo con los que sus empleados ven el sistema.">
          <div className="flex flex-col gap-4">
            <LogoField logo={form.logo} onChange={value => setField('logo', value)} />
            <Field label="Estilo">
              <EstiloField
                themes={themes}
                primaryColor={form.primaryColor}
                navColor={form.navColor}
                onChange={(principal, menu) => {
                  setForm(prev => ({ ...prev, primaryColor: principal, navColor: menu }));
                  setSaveMessage(null);
                  applyTheme(principal, menu);
                }}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nombre comercial" error={errors.tradeName} hint="Es el que se muestra en el sistema.">
                {input('tradeName', { maxLength: 100, placeholder: 'Ferretería Los Andes' })}
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
            <p className="text-xs font-bold text-ink-soft mb-2">Series de comprobantes</p>
            {documentSeries.length === 0 ? (
              <p className="text-xs text-muted">Las series se crean automáticamente al iniciar el servidor.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {documentSeries.map(s => (
                  <div key={s.id} className="border border-line rounded-lg px-3 py-2 bg-surface-muted">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted">{DOCUMENT_TYPE_LABELS[s.documentType] || s.documentType}</span>
                      {!s.isActive && <span className="text-[10px] font-bold text-muted">INACTIVA</span>}
                    </div>
                    <p className="font-mono font-bold text-ink">{s.series}</p>
                    {new Set(documentSeries.map(x => x.branchId)).size > 1 && s.branch && (
                      <p className="text-[11px] text-muted"><i className="fa-solid fa-store mr-1"></i>{s.branch.name}</p>
                    )}
                    <p className="text-[11px] text-muted">
                      Último emitido: <span className="font-mono">{String(s.lastNumber).padStart(6, '0')}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
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
            <BranchesSettings onChanged={() => setBranchesVersion(v => v + 1)} />
          </Card>
        )}

        {hasFeature('shared_cash') && (
          <Card icon="fa-cash-register" title="Cajas" description="Gavetas físicas. Varios cajeros pueden compartir el turno de una caja. Se guarda al momento.">
            <CashRegistersSettings key={branchesVersion} />
          </Card>
        )}

        <Card
          icon="fa-route"
          title="Modo de trabajo"
          description="Define cómo se reparte una venta entre las personas del negocio. Cada sucursal tiene el suyo. Se guarda al momento."
        >
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
                    : 'Active primero el módulo Entregas en "Módulos activos".'}
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
        </Card>

        <Card
          icon="fa-puzzle-piece"
          title="Módulos activos"
          description="Los módulos desactivados se ocultan para todos los usuarios, aunque los tengan asignados."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {MODULE_OPTIONS.filter(mod => isLicensed(mod.value)).map(mod => {
              const alwaysOn = ALWAYS_ENABLED_MODULES.includes(mod.value);
              const locked = alwaysOn;
              const enabled = alwaysOn || form.enabledModules.includes(mod.value);
              return (
                <button
                  key={mod.value}
                  type="button"
                  onClick={() => toggleModule(mod.value)}
                  disabled={locked}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    enabled
                      ? 'border-brand/40 bg-brand-soft'
                      : 'border-line bg-surface hover:bg-surface-muted'
                  } ${locked ? 'cursor-not-allowed' : ''}`}
                >
                  <i className={`fa-solid ${mod.icon} w-5 text-center ${enabled ? 'text-brand' : 'text-muted'}`}></i>
                  <span className={`flex-1 text-sm font-semibold ${enabled ? 'text-ink' : 'text-muted'}`}>
                    {mod.label}
                    {alwaysOn && <span className="block text-[10px] font-normal text-muted">Siempre activo</span>}
                  </span>
                  <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${enabled ? 'bg-brand' : 'bg-line'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-surface shadow transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`}></span>
                  </span>
                </button>
              );
            })}
          </div>
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
              onClick={() => { setForm(toForm(savedSettings, licensedModules)); setErrors({}); setSaveMessage(null); }}
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
