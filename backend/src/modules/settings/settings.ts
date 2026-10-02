// Configuración de la empresa: datos del comprobante, IGV, logo, colores, módulos activos y tope de descuento.
// Módulo simple: reglas y acceso a datos en un solo archivo.
import type { prisma } from '../../db.ts';
import { AppError } from '@ferresys/shared/errors';
import { ALWAYS_ENABLED_MODULES, AVAILABLE_MODULES } from '../../config/modules.js';
import { changedFields, recordAudit } from '../audit/index.ts';
import { isModuleLicensed } from '../licensing/index.ts';
import type { z } from '@ferresys/contracts/zod';
import type { SettingsBody } from '@ferresys/contracts/settings';

type Db = Pick<typeof prisma, 'businessSettings'>;
type Client = typeof prisma;
type SettingsInput = z.infer<typeof SettingsBody>;

export class SettingsValidationError extends AppError {
  static override area = 'CONFIGURACION';
}

const SETTINGS_ID = 1;

// Valores de la instalación original, para que las bases existentes no cambien su ticket. Las empresas
// nuevas nacen con su razón social (scripts/bootstrap.js), así que esto solo aplica a bases antiguas.
const DEFAULT_SETTINGS = {
  id: SETTINGS_ID,
  legalName: 'FERRESYS S.A.C.',
  tradeName: 'FerreSys',
  taxId: '20123456789',
  address: 'Av. Las Flores 123, Cajamarca',
  currencySymbol: 'S/',
  taxRate: 18,
  enabledModules: AVAILABLE_MODULES,
};

// Los módulos se guardan como JSON: se devuelven siempre como lista de textos.
const moduleList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((m): m is string => typeof m === 'string') : []);

// Se consulta en cada petición (permisos): la lectura simple evita escribir en la base.
export async function getSettings(db: Db) {
  const row = await db.businessSettings.findUnique({ where: { id: SETTINGS_ID } })
    // upsert evita que dos peticiones simultáneas intenten crear la fila a la vez.
    ?? await db.businessSettings.upsert({ where: { id: SETTINGS_ID }, update: {}, create: DEFAULT_SETTINGS });
  return { ...row, enabledModules: moduleList(row.enabledModules) };
}

// Los módulos activos los define VALETEC (deploy/set-modules.sh y la consola): si la petición no los
// trae, se conservan los que ya tiene la empresa. La forma la valida SettingsBody; aquí, que existan y
// estén en el plan.
function normalizeModules(modules: string[] | undefined): string[] | undefined {
  if (modules === undefined) return undefined;
  const unknown = modules.filter(m => !AVAILABLE_MODULES.includes(m));
  if (unknown.length > 0) throw new SettingsValidationError(`Módulos desconocidos: ${unknown.join(', ')}.`);
  const notLicensed = modules.filter(m => !isModuleLicensed(m));
  if (notLicensed.length > 0) {
    throw new SettingsValidationError(`Estos módulos no están incluidos en su plan: ${notLicensed.join(', ')}.`);
  }
  const enabled = new Set([...modules, ...ALWAYS_ENABLED_MODULES]);
  return AVAILABLE_MODULES.filter(m => enabled.has(m)); // en el orden del menú
}

export const settingsError = (message: string) => new SettingsValidationError(message);

// Lo que se guarda: el cuerpo ya validado, con los módulos revisados contra el catálogo y el plan.
export function validateSettingsInput(input: SettingsInput) {
  return { ...input, enabledModules: normalizeModules(input.enabledModules) };
}

const AUDITED_FIELDS = [
  'legalName', 'tradeName', 'taxId', 'address', 'phone', 'email', 'currencySymbol', 'taxRate',
  'ticketFooter', 'enabledModules', 'maxDiscountPercent', 'primaryColor', 'navColor',
];

// Las sucursales que trabajan con pedidos cobran en Caja; las que van por etapas despachan en Despacho:
// esos módulos no se pueden apagar mientras alguna sucursal los necesite.
export function assertModesStillServed(enabledModules: readonly string[], branchModes: readonly string[]): void {
  if (!enabledModules.includes('caja') && branchModes.some(m => m !== 'DIRECT')) {
    throw new SettingsValidationError('Hay sucursales que trabajan con pedidos: el módulo Caja debe seguir activo.');
  }
  if (!enabledModules.includes('despacho') && branchModes.includes('STAGED')) {
    throw new SettingsValidationError('Hay sucursales que trabajan por etapas: el módulo Despacho debe seguir activo.');
  }
}

export async function updateSettings(client: Client, input: SettingsInput, user: { id: number; name: string } | null = null) {
  const data = validateSettingsInput(input);
  const current = await getSettings(client);
  const enabledModules = data.enabledModules ?? current.enabledModules;
  const modes = await client.branch.findMany({ where: { active: true }, select: { saleFlowMode: true } });
  assertModesStillServed(enabledModules, modes.map(b => b.saleFlowMode));

  return client.$transaction(async (tx) => {
    const saved = await tx.businessSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { ...data, enabledModules, id: SETTINGS_ID },
    });
    const changes = changedFields(current, saved, AUDITED_FIELDS) ?? {};
    // El logo se audita por su cambio, no por su contenido (es una imagen larga).
    if (current.logo !== saved.logo) {
      changes.logo = { before: current.logo ? 'imagen anterior' : null, after: saved.logo ? 'imagen nueva' : null };
    }
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, {
        action: 'SETTINGS_CHANGED',
        entity: 'Configuracion',
        summary: `Configuración modificada: ${Object.keys(changes).join(', ')}`,
        details: changes,
        user,
      });
    }
    return { ...saved, enabledModules: moduleList(saved.enabledModules) };
  });
}
