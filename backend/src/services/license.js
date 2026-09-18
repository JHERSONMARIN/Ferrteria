import { AVAILABLE_MODULES, ALWAYS_ENABLED_MODULES } from '../config/modules.js';

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
