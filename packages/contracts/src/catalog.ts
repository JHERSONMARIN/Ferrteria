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

/** Una presentación tal como se envía al guardar el producto (id null = nueva). */
export interface SaleUnitInput {
  id: number | null;
  name: string;
  factor: number;
  price: number;
  wholesalePrice: number | null;
  code: string | null;
  allowsFractions: boolean;
}

/** POST /api/productos y PUT /api/productos/:id (el stock inicial solo al crear). */
export interface ProductRequest {
  code: string;
  name: string;
  unit: string;
  allowsFractions: boolean;
  category: string;
  stock?: number;
  minStock: number;
  price: number;
  wholesalePrice: number | null;
  saleUnits: SaleUnitInput[];
}

/** GET /api/productos/barcode/:code: el producto ya registrado o el nombre encontrado en internet. */
export type BarcodeLookup =
  | { foundInDb: true; product: Pick<Product, 'id' | 'code' | 'name' | 'unit' | 'allowsFractions' | 'price' | 'category' | 'stock' | 'reserved'> }
  | { foundInDb: false; name: string };

/** Qué hacer con los códigos (o nombres) que ya existen al importar. */
export type OnExisting = 'skip' | 'update';

/** Error por fila de una importación rechazada (en data.rows del error). */
export interface ImportRowError {
  index: number;
  error: string;
}

/** POST /api/productos/importar */
export interface ProductImportResult {
  success: true;
  created: number;
  updated: number;
  skipped: number;
  categoriesCreated: number;
}

/** POST /api/categorias y PUT /api/categorias/:id */
export interface CategoryRequest {
  name: string;
  description: string;
  icon: string;
  color: string;
}

/** POST /api/categorias/importar */
export interface CategoryImportResult {
  success: true;
  created: number;
  updated: number;
  skipped: number;
}

/** DELETE /api/categorias/:id?targetCategoryId= (los productos pasan a la categoría indicada). */
export interface CategoryDeleted {
  success: true;
  message: string;
  reassignedCount: number;
}
