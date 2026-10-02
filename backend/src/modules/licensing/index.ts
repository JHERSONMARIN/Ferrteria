// Módulo de licencias (núcleo): qué contrató la empresa y qué hace cumplir el servidor.
// Es lo único que el resto del sistema importa de este módulo.
import { ALWAYS_ENABLED_MODULES, AVAILABLE_MODULES } from '../../config/modules.js';
import {
  assertFeature, assertWithinLimit, hasFeature, hasModule, licenseStatus as statusOf,
  type Feature, type LimitName,
} from './domain/license.ts';
import { readLicense } from './infrastructure/environment.ts';

export { FEATURES, LicenseError, type Feature, type License, type LicenseStatus } from './domain/license.ts';
export { respondIfLicenseError, readOnlyWhenExpired } from './interface/http.ts';

// La licencia de esta instancia: se lee una vez al arrancar.
const license = readLicense(process.env, AVAILABLE_MODULES, ALWAYS_ENABLED_MODULES);

export const LICENSED_MODULES = license.modules;
export const LICENSED_FEATURES = license.features;
export const LIMITS = license.limits;
export const PLAN_NAME = license.plan;
export const INDUSTRY = license.industry;

export const isModuleLicensed = (moduleId: string) => hasModule(license, moduleId);
export const isFeatureLicensed = (feature: Feature) => hasFeature(license, feature);
export const requireFeature = (feature: Feature) => assertFeature(license, feature);
export const requireWithinLimit = (limit: LimitName, count: number, label: string) =>
  assertWithinLimit(license, limit, count, label);
export const licenseStatus = () => statusOf(license, new Date());

// Módulos que la empresa puede usar de verdad: activos en su configuración y contratados.
export const getActiveModules = (settings: { enabledModules: string[] }) =>
  settings.enabledModules.filter(isModuleLicensed);
