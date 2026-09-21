import { AVAILABLE_MODULES, ALWAYS_ENABLED_MODULES } from '../config/modules.js';
import { AVAILABLE_FEATURES } from '../config/features.js';

// Módulos contratados por la empresa. Los define VALETEC en el .env de cada instancia
// (LICENSED_MODULES=pos,caja,...); la empresa no puede cambiarlos. Sin la variable, se
// habilitan todos (entorno de desarrollo, demo e instalaciones anteriores).
export function parseLicensedModules(rawValue) {
  const raw = rawValue?.trim();
  if (!raw) return [...AVAILABLE_MODULES];

  const requested = raw.split(',').map(m => m.trim()).filter(Boolean);
  const unknown = requested.filter(m => !AVAILABLE_MODULES.includes(m));
  if (unknown.length > 0) {
    console.warn(`[license] Se ignoran módulos desconocidos en LICENSED_MODULES: ${unknown.join(', ')}`);
  }
  const licensed = new Set([...requested, ...ALWAYS_ENABLED_MODULES]);
  return AVAILABLE_MODULES.filter(m => licensed.has(m));
}

// Se lee una vez al arrancar: cambiar la licencia requiere reiniciar la instancia.
export const LICENSED_MODULES = parseLicensedModules(process.env.LICENSED_MODULES);

export const isModuleLicensed = (moduleId) => LICENSED_MODULES.includes(moduleId);

// Módulos que la empresa puede usar de verdad: activos en su configuración y contratados.
export function getActiveModules(settings) {
  return settings.enabledModules.filter(isModuleLicensed);
}

// ---------- Funciones y límites del plan ----------
// El plan de la empresa llega en su .env (lo escribe deploy/set-plan.sh o la consola de VALETEC).
// Sin LICENSED_FEATURES se habilitan todas: desarrollo, demo e instalaciones anteriores a los planes.

export class LicenseError extends Error {
  constructor(message) {
    super(message);
    this.status = 403;
    this.codigo = 'PLAN_NO_INCLUYE';
  }
}

export function parseLicensedFeatures(rawValue) {
  const raw = rawValue?.trim();
  if (raw === undefined || raw === null) return [...AVAILABLE_FEATURES];
  if (raw === '') return [];
  const requested = raw.split(',').map(f => f.trim()).filter(Boolean);
  const unknown = requested.filter(f => !AVAILABLE_FEATURES.includes(f));
  if (unknown.length > 0) console.warn(`[license] Se ignoran funciones desconocidas en LICENSED_FEATURES: ${unknown.join(', ')}`);
  return AVAILABLE_FEATURES.filter(f => requested.includes(f));
}

const parseLimit = (rawValue) => {
  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? value : null; // null o 0 = sin límite
};

export const LICENSED_FEATURES = parseLicensedFeatures(process.env.LICENSED_FEATURES);
export const PLAN_NAME = process.env.PLAN?.trim() || null;
export const LIMITS = {
  maxUsers: parseLimit(process.env.MAX_USERS),
  maxBranches: parseLimit(process.env.MAX_BRANCHES),
  maxCashRegisters: parseLimit(process.env.MAX_CASH_REGISTERS),
};

export const isFeatureLicensed = (feature) => LICENSED_FEATURES.includes(feature);

// Mensajes en la voz del cliente: quien contrata el plan es la ferretería, no el usuario.
const FEATURE_LABELS = {
  split_flow: 'los modos "vendedor y caja" y "por etapas"',
  shared_cash: 'varias cajas y turnos compartidos',
  deliveries: 'los envíos a domicilio',
  wholesale: 'la lista de precios mayorista',
  discounts: 'los descuentos',
  period_reports: 'los reportes por período',
  branches: 'las sucursales',
  audit: 'la auditoría',
  sunat: 'la facturación electrónica',
};

export function requireFeature(feature) {
  if (!isFeatureLicensed(feature)) {
    throw new LicenseError(`Su plan no incluye ${FEATURE_LABELS[feature] ?? feature}. Consulte con VALETEC para ampliarlo.`);
  }
}

// count: cuántos hay ahora. Se llama antes de crear uno nuevo.
export function requireWithinLimit(limitName, count, label) {
  const max = LIMITS[limitName];
  if (max !== null && count >= max) {
    throw new LicenseError(`Su plan permite hasta ${max} ${label}. Consulte con VALETEC para ampliarlo.`);
  }
}

// Licencia vencida: la empresa queda en solo lectura hasta renovar.
const EXPIRES_AT = process.env.LICENSE_EXPIRES_AT?.trim() || null;

export function licenseStatus() {
  if (!EXPIRES_AT) return { plan: PLAN_NAME, expiresAt: null, daysLeft: null, expired: false };
  const end = new Date(`${EXPIRES_AT}T23:59:59-05:00`);
  const daysLeft = Math.ceil((end - new Date()) / 86400000);
  return { plan: PLAN_NAME, expiresAt: EXPIRES_AT, daysLeft, expired: daysLeft < 0 };
}

// Respuesta uniforme desde cualquier ruta: devuelve true si el error era del plan.
export function respondIfLicenseError(res, error) {
  if (!(error instanceof LicenseError)) return false;
  res.status(error.status).json({ error: error.message, codigo: error.codigo });
  return true;
}
