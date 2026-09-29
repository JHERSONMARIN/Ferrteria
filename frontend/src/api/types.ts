// Forma de los datos que devuelve la API y que usa toda la aplicación (sesión, empresa, licencia).
// Los datos propios de cada pantalla se tipan en su carpeta de features/.

export type SaleFlowMode = 'DIRECT' | 'SEPARATE_CASHIER' | 'STAGED';
export type DispatchRole = 'SELLER' | 'CASHIER' | 'WAREHOUSE';
export type Role = 'ADMINISTRADOR' | 'VENDEDOR' | 'CAJERO' | 'REPARTIDOR' | 'ALMACEN';

export interface SessionBranch {
  id: number;
  name: string;
  saleFlowMode: SaleFlowMode;
  deliveriesEnabled: boolean;
  dispatchRole: DispatchRole | null;
}

export interface SessionUser {
  id: number;
  name: string;
  user: string;
  role: Role;
  modules: string[];
  active: boolean;
  mustChangePassword: boolean;
  branchId: number;
  branch: SessionBranch | null;
}

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
  logo: string | null;
  primaryColor: string | null;
  navColor: string | null;
  enabledModules: string[];
  maxDiscountPercent: number;
}

export interface LicenseStatus {
  plan: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  expired: boolean;
}

export interface SettingsResponse {
  settings: BusinessSettings;
  documentSeries: unknown[];
  themes: Record<string, unknown>;
  availableModules: string[];
  licensedModules: string[] | null;
  licensedFeatures: string[] | null;
  limits: Record<string, number | null>;
  license: LicenseStatus | null;
}

export interface AppInfo {
  demoMode: boolean;
  quickLogin: { user: string; pass: string; label: string }[];
  business: { name: string | null; logo: string | null; primaryColor: string | null; navColor: string | null } | null;
  version: { number: string | null; commit: string | null } | null;
}
