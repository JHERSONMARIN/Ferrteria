const SETTINGS_ID = 1;

// Identificadores de módulo; deben coincidir con los del menú del frontend.
export const AVAILABLE_MODULES = [
  'pos', 'cotizaciones', 'caja', 'inventory', 'categories', 'kardex',
  'compras', 'deliveries', 'client-dir', 'customers', 'personal', 'dashboard',
];

// Sin "personal" nadie podría administrar usuarios ni reactivar módulos.
const ALWAYS_ENABLED_MODULES = ['personal'];

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
    enabledModules: normalizeModules(input.enabledModules),
  };
}

export async function updateSettings(db, input) {
  const data = validateSettingsInput(input);
  return db.businessSettings.upsert({
    where: { id: SETTINGS_ID },
    update: data,
    create: { ...data, id: SETTINGS_ID },
  });
}
