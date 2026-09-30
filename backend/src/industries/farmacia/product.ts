// Datos de farmacia en un producto: registro sanitario, principio activo, laboratorio y si pide receta.
import { z } from 'zod';
import type { PharmacyProductData } from '@ferresys/contracts/industries';

const optionalText = (label: string, max: number) =>
  z.string({ message: `${label}: debe ser un texto.` }).trim().max(max, `${label}: hasta ${max} caracteres.`)
    .optional().transform(value => value || undefined);

// Un controlado siempre pide receta. Lo vacío no se guarda.
export const pharmacyProduct = z.object({
  sanitaryRegistration: optionalText('Registro sanitario', 30),
  activeIngredient: optionalText('Principio activo', 120),
  laboratory: optionalText('Laboratorio', 80),
  requiresPrescription: z.boolean({ message: '«Requiere receta» debe ser sí o no.' }).default(false),
  controlled: z.boolean({ message: '«Controlado» debe ser sí o no.' }).default(false),
}).transform((data): PharmacyProductData => {
  const filled = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  return { ...filled, requiresPrescription: data.requiresPrescription || data.controlled, controlled: data.controlled };
});
