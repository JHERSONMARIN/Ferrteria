// Configuración de la empresa: datos del comprobante, IGV, logo, colores, módulos activos y tope de descuento.
// Módulo simple: reglas y acceso a datos en un solo archivo.
import type { prisma } from '../../db.ts';
import { AppError } from '@ferresys/shared/errors';
import { ALWAYS_ENABLED_MODULES, AVAILABLE_MODULES } from '../../config/modules.js';
import { changedFields, recordAudit } from '../audit/index.ts';
import { isModuleLicensed } from '../licensing/index.ts';

type Db = Pick<typeof prisma, 'businessSettings'>;
type Client = typeof prisma;

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

function optionalText(value: unknown, maxLength: number, fieldLabel: string): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text.length > maxLength) throw new SettingsValidationError(`${fieldLabel} no puede superar ${maxLength} caracteres.`);
  return text || null;
}

// Los módulos activos los define VALETEC (deploy/set-modules.sh y la consola): si la petición no los
// trae, se conservan los que ya tiene la empresa.
function normalizeModules(modules: unknown): string[] | undefined {
  if (modules === undefined) return undefined;
  if (!Array.isArray(modules)) throw new SettingsValidationError('La lista de módulos es inválida.');
  const unknown = modules.filter(m => !AVAILABLE_MODULES.includes(m));
  if (unknown.length > 0) throw new SettingsValidationError(`Módulos desconocidos: ${unknown.join(', ')}.`);
  const notLicensed = modules.filter(m => !isModuleLicensed(m));
  if (notLicensed.length > 0) {
    throw new SettingsValidationError(`Estos módulos no están incluidos en su plan: ${notLicensed.join(', ')}.`);
  }
  const enabled = new Set([...modules, ...ALWAYS_ENABLED_MODULES]);
  return AVAILABLE_MODULES.filter(m => enabled.has(m)); // en el orden del menú
}

// Logo: data URL de imagen, hasta 300 KB. Vacío o null lo quita; sin la clave no se toca.
const MAX_LOGO_BYTES = 300 * 1024;
const LOGO_PATTERN = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

function parseLogo(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const logo = String(value).trim();
  if (!LOGO_PATTERN.test(logo)) throw new SettingsValidationError('El logo debe ser una imagen PNG, JPG, WEBP o SVG.');
  if (Buffer.byteLength(logo, 'utf8') > MAX_LOGO_BYTES) {
    throw new SettingsValidationError('El logo no puede superar 300 KB. Use una imagen más liviana.');
  }
  return logo;
}

// Colores de la empresa (principal y del menú): #RRGGBB. Vacío o null vuelve al estilo por defecto.
function parseColor(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const color = String(value).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    throw new SettingsValidationError('El color principal debe escribirse como #RRGGBB (por ejemplo #ea580c).');
  }
  return color;
}

export function validateSettingsInput(input: Record<string, unknown>) {
  const legalName = String(input?.legalName ?? '').trim();
  if (legalName.length < 2 || legalName.length > 150) throw new SettingsValidationError('La razón social debe tener entre 2 y 150 caracteres.');

  const taxId = optionalText(input.taxId, 11, 'El RUC');
  if (taxId && !/^\d{11}$/.test(taxId)) throw new SettingsValidationError('El RUC debe tener 11 dígitos.');

  const email = optionalText(input.email, 120, 'El correo');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SettingsValidationError('El correo electrónico no es válido.');

  const taxRate = Number(input.taxRate);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new SettingsValidationError('El porcentaje de IGV debe estar entre 0 y 100.');

  const currencySymbol = optionalText(input.currencySymbol, 5, 'El símbolo de moneda');
  if (!currencySymbol) throw new SettingsValidationError('El símbolo de moneda es obligatorio.');

  // Opcional: si no viene, se conserva el tope actual. El modo de trabajo es de cada sucursal (módulo branches).
  let maxDiscountPercent: number | undefined;
  if (input.maxDiscountPercent !== undefined) {
    maxDiscountPercent = Number(input.maxDiscountPercent);
    if (!Number.isFinite(maxDiscountPercent) || maxDiscountPercent < 0 || maxDiscountPercent > 100) {
      throw new SettingsValidationError('El descuento máximo debe estar entre 0 y 100 %.');
    }
    maxDiscountPercent = Math.round(maxDiscountPercent * 100) / 100;
  }

  return {
    legalName,
    tradeName: optionalText(input.tradeName, 100, 'El nombre comercial'),
    taxId,
    address: optionalText(input.address, 200, 'La dirección'),
    phone: optionalText(input.phone, 30, 'El teléfono'),
    email,
    currencySymbol,
    taxRate,
    ticketFooter: optionalText(input.ticketFooter, 300, 'El pie del ticket'),
    logo: parseLogo(input.logo),
    primaryColor: parseColor(input.primaryColor),
    navColor: parseColor(input.navColor),
    enabledModules: normalizeModules(input.enabledModules),
    maxDiscountPercent,
  };
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

export async function updateSettings(client: Client, input: Record<string, unknown>, user: { id: number; name: string } | null = null) {
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
    return saved;
  });
}
