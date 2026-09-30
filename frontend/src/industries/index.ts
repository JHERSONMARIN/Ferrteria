// Lo que cada rubro agrega a las pantallas del núcleo. El rubro de la empresa viene en la configuración
// (industry); su paquete del backend (backend/src/industries) valida lo que estas piezas envían.
import type { ComponentType } from 'react';
import type { Product } from '@ferresys/contracts/catalog';
import type { Industry } from '@ferresys/contracts/settings';
import { useSettings } from '../api/queries.ts';
import LotFields, { describeLot, lotProblem } from './farmacia/LotFields.tsx';
import PharmacyProductFields from './farmacia/PharmacyProductFields.tsx';
import PrescriptionFields, { needsPrescription, prescriptionProblem } from './farmacia/PrescriptionFields.tsx';

export { capitalize, useVocabulary } from './vocabulary.ts';

/** Campos del rubro en un formulario: editan el industryData de la entidad. */
export interface IndustryFieldsProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}

/** Campos del rubro en una venta: dependen de los productos del carrito. */
export interface SaleFieldsProps extends IndustryFieldsProps {
  products: readonly Product[];
}

interface IndustryUi {
  /** Ícono del negocio en el menú cuando la empresa no tiene logo. */
  icon: string;
  /** Campos propios en el formulario de producto. */
  ProductFields?: ComponentType<IndustryFieldsProps>;
  /** Datos de una línea que entra al stock (compra o ingreso manual), con su validación y su resumen. */
  stockEntry?: {
    Fields: ComponentType<IndustryFieldsProps>;
    problem: (value: Record<string, unknown>) => string | null;
    describe: (value: Record<string, unknown>) => string;
    /** Título de la columna en la lista de la compra. */
    label: string;
  };
  /** Pantallas propias (app/screens.ts): quién las ve. admin = solo el administrador. */
  screens?: { id: string; access: 'admin' | readonly string[] }[];
  /** Datos de una venta o pedido (farmacia: la receta), solo cuando los productos del carrito los piden. */
  sale?: {
    Fields: ComponentType<SaleFieldsProps>;
    needs: (products: readonly Product[]) => boolean;
    problem: (value: Record<string, unknown>, products: readonly Product[]) => string | null;
  };
}

const INDUSTRY_UI: Record<Industry, IndustryUi> = {
  ferreteria: { icon: 'fa-screwdriver-wrench' },
  farmacia: {
    icon: 'fa-prescription-bottle-medical',
    ProductFields: PharmacyProductFields,
    stockEntry: { Fields: LotFields, problem: lotProblem, describe: describeLot, label: 'Lote' },
    sale: { Fields: PrescriptionFields, needs: needsPrescription, problem: prescriptionProblem },
    screens: [
      { id: 'vencimientos', access: ['inventory', 'kardex'] },
      { id: 'controlados', access: 'admin' },
    ],
  },
};

// Rubro de la empresa, leído de la configuración que ya cargó la aplicación (no la vuelve a pedir).
export function useIndustry(): Industry {
  return useSettings(false).data?.industry ?? 'ferreteria';
}

export const useIndustryUi = (): IndustryUi => INDUSTRY_UI[useIndustry()];

// Antes de iniciar sesión no hay configuración: el rubro viene en /app-info.
export const industryIcon = (industry: Industry | undefined) => INDUSTRY_UI[industry ?? 'ferreteria'].icon;
