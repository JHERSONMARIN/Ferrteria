// Formulario de Configuración: datos de la empresa como texto editable, y su validación en pantalla
// (el servidor valida lo mismo con SettingsBody del contrato).
import type { BusinessSettings } from '@ferresys/contracts/settings';

export interface SettingsForm {
  legalName: string;
  tradeName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  currencySymbol: string;
  taxRate: string;
  ticketFooter: string;
  logo: string | null;
  maxDiscountPercent: string;
}

export type TextField = Exclude<keyof SettingsForm, 'logo'>;
export type Errors = Partial<Record<keyof SettingsForm, string>>;

export const EDITABLE_FIELDS: (keyof SettingsForm)[] = [
  'legalName', 'tradeName', 'taxId', 'address', 'phone', 'email',
  'currencySymbol', 'taxRate', 'ticketFooter', 'logo', 'maxDiscountPercent',
];

export const toForm = (settings: BusinessSettings): SettingsForm => ({
  legalName: settings.legalName || '',
  tradeName: settings.tradeName || '',
  taxId: settings.taxId || '',
  address: settings.address || '',
  phone: settings.phone || '',
  email: settings.email || '',
  currencySymbol: settings.currencySymbol || 'S/',
  taxRate: String(settings.taxRate ?? 18),
  ticketFooter: settings.ticketFooter || '',
  logo: settings.logo || null,
  maxDiscountPercent: String(settings.maxDiscountPercent ?? 0),
});

export function validateForm(form: SettingsForm): Errors {
  const errors: Errors = {};
  if (form.legalName.trim().length < 2) errors.legalName = 'La razón social es obligatoria.';
  if (form.taxId.trim() && !/^\d{11}$/.test(form.taxId.trim())) errors.taxId = 'El RUC debe tener 11 dígitos.';
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Correo no válido.';
  const rate = Number(form.taxRate);
  if (form.taxRate === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) errors.taxRate = 'Debe estar entre 0 y 100.';
  if (!form.currencySymbol.trim()) errors.currencySymbol = 'Obligatorio.';
  const maxDiscount = Number(form.maxDiscountPercent);
  if (form.maxDiscountPercent === '' || !Number.isFinite(maxDiscount) || maxDiscount < 0 || maxDiscount > 100) {
    errors.maxDiscountPercent = 'Debe estar entre 0 y 100.';
  }
  return errors;
}
