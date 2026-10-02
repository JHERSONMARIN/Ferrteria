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

/** GET /api/rubro/vencimientos: lo vencido y lo que vence pronto en una sucursal, y lo que no tiene lote. */
export interface ExpiryReport {
  /** AAAA-MM-DD, hora de Lima. */
  today: string;
  days: number;
  branchId: number;
  lots: {
    productId: number;
    code: string;
    name: string;
    lotNumber: string;
    expiresAt: string;
    quantity: number;
    expired: boolean;
  }[];
  /** Stock sin lote identificado: no se sabe cuándo vence. */
  unlotted: { productId: number; code: string; name: string; quantity: number }[];
}

/** GET /api/rubro/controlados: cada venta de un controlado, con su receta. */
export interface ControlledBookEntry {
  saleId: number;
  numDoc: string | null;
  /** Cuándo se cobró (ISO). */
  date: string;
  branch: string;
  seller: string | null;
  code: string;
  product: string;
  quantity: number;
  unit: string;
  prescriptionNumber: string | null;
  prescriber: string | null;
  patient: string | null;
}
