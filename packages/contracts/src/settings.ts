// Configuración de la empresa y plan contratado (módulos settings y licensing del backend).
import type { IsoDate } from './common.ts';

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
export type Industry = 'ferreteria';

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
}

/** PUT /api/settings (solo los campos que se cambian). */
export type SettingsUpdate = Partial<Omit<BusinessSettings, 'id' | 'updatedAt'>>;

export interface SettingsSaved {
  success: true;
  settings: BusinessSettings;
}
