// Puntos de enganche: lo único que un paquete de rubro puede hacer dentro de los pasos del núcleo
// (documento de arquitectura, sección 3.4). Un enganche corre dentro de la transacción del paso y puede
// rechazarlo (lanzando un AppError con un mensaje para el usuario) o guardar sus propios datos. No cambia
// precios, cantidades ni estados: si un rubro necesita eso, la regla es del núcleo y se configura allí.
import type { Tx } from '../db.ts';
import type { z } from 'zod';
import type { Vocabulary } from '@ferresys/contracts/settings';
import type { SessionUser } from '../types/express.d.ts';

/** Una línea que está por venderse. qty está en la presentación elegida; baseQty, en la unidad del stock. */
export interface SaleLine {
  productId: number;
  unitId: number | null;
  qty: number;
  baseQty: number;
  name: string;
}

export interface SaleContext {
  /** 'direct': se cobra en el POS (con envío, se entrega después). 'order': queda como pedido para caja. */
  kind: 'direct' | 'order';
  branchId: number;
  customerId: number | null;
  lines: readonly SaleLine[];
  user: SessionUser;
}

/** Un cambio del stock físico de una sucursal (las reservas no lo son). qty, en la unidad del stock. */
export interface StockMovement {
  direction: 'in' | 'out';
  source: 'purchase' | 'manual' | 'transfer' | 'sale';
  productId: number;
  qty: number;
  branchId: number;
  /** Stock de la sucursal después del movimiento. */
  stockAfter: number;
  /** Texto del kardex: "Compra a Proveedor (Doc: F001-12)", "Venta B001-00000045"… */
  ref: string;
  userId: number | null;
  /** Datos del rubro que vinieron en la línea (el lote de una compra), ya validados con fields.stockEntry. */
  data?: IndustryData;
}

export interface IndustryHooks {
  /** Antes de registrar una venta o un pedido, con los precios ya calculados. */
  beforeSale?(tx: Tx, sale: SaleContext): Promise<void>;
  /** Después de que el stock entró o salió, en la misma transacción. */
  onStockMovement?(tx: Tx, movement: StockMovement): Promise<void>;
}

/** Datos propios del rubro en una entidad del núcleo; se guardan en su columna industryData. */
export type IndustryData = Record<string, unknown>;

// Un paquete aporta, además de sus enganches, las palabras con que las pantallas nombran las cosas y
// los campos que agrega a las entidades del núcleo (con su esquema, que también da los mensajes de error).
export interface IndustryPackage {
  id: string;
  hooks: IndustryHooks;
  vocabulary: Vocabulary;
  fields?: {
    product?: z.ZodType<IndustryData>;
    /** Datos de una línea que entra al stock (compra o ingreso manual). */
    stockEntry?: z.ZodType<IndustryData>;
  };
}
