// Licencia de la empresa: qué módulos y funciones tiene contratados, con qué límites y hasta cuándo.
// Reglas puras: no leen el entorno ni conocen HTTP (eso está en infrastructure/ e interface/).
import { AppError } from '@ferresys/shared/errors';

// Funciones licenciables que no son módulos del menú. El catálogo de planes está en deploy/plans.json.
export const FEATURES = [
  'split_flow',      // modos "vendedor y caja" y "por etapas"
  'shared_cash',     // varias cajas y turnos compartidos
  'deliveries',      // envíos a domicilio
  'wholesale',       // lista de precios mayorista
  'discounts',       // descuentos con tope por rol
  'period_reports',  // reportes por período y exportación CSV
  'branches',        // varias sucursales y transferencias
  'audit',           // auditoría
  'sunat',           // facturación electrónica (Fase 7)
] as const;

export type Feature = (typeof FEATURES)[number];

export type LimitName = 'maxUsers' | 'maxBranches' | 'maxCashRegisters';

/** null = sin límite. */
export type Limits = Record<LimitName, number | null>;

export interface License {
  plan: string | null;
  modules: readonly string[];
  features: readonly Feature[];
  limits: Limits;
  /** AAAA-MM-DD: vence al terminar ese día, hora de Perú. */
  expiresAt: string | null;
}

export interface LicenseStatus {
  plan: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  expired: boolean;
}

// Mensajes en la voz del cliente: quien contrata el plan es la ferretería, no el usuario.
const FEATURE_LABELS: Record<Feature, string> = {
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

export class LicenseError extends AppError {
  static override area = 'PLAN';

  constructor(message: string) {
    super(message, 403, 'PLAN_NO_INCLUYE');
  }
}

export interface ParsedList<T extends string> {
  licensed: T[];
  /** Nombres que no existen en el catálogo: se ignoran, y quien lee el entorno lo avisa. */
  unknown: string[];
}

const splitList = (raw: string) => raw.split(',').map(item => item.trim()).filter(Boolean);

// Módulos contratados (LICENSED_MODULES=pos,caja,...). Sin valor se habilitan todos: desarrollo, demo e
// instalaciones anteriores a los planes. Los módulos que nunca se bloquean se agregan siempre.
export function parseModules(
  raw: string | undefined,
  available: readonly string[],
  alwaysEnabled: readonly string[],
): ParsedList<string> {
  const value = raw?.trim();
  if (!value) return { licensed: [...available], unknown: [] };
  const requested = splitList(value);
  const licensed = new Set([...requested, ...alwaysEnabled]);
  return {
    licensed: available.filter(m => licensed.has(m)),
    unknown: requested.filter(m => !available.includes(m)),
  };
}

// Funciones contratadas (LICENSED_FEATURES). Sin valor o con "*": todas. Vacía: ninguna (plan Básico).
export function parseFeatures(raw: string | undefined): ParsedList<Feature> {
  const value = raw?.trim();
  if (value === undefined || value === '*') return { licensed: [...FEATURES], unknown: [] };
  const requested = splitList(value);
  return {
    licensed: FEATURES.filter(f => requested.includes(f)),
    unknown: requested.filter(f => !(FEATURES as readonly string[]).includes(f)),
  };
}

/** 0, vacío o un valor inválido = sin límite. */
export function parseLimit(raw: string | undefined): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export const hasModule = (license: License, moduleId: string) => license.modules.includes(moduleId);

export const hasFeature = (license: License, feature: Feature) => license.features.includes(feature);

export function assertFeature(license: License, feature: Feature): void {
  if (!hasFeature(license, feature)) {
    throw new LicenseError(`Su plan no incluye ${FEATURE_LABELS[feature]}. Consulte con VALETEC para ampliarlo.`);
  }
}

// count: cuántos hay ahora. Se llama antes de crear uno nuevo.
export function assertWithinLimit(license: License, limit: LimitName, count: number, label: string): void {
  const max = license.limits[limit];
  if (max !== null && count >= max) {
    throw new LicenseError(`Su plan permite hasta ${max} ${label}. Consulte con VALETEC para ampliarlo.`);
  }
}

// Licencia vencida: la empresa queda en solo lectura hasta renovar.
export function licenseStatus(license: License, now: Date): LicenseStatus {
  if (!license.expiresAt) return { plan: license.plan, expiresAt: null, daysLeft: null, expired: false };
  const end = new Date(`${license.expiresAt}T23:59:59-05:00`);
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);
  return { plan: license.plan, expiresAt: license.expiresAt, daysLeft, expired: daysLeft < 0 };
}
