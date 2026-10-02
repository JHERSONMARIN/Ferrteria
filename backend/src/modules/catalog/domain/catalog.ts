// Catálogo: productos, presentaciones de venta y categorías. Reglas puras. La forma de lo que envía el
// formulario (presentaciones incluidas) la validan los esquemas de @ferresys/contracts/catalog.
import { AppError } from '@ferresys/shared/errors';
import { quantityProblem, roundMoney } from '../../../utils/quantities.ts';
import type { SaleUnitData } from '@ferresys/contracts/catalog';

export class ProductError extends AppError {
  static override area = 'PRODUCTO';
}

export class CategoryError extends AppError {
  static override area = 'CATEGORIA';
}

export const DEFAULT_MIN_STOCK = 10;
export const CATEGORY_COLORS = ['orange', 'blue', 'emerald', 'cyan', 'purple', 'amber', 'red', 'indigo', 'slate', 'yellow'];
const ICON_PATTERN = /^fa-[a-z0-9-]{1,40}$/;

// Una presentación no puede tener el código de su propio producto (el escáner no sabría cuál vender).
export function assertUnitCodesDiffer(units: readonly SaleUnitData[] | undefined, productCode: string): void {
  if (units?.some(u => u.code && u.code === productCode)) {
    throw new ProductError('Una presentación no puede tener el mismo código que el producto.');
  }
}

// No se puede dejar de vender fraccionado si el stock de alguna sucursal tiene decimales.
export const hasDecimalStock = (branchStocks: readonly { stock: number; reserved: number }[]) =>
  branchStocks.some(b => !Number.isInteger(b.stock) || !Number.isInteger(b.reserved));

// ---------- Importación de productos ----------

const YES = ['si', 'sí', 's', 'yes', 'x', '1', 'true', 'verdadero'];
const yes = (v: unknown) => v === true || YES.includes(String(v ?? '').trim().toLowerCase());

// Número de una celda: vacío = null; con coma decimal también vale; texto = NaN (inválido).
function cellNumber(v: unknown): number | null {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export interface ProductImportRow {
  code: string;
  name: string;
  unit: string;
  category: string;
  allowsFractions: boolean;
  price: number;
  wholesalePrice: number | null;
  stock: number;
  minStock: number;
}

// Revisa una fila de la importación con las mismas reglas que el formulario.
export function parseProductImportRow(row: Record<string, unknown> | null | undefined): { data: ProductImportRow } | { error: string } {
  const code = String(row?.code ?? '').trim();
  const name = String(row?.name ?? '').trim();
  const unit = String(row?.unit ?? '').trim() || 'Unidad';
  const category = String(row?.category ?? '').trim() || 'General';
  const allowsFractions = yes(row?.allowsFractions);
  const price = cellNumber(row?.price);
  const wholesalePrice = cellNumber(row?.wholesalePrice);
  const stock = cellNumber(row?.stock) ?? 0;
  const minStock = cellNumber(row?.minStock) ?? DEFAULT_MIN_STOCK;

  if (code.length < 2 || code.length > 60) return { error: 'El código debe tener entre 2 y 60 caracteres.' };
  if (name.length < 2 || name.length > 120) return { error: 'El nombre debe tener entre 2 y 120 caracteres.' };
  if (unit.length > 30) return { error: 'La unidad es demasiado larga.' };
  if (category.length > 60) return { error: 'La categoría es demasiado larga.' };
  if (price === null || Number.isNaN(price) || price <= 0 || price > 1000000) return { error: 'El precio debe ser un número mayor a 0.' };
  if (Number.isNaN(wholesalePrice) || (wholesalePrice !== null && wholesalePrice <= 0)) return { error: 'El precio mayorista debe ser mayor a 0 o quedar vacío.' };
  if (Number.isNaN(stock) || stock < 0) return { error: 'El stock inicial no puede ser negativo.' };
  const stockProblem = stock > 0 ? quantityProblem(stock, allowsFractions) : null;
  if (stockProblem) return { error: `El stock inicial ${stockProblem}.` };
  if (Number.isNaN(minStock) || minStock < 0) return { error: 'El stock mínimo no puede ser negativo.' };
  return {
    data: {
      code, name, unit, category, allowsFractions,
      price: roundMoney(price),
      wholesalePrice: wholesalePrice === null ? null : roundMoney(wholesalePrice),
      stock, minStock,
    },
  };
}

// ---------- Categorías ----------

export interface CategoryImportRow {
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

export function parseCategoryImportRow(row: Record<string, unknown> | null | undefined): { data: CategoryImportRow } | { error: string } {
  const name = String(row?.name ?? '').trim();
  const description = String(row?.description ?? '').trim();
  const iconRaw = String(row?.icon ?? '').trim().toLowerCase();
  const icon = iconRaw && !iconRaw.startsWith('fa-') ? `fa-${iconRaw}` : iconRaw;
  const color = String(row?.color ?? '').trim().toLowerCase();
  if (name.length < 2 || name.length > 60) return { error: 'El nombre debe tener entre 2 y 60 caracteres.' };
  if (description.length > 200) return { error: 'La descripción es demasiado larga (máx. 200).' };
  if (icon && !ICON_PATTERN.test(icon)) return { error: 'El ícono no es válido (ej. fa-hammer).' };
  if (color && !CATEGORY_COLORS.includes(color)) return { error: `Color no válido. Use: ${CATEGORY_COLORS.join(', ')}.` };
  return { data: { name, description: description || null, icon: icon || null, color: color || null } };
}

// Filas de una importación: las válidas, y los errores por fila (incluidas las repetidas por clave).
export function checkImportRows<T>(
  rows: unknown[],
  parse: (row: Record<string, unknown>) => { data: T } | { error: string },
  keyOf: (data: T) => string,
  repeatedMessage: (data: T, firstRow: number) => string,
) {
  const errors: { index: number; error: string }[] = [];
  const valid: (T & { index: number })[] = [];
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    const result = parse(row as Record<string, unknown>);
    if ('error' in result) return errors.push({ index, error: result.error });
    const key = keyOf(result.data).toLowerCase();
    if (seen.has(key)) return errors.push({ index, error: repeatedMessage(result.data, seen.get(key)! + 1) });
    seen.set(key, index);
    valid.push({ index, ...result.data });
  });
  return { valid, errors };
}

// Métricas de una categoría sobre sus productos activos.
export function categoryMetrics(products: readonly { stock: number; minStock: number | null; price: number }[]) {
  return {
    productCount: products.length,
    totalStock: products.reduce((sum, p) => sum + p.stock, 0),
    inventoryValue: Number(products.reduce((sum, p) => sum + p.stock * p.price, 0).toFixed(2)),
    lowStockCount: products.filter(p => p.stock <= (p.minStock ?? DEFAULT_MIN_STOCK)).length,
  };
}
