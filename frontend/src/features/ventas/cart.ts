// El carrito de Vender: reglas puras de cantidades y stock (mismos criterios que el servidor).
import type { Product, SaleUnit } from '@ferresys/contracts/catalog';
import type { CartLine } from '@ferresys/contracts/sales';
import { roundQuantity } from '../../shared/utils/quantities.ts';

/** Una línea del carrito: un producto en una presentación (unitId null = unidad base). */
export interface CartItem {
  key: string;
  id: number;
  unitId: number | null;
  unitName: string | null;
  /** Unidades base por cada unidad vendida (1 en la unidad base). */
  factor: number;
  name: string;
  code: string;
  price: number;
  qty: number;
  /** Disponible del producto al agregarlo (si ya no está en la lista de productos). */
  stock: number;
  unit: string;
  allowsFractions: boolean;
}

// Stock que se puede vender: lo reservado por pedidos sin despachar ya tiene dueño.
export const availableStock = (product: Pick<Product, 'stock' | 'reserved'>) =>
  roundQuantity(product.stock - (product.reserved || 0));

// "c/u" para lo que se vende por unidad; "/ metro", "/ kilo"… para lo demás.
export const perUnitLabel = (unit: string | null) => (!unit || unit === 'Unidad' ? 'c/u' : `/ ${unit.toLowerCase()}`);
export const stockUnitLabel = (unit: string | null) => (!unit || unit === 'Unidad' ? 'disp.' : `${unit.toLowerCase()} disp.`);

export const lineKey = (id: number, unitId: number | null | undefined) => `${id}:${unitId ?? 0}`;

// Unidades del stock que ocupa una línea.
export const baseQtyOf = (item: Pick<CartItem, 'qty' | 'factor'>) => roundQuantity(item.qty * (item.factor || 1));

export const unitOf = (product: Product | undefined, unitId: number | null) =>
  (unitId ? product?.saleUnits.find(u => u.id === unitId) ?? null : null);

// Mismo criterio que el backend: precio mayorista si el cliente tiene esa lista y el producto (o la
// presentación) lo define.
export const priceFor = (product: Product, wholesale: boolean, unit: SaleUnit | null = null) => {
  const source = unit ?? product;
  return wholesale && source.wholesalePrice != null ? source.wholesalePrice : source.price;
};

// Lo que viaja al servidor de cada línea.
export const cartPayload = (cart: readonly CartItem[]): CartLine[] =>
  cart.map(item => ({ id: item.id, unitId: item.unitId, name: item.name, qty: item.qty }));
