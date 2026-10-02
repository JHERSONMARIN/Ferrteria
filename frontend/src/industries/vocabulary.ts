// Palabras del rubro de la empresa ("ferretería", "producto"…). Las da su paquete de rubro en el backend
// (backend/src/industries) junto con la configuración; las pantallas las usan en vez de escribirlas a mano.
import type { Vocabulary } from '@ferresys/contracts/settings';
import { useSettings } from '../api/queries.ts';

// Mientras llega la configuración (o si falla), las de ferretería: el rubro de todas las empresas anteriores.
const DEFAULT_VOCABULARY: Vocabulary = {
  business: 'ferretería',
  businesses: 'ferreterías',
  product: 'producto',
  products: 'productos',
  sampleTradeName: 'Ferretería Los Andes',
};

// Lee la configuración que ya cargó la aplicación; no la vuelve a pedir.
export function useVocabulary(): Vocabulary {
  return useSettings(false).data?.vocabulary ?? DEFAULT_VOCABULARY;
}

export const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
