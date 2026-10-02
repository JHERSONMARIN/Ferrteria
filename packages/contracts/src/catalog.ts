// Productos, presentaciones de venta y categorías (módulo catalog del backend).
import type { IsoDate } from './common.ts';
import { quantityProblem, roundMoney, roundQuantity } from './quantities.ts';
import { optionalId, z } from './zod.ts';

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
  /** Campos del paquete de rubro de la empresa; {} si su rubro no agrega ninguno. */
  industryData: Record<string, unknown>;
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

// ---------- Lo que envía la pantalla ----------

export const MAX_SALE_UNITS = 10;
export const MAX_PRODUCT_IMPORT_ROWS = 2000;
export const MAX_CATEGORY_IMPORT_ROWS = 1000;

const numberish = z.union([z.number(), z.string()]);
const trimmed = z.string().optional().transform(value => value?.trim() ?? '');
const issue = (ctx: z.RefinementCtx, message: string) => ctx.addIssue({ code: 'custom', message });

// Precio mayorista opcional: vacío o null = sin precio mayorista; sin la clave, al editar no se toca.
export function wholesalePriceOf(value: unknown): number | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : false;
}
const wholesalePrice = numberish.nullish().transform((value, ctx) => {
  const price = wholesalePriceOf(value);
  if (price === false) { issue(ctx, 'El precio mayorista debe ser mayor a 0.'); return z.NEVER; }
  return price;
});

/** Una presentación tal como se envía al guardar el producto (id null = nueva). */
const SaleUnitBody = z.object({
  id: numberish.nullish().transform(value => { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }),
  name: z.union([z.string(), z.number()]).nullish().transform(value => String(value ?? '').trim().slice(0, 40)),
  factor: numberish.nullish().transform(Number),
  price: numberish.nullish().transform(Number),
  wholesalePrice: numberish.nullish(),
  code: z.union([z.string(), z.number()]).nullish().transform(value => (value ? String(value).trim().slice(0, 60) : null)),
  allowsFractions: z.boolean().optional().transform(value => value === true),
}, { error: 'Las presentaciones no son válidas.' });
export type SaleUnitInput = z.input<typeof SaleUnitBody>;
export type SaleUnitData = Omit<z.output<typeof SaleUnitBody>, 'wholesalePrice'> & { wholesalePrice: number | null };

const saleUnits = z.array(SaleUnitBody, { error: 'Las presentaciones no son válidas.' })
  .max(MAX_SALE_UNITS, { error: `Se permiten hasta ${MAX_SALE_UNITS} presentaciones por producto.` })
  .optional();

// Presentaciones del formulario (caja x 12, rollo x 100 m…): sin repetir el nombre (ni el de la unidad base)
// ni el código. undefined = no se tocan; [] = se quitan todas.
export function checkSaleUnits(
  units: readonly z.output<typeof SaleUnitBody>[] | undefined, baseUnitName: string,
): { units: SaleUnitData[] | undefined } | { error: string } {
  if (units === undefined) return { units: undefined };
  const names = new Set([String(baseUnitName || 'Unidad').trim().toLowerCase()]);
  const codes = new Set<string>();
  const result: SaleUnitData[] = [];
  for (const [i, unit] of units.entries()) {
    const label = unit.name || `la presentación ${i + 1}`;
    if (!unit.name) return { error: `Falta el nombre de la presentación ${i + 1}.` };
    if (names.has(unit.name.toLowerCase())) return { error: `La presentación "${unit.name}" está repetida o es igual a la unidad base.` };
    names.add(unit.name.toLowerCase());
    if (!Number.isFinite(unit.factor) || unit.factor <= 0 || roundQuantity(unit.factor) !== unit.factor) {
      return { error: `Indique cuántas unidades base trae ${label} (mayor a 0, hasta 3 decimales).` };
    }
    if (!Number.isFinite(unit.price) || unit.price <= 0) return { error: `El precio de ${label} debe ser mayor a 0.` };
    const wholesale = wholesalePriceOf(unit.wholesalePrice);
    if (wholesale === false) return { error: `El precio mayorista de ${label} debe ser mayor a 0.` };
    if (unit.code) {
      if (codes.has(unit.code)) return { error: `El código ${unit.code} está repetido en las presentaciones.` };
      codes.add(unit.code);
    }
    result.push({ ...unit, price: roundMoney(unit.price), wholesalePrice: wholesale ?? null });
  }
  return { units: result };
}

// Unidad base y categoría: vacías, las de siempre.
const productFields = {
  unit: trimmed.transform(unit => unit || 'Unidad'),
  category: trimmed.transform(category => category || 'General'),
  // Categoría elegida en la lista; sin ella se busca (o se crea) por nombre.
  categoriaId: numberish.nullish().transform(value => parseInt(String(value ?? ''), 10) || null),
  wholesalePrice,
  saleUnits,
  /** Campos del rubro (PharmacyProductData en farmacia): los valida su paquete. Sin ellos, al editar no se tocan. */
  industryData: z.unknown().optional(),
};

// Las presentaciones se revisan contra la unidad base, que es otro campo.
function withSaleUnits<T extends { unit: string; saleUnits?: z.output<typeof SaleUnitBody>[] }>(data: T, ctx: z.RefinementCtx) {
  const checked = checkSaleUnits(data.saleUnits, data.unit);
  if ('error' in checked) { issue(ctx, checked.error); return z.NEVER; }
  return { ...data, saleUnits: checked.units };
}

const REQUIRED = 'Completa todos los campos obligatorios.';
const requiredNumber = numberish.optional().transform((value, ctx) => {
  const n = Number(value);
  if (value === undefined || Number.isNaN(n)) { issue(ctx, REQUIRED); return z.NEVER; }
  return n;
});

/**
 * POST /api/productos. El stock inicial entra a la sucursal del usuario (o a `branchId`, si lo indica el
 * administrador). minStock vacío = el mínimo de siempre (lo pone el servidor).
 */
export const CreateProductBody = z.object({
  code: trimmed.refine(code => code.length > 0, { error: REQUIRED }),
  name: trimmed.refine(name => name.length > 0, { error: REQUIRED }),
  stock: requiredNumber,
  price: requiredNumber,
  allowsFractions: z.boolean().optional().transform(value => value === true),
  minStock: numberish.optional().transform((value, ctx) => {
    if (value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) { issue(ctx, 'El stock mínimo no es válido.'); return z.NEVER; }
    return n;
  }),
  ...productFields,
  branchId: optionalId('Sucursal no válida.'),
}).transform((data, ctx) => withSaleUnits(data, ctx)).superRefine((data, ctx) => {
  const problem = data.stock !== 0 ? quantityProblem(data.stock, data.allowsFractions) : null;
  if (problem) issue(ctx, `El stock inicial ${problem}.`);
});
export type CreateProductRequest = z.input<typeof CreateProductBody>;

/** PUT /api/productos/:id. El stock no se edita aquí: se ajusta con un movimiento de kardex. */
export const UpdateProductBody = z.object({
  code: trimmed.refine(code => code.length > 0, { error: 'El código y el nombre son obligatorios.' }),
  name: trimmed.refine(name => name.length > 0, { error: 'El código y el nombre son obligatorios.' }),
  price: numberish.optional().transform((value, ctx) => {
    const price = parseFloat(String(value));
    if (value === undefined || Number.isNaN(price) || price <= 0) { issue(ctx, 'El precio debe ser un número mayor a 0.'); return z.NEVER; }
    return price;
  }),
  allowsFractions: z.boolean().optional(),
  // Vacío o inválido: no se cambia.
  minStock: numberish.optional().transform(value => (value !== undefined && value !== '' && Number(value) >= 0 ? Number(value) : undefined)),
  ...productFields,
}).transform((data, ctx) => withSaleUnits(data, ctx));
export type UpdateProductRequest = z.input<typeof UpdateProductBody>;

const importRows = (max: number) => z.array(z.unknown(), { error: 'No hay filas para importar.' })
  .min(1, { error: 'No hay filas para importar.' })
  .max(max, { error: `Se pueden importar hasta ${max} filas por vez.` });
const onExisting = z.string().optional().transform((value): OnExisting => (value === 'update' ? 'update' : 'skip'));

/**
 * POST /api/productos/importar. Cada fila se revisa aparte (con las reglas del formulario) para devolver
 * todos los errores juntos; aquí solo se exige la lista.
 */
export const ProductImportBody = z.object({
  rows: importRows(MAX_PRODUCT_IMPORT_ROWS),
  onExisting,
  branchId: optionalId('Sucursal no válida.'),
});
export type ProductImportRequest = z.input<typeof ProductImportBody>;

// Texto opcional de una categoría: lo que no es texto, o queda vacío, es null.
const categoryText = z.string().nullish().catch(null).transform(value => value?.trim() || null);
const categoryName = (required: boolean) => {
  const missing = required ? 'El nombre de la categoría es obligatorio.' : 'El nombre de la categoría no puede estar vacío.';
  return z.string({ error: missing }).optional().transform((value, ctx) => {
    if (value === undefined && !required) return undefined;
    const name = value?.trim() ?? '';
    if (!name) { issue(ctx, missing); return z.NEVER; }
    if (name.length < 2) { issue(ctx, 'El nombre debe tener al menos 2 caracteres.'); return z.NEVER; }
    return name;
  });
};

/** POST /api/categorias. Sin ícono ni color, los de siempre (los pone el servidor). */
export const CreateCategoryBody = z.object({
  name: categoryName(true),
  description: categoryText,
  icon: categoryText,
  color: categoryText,
});
export type CreateCategoryRequest = z.input<typeof CreateCategoryBody>;

/** PUT /api/categorias/:id (solo lo que cambia; ícono o color vacíos no se tocan). */
export const UpdateCategoryBody = z.object({
  name: categoryName(false),
  description: categoryText.optional(),
  icon: categoryText,
  color: categoryText,
  active: z.boolean().optional().catch(undefined),
});
export type UpdateCategoryRequest = z.input<typeof UpdateCategoryBody>;

/** POST /api/categorias/importar */
export const CategoryImportBody = z.object({ rows: importRows(MAX_CATEGORY_IMPORT_ROWS), onExisting });
export type CategoryImportRequest = z.input<typeof CategoryImportBody>;
