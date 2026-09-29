// Productos, presentaciones de venta y categorías (módulo catalog del backend).
import type { IsoDate } from './common.ts';

/** Presentación de venta de un producto (caja x 12, rollo de 100 m…): factor unidades base. */
export interface SaleUnit {
  id: number;
  name: string;
  factor: number;
  price: number;
  wholesalePrice: number | null;
  code: string | null;
  allowsFractions: boolean;
}

export interface BranchStock {
  branchId: number;
  stock: number;
  reserved: number;
}

/**
 * GET /api/productos. stock y reserved son los de la sucursal del usuario (lo que puede vender);
 * totalStock y totalReserved, los de toda la empresa; branches, el detalle por sucursal.
 */
export interface Product {
  id: number;
  code: string;
  name: string;
  /** Unidad base: Unidad, Metro, Kilo… */
  unit: string;
  allowsFractions: boolean;
  price: number;
  wholesalePrice: number | null;
  minStock: number | null;
  category: string;
  stock: number;
  reserved: number;
  totalStock: number;
  totalReserved: number;
  branches: BranchStock[];
  saleUnits: SaleUnit[];
}

/** GET /api/categorias, con sus números. */
export interface Category {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  active: boolean;
  createdAt: IsoDate;
  productCount: number;
  totalStock: number;
  inventoryValue: number;
  lowStockCount: number;
}
