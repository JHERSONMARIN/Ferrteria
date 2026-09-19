import { AVAILABLE_MODULES, ALWAYS_ENABLED_MODULES, SALE_FLOW_MODES } from '../config/modules.js';
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

  // El modo es opcional en la petición: si no viene, se conserva el actual.
  let saleFlowMode;
  if (input.saleFlowMode !== undefined) {
    if (!SALE_FLOW_MODES.includes(input.saleFlowMode)) {
      throw new SettingsValidationError('Modo de trabajo no válido.');
    }
    saleFlowMode = input.saleFlowMode;
    if (saleFlowMode !== 'DIRECT' && !enabledModules.includes('caja')) {
      throw new SettingsValidationError('Para trabajar con pedidos debe estar activo el módulo Arqueo de Caja (ahí se cobran).');
    }
    if (saleFlowMode === 'STAGED' && !enabledModules.includes('despacho')) {
      throw new SettingsValidationError('Para trabajar por etapas debe estar activo el módulo Despacho.');
    }
  }

  // Opcional como el modo: si no viene, se conserva el tope actual.
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
    enabledModules,
    saleFlowMode,
    maxDiscountPercent,
  };
}

const AUDITED_FIELDS = [
  'legalName', 'tradeName', 'taxId', 'address', 'phone', 'email', 'currencySymbol', 'taxRate',
  'ticketFooter', 'enabledModules', 'saleFlowMode', 'maxDiscountPercent',
];

export async function updateSettings(db, input, user = null) {
  const data = validateSettingsInput(input);

  // Cambiar de modo con pedidos en curso los dejaría sin pantalla donde cobrarlos o despacharlos.
  const current = await getSettings(db);
  if (data.saleFlowMode && data.saleFlowMode !== current.saleFlowMode) {
    const openOrders = await db.venta.count({ where: { status: { in: ['PENDING_PAYMENT', 'PAID'] } } });
    if (openOrders > 0) {
      throw new SettingsValidationError(
        `Hay ${openOrders} pedido(s) sin cobrar o sin despachar. Complételos o anúlelos antes de cambiar el modo de trabajo.`
      );
    }
  }

  return db.$transaction(async (tx) => {
    const saved = await tx.businessSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { ...data, id: SETTINGS_ID },
    });
    const changes = changedFields(current, saved, AUDITED_FIELDS);
    if (changes) {
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
