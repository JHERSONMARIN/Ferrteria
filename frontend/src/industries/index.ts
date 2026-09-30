// Lo que cada rubro agrega a las pantallas del núcleo. El rubro de la empresa viene en la configuración
// (industry); su paquete del backend (backend/src/industries) valida lo que estas piezas envían.
import type { ComponentType } from 'react';
import type { Industry } from '@ferresys/contracts/settings';
import { useSettings } from '../api/queries.ts';
import PharmacyProductFields from './farmacia/PharmacyProductFields.tsx';

export { capitalize, useVocabulary } from './vocabulary.ts';

/** Campos del rubro en un formulario: editan el industryData de la entidad. */
export interface IndustryFieldsProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}

interface IndustryUi {
  /** Campos propios en el formulario de producto. */
  ProductFields?: ComponentType<IndustryFieldsProps>;
}

const INDUSTRY_UI: Record<Industry, IndustryUi> = {
  ferreteria: {},
  farmacia: { ProductFields: PharmacyProductFields },
};

// Rubro de la empresa, leído de la configuración que ya cargó la aplicación (no la vuelve a pedir).
export function useIndustry(): Industry {
  return useSettings(false).data?.industry ?? 'ferreteria';
}

export const useIndustryUi = (): IndustryUi => INDUSTRY_UI[useIndustry()];
