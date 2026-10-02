// Configuración de la empresa y plan contratado (módulos settings y licensing del backend).
import type { IsoDate } from './common.ts';
import { optionalText, z } from './zod.ts';

export type DocumentType = 'NOTA_VENTA' | 'BOLETA' | 'FACTURA';

export interface BusinessSettings {
  id: number;
  legalName: string;
  tradeName: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currencySymbol: string;
  taxRate: number;
  ticketFooter: string | null;
  /** Data URL de la imagen. */
  logo: string | null;
  /** #RRGGBB; null = estilo por defecto. */
  primaryColor: string | null;
  navColor: string | null;
  enabledModules: string[];
  /** Tope de descuento (%) de quien no es administrador; 0 = no puede descontar. */
  maxDiscountPercent: number;
  updatedAt: IsoDate;
}

/** Serie de comprobante de una sucursal (T001, B001, F001…). */
export interface DocumentSeries {
  id: number;
  documentType: DocumentType;
  series: string;
  lastNumber: number;
  isDefault: boolean;
  isActive: boolean;
  branchId: number;
  branch: { id: number; name: string };
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** Un estilo visual predeterminado (backend/src/config/themes.json). */
export interface Theme {
  nombre: string;
  descripcion: string;
  primaryColor: string;
  navColor: string;
}

export type LimitName = 'maxUsers' | 'maxBranches' | 'maxCashRegisters';

/** Rubro de la empresa (packages/shared/industries.js). */
export type Industry = 'ferreteria' | 'farmacia';

/** Palabras que cambian según el rubro (las da su paquete: backend/src/industries). */
export interface Vocabulary {
  /** El comercio, en singular y plural: "ferretería", "ferreterías". */
  business: string;
  businesses: string;
  /** Lo que se vende: "producto", "productos". */
  product: string;
  products: string;
  /** Ejemplo de nombre comercial para los formularios. */
  sampleTradeName: string;
}

export interface LicenseStatus {
  plan: string | null;
  /** AAAA-MM-DD; null = sin vencimiento. */
  expiresAt: string | null;
  daysLeft: number | null;
  expired: boolean;
}

/** GET /api/settings */
export interface SettingsResponse {
  settings: BusinessSettings;
  documentSeries: DocumentSeries[];
  themes: Record<string, Theme>;
  availableModules: string[];
  licensedModules: string[];
  licensedFeatures: string[];
  /** null = sin límite. */
  limits: Record<LimitName, number | null>;
  license: LicenseStatus;
  industry: Industry;
  vocabulary: Vocabulary;
}

// ---------- Lo que envía la pantalla ----------

// Logo: data URL de imagen, hasta 300 KB (base64: un carácter = un byte). Vacío o null lo quita.
const MAX_LOGO_BYTES = 300 * 1024;
const LOGO_PATTERN = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const logo = z.string({ error: 'El logo debe ser una imagen PNG, JPG, WEBP o SVG.' }).trim().nullable().optional()
  .transform(value => (value === undefined ? undefined : value || null))
  .refine(value => !value || LOGO_PATTERN.test(value), { error: 'El logo debe ser una imagen PNG, JPG, WEBP o SVG.' })
  .refine(value => !value || value.length <= MAX_LOGO_BYTES, { error: 'El logo no puede superar 300 KB. Use una imagen más liviana.' });

// Colores de la empresa (principal y del menú): #RRGGBB. Vacío o null vuelve al estilo por defecto.
const COLOR_ERROR = 'El color principal debe escribirse como #RRGGBB (por ejemplo #ea580c).';
const color = z.string({ error: COLOR_ERROR }).trim().toLowerCase().nullable().optional()
  .transform(value => (value === undefined ? undefined : value || null))
  .refine(value => !value || /^#[0-9a-f]{6}$/.test(value), { error: COLOR_ERROR });

const LEGAL_NAME_ERROR = 'La razón social debe tener entre 2 y 150 caracteres.';
const TAX_RATE_ERROR = 'El porcentaje de IGV debe estar entre 0 y 100.';
const DISCOUNT_ERROR = 'El descuento máximo debe estar entre 0 y 100 %.';

/**
 * PUT /api/settings. Lo opcional que llega vacío queda en null. Sin `logo`, colores, `enabledModules` o
 * `maxDiscountPercent` se conserva lo que había. Que los módulos existan y estén en el plan lo revisa el servidor.
 */
export const SettingsBody = z.object({
  legalName: z.string({ error: LEGAL_NAME_ERROR }).trim().min(2, { error: LEGAL_NAME_ERROR }).max(150, { error: LEGAL_NAME_ERROR }),
  tradeName: optionalText(100, 'El nombre comercial'),
  taxId: optionalText(11, 'El RUC').refine(value => !value || /^\d{11}$/.test(value), { error: 'El RUC debe tener 11 dígitos.' }),
  address: optionalText(200, 'La dirección'),
  phone: optionalText(30, 'El teléfono'),
  email: optionalText(120, 'El correo')
    .refine(value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), { error: 'El correo electrónico no es válido.' }),
  currencySymbol: optionalText(5, 'El símbolo de moneda')
    .refine(value => value !== null, { error: 'El símbolo de moneda es obligatorio.' }).transform(value => value!),
  taxRate: z.coerce.number({ error: TAX_RATE_ERROR }).min(0, { error: TAX_RATE_ERROR }).max(100, { error: TAX_RATE_ERROR }),
  ticketFooter: optionalText(300, 'El pie del ticket'),
  logo,
  primaryColor: color,
  navColor: color,
  enabledModules: z.array(z.string({ error: 'La lista de módulos es inválida.' }), { error: 'La lista de módulos es inválida.' }).optional(),
  maxDiscountPercent: z.coerce.number({ error: DISCOUNT_ERROR }).min(0, { error: DISCOUNT_ERROR }).max(100, { error: DISCOUNT_ERROR })
    .transform(value => Math.round(value * 100) / 100).optional(),
});
export type SettingsRequest = z.input<typeof SettingsBody>;

export interface SettingsSaved {
  success: true;
  settings: BusinessSettings;
}
