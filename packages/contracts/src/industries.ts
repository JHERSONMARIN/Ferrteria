// Datos que agrega cada paquete de rubro a las entidades del núcleo (columna industryData).

/** Farmacia: datos de un producto. */
// type y no interface: así cabe en industryData (Record<string, unknown>).
export type PharmacyProductData = {
  /** Registro sanitario (DIGEMID). */
  sanitaryRegistration?: string;
  activeIngredient?: string;
  laboratory?: string;
  /** Se vende solo con número de receta. */
  requiresPrescription: boolean;
  /** Sustancia controlada: pide receta y queda en el libro de controlados. */
  controlled: boolean;
};

/** Farmacia: la receta de una venta que la necesita. */
export type PharmacySaleData = {
  prescriptionNumber?: string;
  /** Médico que la firma, con su CMP. Obligatorio si hay un controlado. */
  prescriber?: string;
  /** Obligatorio si hay un controlado. */
  patient?: string;
};
