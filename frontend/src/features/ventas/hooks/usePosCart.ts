// El carrito de Vender: líneas, cantidades contra el stock disponible, precios según el cliente y la
// cotización cargada (que conserva sus precios).
import { useEffect, useMemo, useState } from 'react';
import type { Product, SaleUnit } from '@ferresys/contracts/catalog';
import type { PricesChanged, Quote } from '@ferresys/contracts/sales';
import type { ApiError } from '../../../api/client.ts';
import { formatQuantity, quantityProblem, roundMoney, roundQuantity } from '../../../shared/utils/quantities.ts';
import { useConfirm, useToast } from '../../../shared/ui/index.ts';
import {
  availableStock, baseQtyOf, lineDiscount, lineGross, lineKey, priceFor, unitOf, type CartItem, type LineDiscountDraft,
} from '../cart.ts';

export interface LoadedQuote {
  id: number;
  numDoc: string;
}

export function usePosCart(products: readonly Product[], isWholesale: boolean) {
  const aviso = useToast();
  const confirmar = useConfirm();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadedQuote, setLoadedQuote] = useState<LoadedQuote | null>(null);
  // Producto con varias presentaciones esperando que se elija en cuál se vende.
  const [unitChoice, setUnitChoice] = useState<Product | null>(null);

  // Unidades base de cada producto ya puestas en el carrito (sumando sus presentaciones).
  const qtyInCart = useMemo(() => {
    const map = new Map<number, number>();
    cart.forEach(i => map.set(i.id, roundQuantity((map.get(i.id) || 0) + baseQtyOf(i))));
    return map;
  }, [cart]);
  // Importe sin descuentos, lo descontado en las líneas y lo que queda (sobre eso va el descuento del total).
  const gross = roundMoney(cart.reduce((sum, item) => sum + lineGross(item), 0));
  const lineDiscounts = roundMoney(cart.reduce((sum, item) => sum + lineDiscount(item).amount, 0));
  const subtotal = roundMoney(gross - lineDiscounts);
  const lineDiscountError = cart.some(item => lineDiscount(item).error !== '');

  // Al cambiar de cliente se recalculan los precios del carrito (salvo si viene de una cotización,
  // que conserva los precios cotizados).
  useEffect(() => {
    if (loadedQuote) return;
    setCart(prev => prev.map(item => {
      const product = products.find(p => p.id === item.id);
      const unit = unitOf(product, item.unitId);
      if (!product || (item.unitId && !unit)) return item;
      return { ...item, price: priceFor(product, isWholesale, unit) };
    }));
  }, [isWholesale, products]);

  useEffect(() => {
    if (cart.length === 0) setLoadedQuote(null);
  }, [cart.length]);

  // Máximo de una línea: lo disponible del producto menos lo que ocupan sus otras líneas.
  const maxQtyFor = (item: CartItem, lines: readonly CartItem[] = cart) => {
    const product = products.find(p => p.id === item.id);
    const available = product ? availableStock(product) : item.stock;
    const others = lines
      .filter(i => i.id === item.id && i.key !== item.key)
      .reduce((sum, i) => sum + baseQtyOf(i), 0);
    const max = (available - others) / (item.factor || 1);
    return item.allowsFractions ? Math.floor(max * 1000) / 1000 : Math.floor(max + 1e-9);
  };

  // unit: presentación elegida (null = unidad base); sin elegir y con presentaciones, primero se pregunta cuál.
  const add = (product: Product, unit?: SaleUnit | null) => {
    if (unit === undefined && product.saleUnits.length > 0) {
      setUnitChoice(product);
      return;
    }
    const available = availableStock(product);
    if (available <= 0) {
      aviso.error(`${product.name} está agotado.`);
      return;
    }
    const key = lineKey(product.id, unit?.id);
    const current = cart.find(i => i.key === key);
    const draft: CartItem = current ?? {
      key, id: product.id, unitId: unit?.id ?? null, unitName: unit?.name ?? null, factor: unit?.factor ?? 1,
      name: product.name, code: product.code, price: priceFor(product, isWholesale, unit ?? null), qty: 0, stock: available,
      unit: unit?.name ?? product.unit, allowsFractions: unit ? unit.allowsFractions : product.allowsFractions, discount: null,
    };
    const max = maxQtyFor(draft);
    if (draft.qty + 1 > max) {
      aviso.error(`No alcanza el stock: quedan ${formatQuantity(roundQuantity(available - (qtyInCart.get(product.id) || 0)))} ${product.unit.toLowerCase()} de ${product.name}.`);
      return;
    }
    setCart(prev => current
      ? prev.map(i => (i.key === key ? { ...i, qty: roundQuantity(i.qty + 1) } : i))
      : [...prev, { ...draft, qty: 1 }]
    );
  };

  const setQty = (key: string, qty: number) => {
    const item = cart.find(i => i.key === key);
    if (!item) return;
    const problem = quantityProblem(qty, item.allowsFractions);
    if (problem) {
      aviso.error(`La cantidad de ${item.name} ${problem}.`);
      return;
    }
    let quantity = qty;
    const max = maxQtyFor(item);
    if (quantity > max) {
      aviso.error(`Solo hay ${formatQuantity(Math.max(max, 0))} ${item.unitName ? item.unitName.toLowerCase() : 'disponibles'} de ${item.name}.`);
      quantity = max;
    }
    if (quantity <= 0) return;
    setCart(prev => prev.map(i => (i.key === key ? { ...i, qty: quantity } : i)));
  };

  const remove = (key: string) => setCart(prev => prev.filter(item => item.key !== key));

  // null quita el descuento de la línea.
  const setDiscount = (key: string, discount: LineDiscountDraft | null) =>
    setCart(prev => prev.map(i => (i.key === key ? { ...i, discount } : i)));

  const clear = () => setCart([]);

  // Pide confirmación antes de vaciar.
  const askToClear = async () => {
    if (cart.length === 0) return;
    const seguro = await confirmar({
      title: 'Vaciar la venta',
      description: 'Se quitarán todos los productos del carrito.',
      confirmText: 'Vaciar',
      tone: 'danger',
    });
    if (seguro) clear();
  };

  // Si el servidor rechaza porque los precios cambiaron, el carrito se actualiza con los reales.
  const applyServerPrices = (err: ApiError) => {
    const data = err.data as Partial<PricesChanged> | null;
    const serverPrices = new Map((data?.precios ?? []).map(p => [lineKey(p.id, p.unitId), p.price]));
    setCart(prev => prev.map(item => {
      const price = serverPrices.get(item.key);
      return price === undefined ? item : { ...item, price };
    }));
  };

  // Reemplaza el carrito por los productos de la cotización, con sus precios cotizados.
  const loadQuote = (quote: Quote) => {
    setCart(quote.detalles.map(d => {
      const unit = unitOf(products.find(p => p.id === d.producto.id), d.unitId);
      return {
        key: lineKey(d.producto.id, d.unitId),
        id: d.producto.id,
        unitId: d.unitId ?? null,
        unitName: d.unitName ?? null,
        factor: d.unitFactor ?? 1,
        name: d.producto.name,
        code: d.producto.code,
        price: d.unitPrice,
        qty: d.quantity,
        stock: availableStock(d.producto),
        unit: d.unitName ?? d.producto.unit,
        allowsFractions: unit ? unit.allowsFractions : d.producto.allowsFractions,
        discount: null,
      };
    }));
    setLoadedQuote({ id: quote.id, numDoc: quote.numDoc });
  };

  return {
    cart, gross, lineDiscounts, subtotal, lineDiscountError, qtyInCart, loadedQuote, unlinkQuote: () => setLoadedQuote(null),
    unitChoice, closeUnitChoice: () => setUnitChoice(null),
    add, setQty, remove, setDiscount, clear, askToClear, applyServerPrices, loadQuote,
  };
}

export type PosCart = ReturnType<typeof usePosCart>;
