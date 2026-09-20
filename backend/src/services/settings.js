import { AVAILABLE_MODULES, ALWAYS_ENABLED_MODULES } from '../config/modules.js';
import { isModuleLicensed } from './license.js';
import { recordAudit, changedFields } from './audit.js';

export { AVAILABLE_MODULES };

const SETTINGS_ID = 1;

// Valores de la instalación original, para que las bases existentes no cambien su ticket.
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

export class SettingsValidationError extends Error {}

export async function getSettings(db) {
  // Se consulta en cada petición (permisos): la lectura simple evita escribir en la base.
  const existing = await db.businessSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  // upsert evita que dos peticiones simultáneas intenten crear la fila a la vez.
  return db.businessSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: DEFAULT_SETTINGS,
  });
}

const optionalText = (value, maxLength, fieldLabel) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new SettingsValidationError(`${fieldLabel} no puede superar ${maxLength} caracteres.`);
  }
  return text || null;
};

function normalizeModules(modules) {
  if (!Array.isArray(modules)) {
    throw new SettingsValidationError('La lista de módulos es inválida.');
  }
  const unknown = modules.filter(m => !AVAILABLE_MODULES.includes(m));
  if (unknown.length > 0) {
    throw new SettingsValidationError(`Módulos desconocidos: ${unknown.join(', ')}.`);
  }
  const notLicensed = modules.filter(m => !isModuleLicensed(m));
  if (notLicensed.length > 0) {
    throw new SettingsValidationError(`Estos módulos no están incluidos en su plan: ${notLicensed.join(', ')}.`);
  }
  const enabled = new Set([...modules, ...ALWAYS_ENABLED_MODULES]);
  // Se conserva el orden del menú.
  return AVAILABLE_MODULES.filter(m => enabled.has(m));
}

// Logo: data URL de imagen, hasta 300 KB. Vacío o null lo quita.
const MAX_LOGO_BYTES = 300 * 1024;
const LOGO_PATTERN = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

function parseLogo(value) {
  if (value === undefined) return undefined; // no se toca
  if (value === null || value === '') return null;
  const logo = String(value).trim();
  if (!LOGO_PATTERN.test(logo)) {
    throw new SettingsValidationError('El logo debe ser una imagen PNG, JPG, WEBP o SVG.');
  }
  if (Buffer.byteLength(logo, 'utf8') > MAX_LOGO_BYTES) {
    throw new SettingsValidationError('El logo no puede superar 300 KB. Use una imagen más liviana.');
  }
  return logo;
}

export function validateSettingsInput(input) {
  const legalName = String(input?.legalName ?? '').trim();
  if (legalName.length < 2 || legalName.length > 150) {
    throw new SettingsValidationError('La razón social debe tener entre 2 y 150 caracteres.');
  }

  const taxId = optionalText(input.taxId, 11, 'El RUC');
  if (taxId && !/^\d{11}$/.test(taxId)) {
    throw new SettingsValidationError('El RUC debe tener 11 dígitos.');
  }

  const email = optionalText(input.email, 120, 'El correo');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SettingsValidationError('El correo electrónico no es válido.');
  }

  const taxRate = Number(input.taxRate);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw new SettingsValidationError('El porcentaje de IGV debe estar entre 0 y 100.');
  }

  const currencySymbol = optionalText(input.currencySymbol, 5, 'El símbolo de moneda');
  if (!currencySymbol) {
    throw new SettingsValidationError('El símbolo de moneda es obligatorio.');
  }

  const enabledModules = normalizeModules(input.enabledModules);

  // Opcional: si no viene, se conserva el tope actual.
  // El modo de trabajo ya no está aquí: es de cada sucursal (services/branches.js).
  let maxDiscountPercent;
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
    enabledModules,
    maxDiscountPercent,
  };
}

const AUDITED_FIELDS = [
  'legalName', 'tradeName', 'taxId', 'address', 'phone', 'email', 'currencySymbol', 'taxRate',
  'ticketFooter', 'enabledModules', 'maxDiscountPercent',
];

// El logo se audita por su cambio, no por su contenido (es una imagen larga).
const LOGO_FIELD = 'logo';

export async function updateSettings(db, input, user = null) {
  const data = validateSettingsInput(input);

  const current = await getSettings(db);

  // Las sucursales que trabajan con pedidos cobran en Caja; las que van por etapas despachan en Despacho.
  const modes = (await db.branch.findMany({ where: { active: true }, select: { saleFlowMode: true } })).map(b => b.saleFlowMode);
  if (!data.enabledModules.includes('caja') && modes.some(m => m !== 'DIRECT')) {
    throw new SettingsValidationError('Hay sucursales que trabajan con pedidos: el módulo Arqueo de Caja debe seguir activo.');
  }
  if (!data.enabledModules.includes('despacho') && modes.includes('STAGED')) {
    throw new SettingsValidationError('Hay sucursales que trabajan por etapas: el módulo Despacho debe seguir activo.');
  }

  return db.$transaction(async (tx) => {
    const saved = await tx.businessSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { ...data, id: SETTINGS_ID },
    });
    const changes = changedFields(current, saved, AUDITED_FIELDS) ?? {};
    if (current[LOGO_FIELD] !== saved[LOGO_FIELD]) {
      changes[LOGO_FIELD] = { before: current.logo ? 'imagen anterior' : null, after: saved.logo ? 'imagen nueva' : null };
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
