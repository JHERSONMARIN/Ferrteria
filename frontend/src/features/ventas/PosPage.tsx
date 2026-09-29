// Vender: catálogo a la izquierda y la venta (o el pedido, si la sucursal trabaja con caja separada) a la derecha.
import { useState, useEffect, useRef, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Product, SaleUnit } from '@ferresys/contracts/catalog';
import type { SaleFlowMode, SessionUser } from '@ferresys/contracts/identity';
import type {
  DirectSaleRequest, DirectSaleSaved, OrderRequest, OrderSaved, PricesChanged, Quote, QuoteRequest, QuoteSaved,
} from '@ferresys/contracts/sales';
import { api, ApiError } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { fetchCashStatus, useCashStatus, useCategories, useCustomers, useProducts } from '../../api/queries.ts';
import BarcodeScannerModal from '../../shared/scanner/BarcodeScannerModal.tsx';
import { formatSoles } from '../../shared/utils/currency.ts';
import { findCustomerByInput } from '../../shared/utils/customers.ts';
import { buildSaleTicket, type TicketData } from '../../shared/utils/tickets.ts';
import { quantityProblem, roundQuantity, roundMoney, formatQuantity } from '../../shared/utils/quantities.ts';
import { useToast, useConfirm, SkeletonCards } from '../../shared/ui/index.ts';
import CustomerSelector from './components/CustomerSelector.tsx';
import CheckoutModal, { type CheckoutPayment } from './components/CheckoutModal.tsx';
import SaleSuccessModal, { type SaleSuccess } from './components/SaleSuccessModal.tsx';
import CartQtyInput from './components/CartQtyInput.tsx';
import UnitChoiceModal from './components/UnitChoiceModal.tsx';
import QuotePickerModal from './components/QuotePickerModal.tsx';
import {
  availableStock, baseQtyOf, cartPayload, lineKey, perUnitLabel, priceFor, stockUnitLabel, unitOf, type CartItem,
} from './cart.ts';
import { fetchQuotes } from './queries.ts';

type DiscountType = 'PERCENT' | 'AMOUNT';

const NO_PRODUCTS: Product[] = [];

interface Props {
  currentUser: SessionUser;
  onTriggerPrint?: (ticket: TicketData) => void;
  saleFlowMode?: SaleFlowMode;
  deliveriesEnabled?: boolean;
  maxDiscountPercent?: number;
}

export default function PosPage({ currentUser, onTriggerPrint, saleFlowMode = 'DIRECT', deliveriesEnabled = false, maxDiscountPercent = 0 }: Props) {
  const aviso = useToast();
  const confirmar = useConfirm();
  const queryClient = useQueryClient();
  const isDirect = saleFlowMode === 'DIRECT';

  const productsQuery = useProducts();
  const products = productsQuery.data ?? NO_PRODUCTS;
  const clients = useCustomers().data ?? [];
  // Sin categorías registradas se usan las de los productos.
  const dbCategories = useCategories().data ?? [];
  // En modo directo se cobra aquí: hace falta estar en un turno de caja.
  const estadoCaja = useCashStatus(isDirect).data ?? null;
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (productsQuery.error) aviso.error(`Error cargando datos del Punto de Venta: ${productsQuery.error.message}`);
  }, [productsQuery.error, aviso]);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerInput, setCustomerInput] = useState('');
  const [customerError, setCustomerError] = useState('');
  const [loadedQuote, setLoadedQuote] = useState<{ id: number; numDoc: string } | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENT');
  const [discountValue, setDiscountValue] = useState('');

  const [showCheckout, setShowCheckout] = useState(false);
  const [success, setSuccess] = useState<SaleSuccess | null>(null);

  const [pendingQuotes, setPendingQuotes] = useState<Quote[] | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const customerPanelRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  const cartActionsRef = useRef<HTMLDivElement>(null);
  const [showScanner, setShowScanner] = useState(false);
  // Producto con varias presentaciones esperando que se elija en cuál se vende.
  const [unitChoice, setUnitChoice] = useState<Product | null>(null);
  // En pantallas angostas la barra "Ver venta" solo aparece si los botones del carrito no se ven,
  // así no tapa "Cobrar" ni "Guardar como cotización".
  const [cartActionsVisible, setCartActionsVisible] = useState(false);
  useEffect(() => {
    const el = cartActionsRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setCartActionsVisible(Boolean(entry?.isIntersecting)), { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // En pantallas táctiles el foco automático abriría el teclado al entrar.
  useEffect(() => {
    if (window.matchMedia('(min-width: 1280px)').matches) searchRef.current?.focus();
  }, []);

  // Después de vender cambian el stock, la deuda del cliente (fiado) y la caja.
  const refreshAfterSale = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.products });
    queryClient.invalidateQueries({ queryKey: queryKeys.customers });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashStatus });
  };

  const categories = useMemo(() => {
    const fromDb = dbCategories.map(c => c.name);
    const fromProducts = products.map(p => p.category).filter(Boolean);
    const unique = Array.from(new Set([...fromDb, ...fromProducts]));
    return ['Todas', ...(unique.length > 0 ? unique : ['General'])];
  }, [dbCategories, products]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter(p => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
        || p.saleUnits.some(u => u.code && u.code.toLowerCase().includes(q));
      const matchesCategory = selectedCategory === 'Todas' || (p.category || 'General') === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, selectedCategory]);

  // Unidades base de cada producto ya puestas en el carrito (sumando sus presentaciones).
  const qtyInCart = useMemo(() => {
    const map = new Map<number, number>();
    cart.forEach(i => map.set(i.id, roundQuantity((map.get(i.id) || 0) + baseQtyOf(i))));
    return map;
  }, [cart]);
  const cartSubtotal = roundMoney(cart.reduce((sum, item) => sum + item.price * item.qty, 0));

  // Descuento sobre el total: se calcula igual que en el servidor, que es quien valida el tope.
  const isAdmin = currentUser.role === 'ADMINISTRADOR';
  const canDiscount = isAdmin || maxDiscountPercent > 0;
  const discountNumber = Number(discountValue) || 0;
  const discountAmount = discountNumber > 0
    ? roundMoney(discountType === 'PERCENT' ? cartSubtotal * discountNumber / 100 : discountNumber)
    : 0;
  const discountError = (() => {
    if (discountValue === '') return '';
    if (!Number.isFinite(Number(discountValue)) || Number(discountValue) < 0) return 'Ingrese un valor válido.';
    if (discountType === 'PERCENT' && discountNumber > 100) return 'No puede superar el 100 %.';
    if (discountAmount > 0 && discountAmount >= cartSubtotal) return 'No puede cubrir todo el total.';
    if (!isAdmin && discountAmount > roundMoney(cartSubtotal * maxDiscountPercent / 100)) {
      return `Su descuento máximo es ${maxDiscountPercent} %.`;
    }
    return '';
  })();
  const appliedDiscount = discountError ? 0 : discountAmount;
  const discountPayload = appliedDiscount > 0 ? { type: discountType, value: discountNumber } : null;
  const cartTotal = roundMoney(cartSubtotal - appliedDiscount);
  // Cantidad de líneas: sumar metros con unidades no tiene sentido.
  const cartUnits = cart.length;
  const cajaCerrada = isDirect && estadoCaja !== null && !estadoCaja.abierta;
  const selectedCustomer = findCustomerByInput(clients, customerInput);
  const isWholesale = selectedCustomer?.priceList === 'WHOLESALE';

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

  // ---------- Carrito ----------

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
  const addToCart = (product: Product, unit?: SaleUnit | null) => {
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
      unit: unit?.name ?? product.unit, allowsFractions: unit ? unit.allowsFractions : product.allowsFractions,
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

  const setCartQty = (key: string, qty: number) => {
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

  const removeFromCart = (key: string) => setCart(prev => prev.filter(item => item.key !== key));

  const clearCart = async () => {
    if (cart.length === 0) return;
    const seguro = await confirmar({
      title: 'Vaciar la venta',
      description: 'Se quitarán todos los productos del carrito.',
      confirmText: 'Vaciar',
      tone: 'danger',
    });
    if (seguro) setCart([]);
  };

  const clearDiscount = () => {
    setShowDiscount(false);
    setDiscountValue('');
  };

  // Con el carrito vacío el descuento ya no tiene sobre qué aplicarse.
  useEffect(() => {
    if (cart.length === 0) clearDiscount();
  }, [cart.length]);

  const resetSale = () => {
    setCart([]);
    setLoadedQuote(null);
    setCustomerInput('');
    setCustomerError('');
  };

  // Producto (y presentación, si el código es de una) con ese código exacto.
  const findByCode = (code: string): { product: Product; unit: SaleUnit | undefined } | null => {
    const q = code.trim().toLowerCase();
    const product = products.find(p => p.code.toLowerCase() === q);
    if (product) return { product, unit: undefined };
    for (const p of products) {
      const unit = p.saleUnits.find(u => u.code && u.code.toLowerCase() === q);
      if (unit) return { product: p, unit };
    }
    return null;
  };

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearch('');
      return;
    }
    if (e.key !== 'Enter') return;

    const q = search.trim().toLowerCase();
    if (!q) return;
    // Enter agrega por código exacto (lector de barras, también el de una presentación) o el único
    // resultado de la búsqueda.
    const byCode = findByCode(q);
    const candidate = byCode?.product ?? (filteredProducts.length === 1 ? filteredProducts[0] : undefined);

    if (candidate) {
      addToCart(candidate, byCode ? byCode.unit : undefined);
      setSearch('');
    } else if (filteredProducts.length === 0) {
      aviso.error('No se encontró ningún producto con ese código o nombre.');
    }
  };

  // Código leído con la cámara o el lector: si coincide con un producto se agrega; si no, se busca.
  const handleScanned = (code: string) => {
    const found = findByCode(code);
    if (found) {
      addToCart(found.product, found.unit);
      setSearch('');
    } else {
      setSearch(code);
      aviso.error(`No hay un producto con el código ${code}.`);
    }
  };

  // Si el servidor rechaza porque los precios cambiaron, el carrito se actualiza con los reales.
  const applyServerPrices = (err: ApiError) => {
    const data = err.data as Partial<PricesChanged> | null;
    const serverPrices = new Map((data?.precios ?? []).map(p => [lineKey(p.id, p.unitId), p.price]));
    setCart(prev => prev.map(item => {
      const price = serverPrices.get(item.key);
      return price === undefined ? item : { ...item, price };
    }));
    queryClient.invalidateQueries({ queryKey: queryKeys.products });
  };
  const pricesChanged = (err: unknown): err is ApiError => err instanceof ApiError && err.codigo === 'PRECIOS_CAMBIARON';

  const validateTypedCustomer = () => {
    if (customerInput.trim() && !selectedCustomer) {
      setCustomerError('Cliente no registrado. Selecciónelo de la lista o borre el campo.');
      customerPanelRef.current?.focus();
      return false;
    }
    return true;
  };

  const print = (ticket: TicketData) => {
    if (!onTriggerPrint) return;
    onTriggerPrint(ticket);
    setTimeout(() => window.print(), 300);
  };

  // ---------- Modo directo: cobro en el POS ----------

  const openCheckout = () => {
    if (cart.length === 0 || processing || !validateTypedCustomer()) return;
    setShowCheckout(true);
  };

  const confirmDirectSale = async (payment: CheckoutPayment) => {
    // El turno se confirma con el servidor justo antes de cobrar (pudo cerrarse en otra pantalla).
    const caja = await queryClient.fetchQuery({ queryKey: queryKeys.cashStatus, queryFn: fetchCashStatus, staleTime: 0 }).catch(() => null);
    if (!caja) throw new Error('No se pudo verificar el estado de la caja. Revise su conexión e intente nuevamente.');
    if (!caja.abierta) throw new Error('No está en un turno de caja. Abra una caja o únase a un turno en "Arqueo de Caja" para poder cobrar.');

    let res: DirectSaleSaved;
    try {
      res = await api.post<DirectSaleSaved>('/ventas', {
        docType: payment.docType,
        payMethod: payment.payMethod,
        mixCash: payment.mixCash,
        mixDigital: payment.mixDigital,
        payCode: payment.payCode,
        clienteId: payment.customer ? payment.customer.id : null,
        vendedorId: currentUser.id,
        cotizacionId: loadedQuote ? loadedQuote.id : null,
        totalEsperado: cartTotal,
        discount: discountPayload,
        cart: cartPayload(cart),
        delivery: payment.delivery,
      } satisfies DirectSaleRequest);
    } catch (err) {
      if (pricesChanged(err)) {
        applyServerPrices(err);
        throw new Error(`${err.message} Ya se actualizaron los precios; verifique el nuevo total y confirme otra vez.`);
      }
      throw err;
    }

    // La pantalla de Caja (si sigue abierta en otra parte del sistema) se actualiza con la venta.
    window.dispatchEvent(new Event('venta-registrada'));
    const sale = res.venta;
    print(buildSaleTicket({ ...payment, numDoc: sale.numDoc ?? '', items: sale.items, total: sale.total, discount: sale.discount, sellerName: currentUser.name }));

    setSuccess({
      icon: 'fa-check',
      title: 'Venta registrada',
      subtitle: `${sale.numDoc} · ${payment.customer ? payment.customer.name : payment.customerName || 'Público General'}`,
      rows: [
        ...(sale.discount > 0 ? [{ label: 'Descuento aplicado', value: `− ${formatSoles(sale.discount)}` }] : []),
        { label: `Total (${payment.payMethod})`, value: formatSoles(sale.total) },
        ...(sale.delivery ? [{ label: 'Envío programado', value: sale.delivery.ref }] : []),
      ],
      change: payment.receivedCash !== null ? payment.receivedCash - sale.total : null,
      buttonLabel: 'Nueva venta',
    });
    setShowCheckout(false);
    resetSale();
    refreshAfterSale();
  };

  // ---------- Modo con pedidos: el vendedor envía el pedido a caja ----------

  const sendToCashier = async () => {
    if (cart.length === 0 || processing || !validateTypedCustomer()) return;
    try {
      setProcessing(true);
      const res = await api.post<OrderSaved>('/pedidos', {
        cart: cartPayload(cart),
        clienteId: selectedCustomer ? selectedCustomer.id : null,
        cotizacionId: loadedQuote ? loadedQuote.id : null,
        totalEsperado: cartTotal,
        discount: discountPayload,
      } satisfies OrderRequest);
      // El comprobante se emite e imprime recién en caja, al cobrar; aquí solo se da el número de pedido.
      const order = res.pedido;
      setSuccess({
        icon: 'fa-paper-plane',
        title: 'Pedido enviado a caja',
        highlight: `N° ${order.id}`,
        subtitle: 'Indique al cliente que pase a caja con este número.',
        rows: [{ label: `${order.items.length} producto(s)`, value: formatSoles(order.total) }],
        buttonLabel: 'Nuevo pedido',
      });
      resetSale();
      // El pedido reserva stock y aparece en la cola de caja.
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    } catch (err) {
      if (pricesChanged(err)) {
        applyServerPrices(err);
        aviso.error('Los precios cambiaron: se actualizó el carrito. Revise el total y envíe otra vez.');
      } else {
        aviso.error((err as Error).message || 'No se pudo enviar el pedido.');
      }
    } finally {
      setProcessing(false);
    }
  };

  const primaryAction = isDirect ? openCheckout : sendToCashier;

  const closeSuccess = () => {
    setSuccess(null);
    searchRef.current?.focus();
  };

  // ---------- Cotizaciones ----------

  const handleCreateQuote = async () => {
    if (cart.length === 0 || processing || !validateTypedCustomer()) return;
    try {
      setProcessing(true);
      const res = await api.post<QuoteSaved>('/cotizaciones', {
        clienteId: selectedCustomer ? selectedCustomer.id : null,
        validDays: 7,
        cart: cartPayload(cart),
      } satisfies QuoteRequest);
      if (!res.success || !res.cotizacion) return;

      print({
        docTitle: 'PROFORMA / COTIZACIÓN',
        numDoc: res.cotizacion.numDoc,
        dateStr: new Date().toLocaleString('es-PE'),
        customerName: selectedCustomer ? selectedCustomer.name : 'Público General',
        customerDoc: selectedCustomer ? selectedCustomer.doc : '00000000',
        docLabelTitle: selectedCustomer ? (selectedCustomer.type === 'EMPRESA' ? 'RUC' : 'DNI') : 'DNI',
        sellerName: currentUser.name || 'General',
        payMethod: 'COTIZACIÓN (Válido 7 días)',
        items: res.cotizacion.detalles.map(d => ({ name: d.producto.name, unitName: d.unitName, qty: d.quantity, price: d.unitPrice })),
        total: res.cotizacion.total,
        isFiscal: false,
      });

      aviso.exito(`Cotización ${res.cotizacion.numDoc} guardada.`);
      setCart([]);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes });
    } catch (err) {
      aviso.error(`Error creando cotización: ${(err as Error).message}`);
    } finally {
      setProcessing(false);
    }
  };

  const openQuotesModal = async () => {
    try {
      setProcessing(true);
      const quotes = await queryClient.fetchQuery({ queryKey: queryKeys.quotes, queryFn: fetchQuotes, staleTime: 0 });
      setPendingQuotes(quotes.filter(c => c.status === 'PENDIENTE'));
    } catch (err) {
      aviso.error(`Error al obtener cotizaciones: ${(err as Error).message}`);
    } finally {
      setProcessing(false);
    }
  };

  const loadQuote = async (quote: Quote) => {
    if (cart.length > 0) {
      const seguro = await confirmar({
        title: 'Cargar la cotización',
        description: 'Se reemplazarán los productos de la venta actual.',
        confirmText: 'Cargar',
      });
      if (!seguro) return;
    }

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
      };
    }));
    setLoadedQuote({ id: quote.id, numDoc: quote.numDoc });
    setCustomerInput(quote.clienteId ? `${quote.customerDoc} - ${quote.customer}` : '');
    setPendingQuotes(null);
    aviso.exito(`Cotización ${quote.numDoc} cargada. Revise y ${isDirect ? 'cobre la venta' : 'envíela a caja'}.`);
  };

  // ---------- Atajos de teclado ----------

  const shortcutsRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutsRef.current = (e: KeyboardEvent) => {
    if (showCheckout || showScanner || unitChoice) return; // Esas ventanas manejan sus propias teclas.
    if (e.key === 'F2') {
      e.preventDefault();
      searchRef.current?.focus();
    } else if (e.key === 'F9') {
      e.preventDefault();
      if (!success && !pendingQuotes && !cajaCerrada) primaryAction();
    } else if (e.key === 'Escape') {
      if (success) closeSuccess();
      else if (pendingQuotes) setPendingQuotes(null);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => shortcutsRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ---------- Render ----------

  return (
    <div className="tab-content active h-full flex flex-col p-3 sm:p-4 pb-24 xl:pb-4 overflow-y-auto xl:overflow-hidden">
      <div className="flex-1 flex flex-col xl:flex-row gap-4 xl:overflow-hidden xl:min-h-0">

        {/* ===== CATÁLOGO ===== */}
        <div className="flex-1 flex flex-col bg-surface rounded-xl shadow-sm border border-line xl:h-full xl:overflow-hidden min-w-0">
          <div className="p-3 sm:p-4 border-b border-line flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <i className="fa-solid fa-barcode absolute left-3 top-1/2 -translate-y-1/2 text-muted"></i>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Escanee o busque por código o nombre…"
                  className="w-full pl-10 pr-20 py-2.5 border border-line rounded-lg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 text-sm transition"
                />
                {search ? (
                  <button
                    onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-danger p-1"
                    title="Limpiar búsqueda"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                ) : (
                  <kbd className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted border border-line rounded px-1.5 py-0.5">F2</kbd>
                )}
              </div>
              <div className="flex gap-2">
              <button
                onClick={() => setShowScanner(true)}
                className="flex-1 sm:flex-none bg-surface border border-line hover:bg-surface-muted text-ink-soft font-bold px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shrink-0"
                title="Escanear código de barras con la cámara o el lector"
              >
                <i className="fa-solid fa-barcode text-brand"></i> Escanear
              </button>
              <button
                onClick={openQuotesModal}
                disabled={processing}
                className="flex-1 sm:flex-none bg-surface border border-line hover:bg-surface-muted text-ink-soft font-bold px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
              >
                <i className="fa-solid fa-file-import text-brand"></i> Cargar cotización
              </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 whitespace-nowrap border transition-colors ${
                    selectedCategory === cat
                      ? 'bg-brand text-brand-contrast border-brand'
                      : 'bg-surface text-ink-soft border-line hover:bg-surface-muted'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 p-3 sm:p-4 xl:overflow-y-auto bg-surface-muted/60">
            <p className="text-xs text-muted mb-3">
              {filteredProducts.length} producto{filteredProducts.length === 1 ? '' : 's'}
              {search && <> para “<strong className="text-ink-soft">{search}</strong>”</>}
              {selectedCategory !== 'Todas' && <> en <strong className="text-ink-soft">{selectedCategory}</strong></>}
            </p>

            {productsQuery.isPending ? (
              <SkeletonCards count={8} />
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-16 text-muted">
                <i className="fa-solid fa-magnifying-glass text-3xl mb-3 text-muted"></i>
                <p className="text-sm font-semibold">No hay productos que coincidan</p>
                {(search || selectedCategory !== 'Todas') && (
                  <button
                    onClick={() => { setSearch(''); setSelectedCategory('Todas'); }}
                    className="mt-3 text-xs font-bold text-brand hover:underline"
                  >
                    Quitar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {filteredProducts.map(product => {
                  const available = availableStock(product);
                  const soldOut = available <= 0;
                  const lowStock = !soldOut && available <= (product.minStock || 10);
                  const inCart = qtyInCart.get(product.id) || 0;

                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={soldOut}
                      className={`relative text-left p-3 rounded-xl border bg-surface transition-all flex flex-col gap-1.5 min-h-[118px] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                        inCart > 0 ? 'border-brand ring-1 ring-brand/30' : 'border-line hover:border-brand hover:shadow-md'
                      }`}
                    >
                      {inCart > 0 && (
                        <span className="absolute top-2 right-2 bg-brand text-brand-contrast text-[11px] font-black rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center shadow">
                          {inCart}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-muted truncate pr-7">{product.code}</span>
                      <h4 className="font-semibold text-ink text-sm leading-snug line-clamp-2 flex-1">{product.name}</h4>
                      {product.saleUnits.length > 0 && (
                        <span className="text-[10px] font-semibold text-brand-text truncate">
                          <i className="fa-solid fa-layer-group mr-1"></i>
                          {product.unit}, {product.saleUnits.map(u => u.name).join(', ')}
                        </span>
                      )}
                      <div className="flex items-end justify-between gap-2">
                        <span className="text-base font-black text-ink">
                          {formatSoles(priceFor(product, isWholesale))}
                          {isWholesale && product.wholesalePrice != null && (
                            <span className="block text-[9px] font-bold text-info uppercase">Mayorista</span>
                          )}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                            soldOut ? 'bg-surface-muted text-muted' : lowStock ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
                          }`}
                          title={product.reserved > 0 ? `${product.reserved} reservado(s) para pedidos` : undefined}
                        >
                          {soldOut ? 'Agotado' : `${formatQuantity(available)} ${stockUnitLabel(product.unit)}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ===== VENTA ACTUAL ===== */}
        <div
          ref={cartRef}
          className="w-full xl:w-[420px] flex flex-col bg-surface rounded-xl shadow-sm border border-line xl:h-full xl:overflow-hidden shrink-0"
        >
          <div className="px-4 py-3 border-b border-line flex justify-between items-center">
            <h3 className="font-bold text-ink flex items-center gap-2">
              <i className="fa-solid fa-cart-shopping text-brand"></i> {isDirect ? 'Venta actual' : 'Pedido actual'}
              {cart.length > 0 && (
                <span className="bg-surface-muted text-ink-soft text-xs font-bold px-2 py-0.5 rounded-full">{cartUnits} prod.</span>
              )}
            </h3>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs font-semibold text-muted hover:text-danger transition-colors">
                <i className="fa-solid fa-trash-can mr-1"></i> Vaciar
              </button>
            )}
          </div>

          {cajaCerrada && (
            <div className="px-4 py-2.5 bg-danger-soft border-b border-danger/30 text-xs text-danger flex items-center gap-2">
              <i className="fa-solid fa-lock"></i>
              <span><strong>Sin turno de caja.</strong> Abra una caja o únase a un turno en "Arqueo de Caja" para poder cobrar.</span>
            </div>
          )}

          {isWholesale && !loadedQuote && selectedCustomer && (
            <div className="px-4 py-2 bg-info-soft border-b border-info/30 text-xs text-info">
              <i className="fa-solid fa-tags mr-1.5"></i>
              <strong>Precios mayoristas</strong> de {selectedCustomer.name}.
            </div>
          )}

          {loadedQuote && (
            <div className="px-4 py-2 bg-warning-soft border-b border-warning/30 text-xs text-warning flex justify-between items-center gap-2">
              <span>
                <i className="fa-solid fa-file-invoice mr-1.5"></i>
                Desde la cotización <strong>{loadedQuote.numDoc}</strong>
              </span>
              <button
                onClick={() => setLoadedQuote(null)}
                className="text-warning hover:text-danger font-bold shrink-0 underline"
                title="Se registrará como venta normal y la cotización seguirá pendiente"
              >
                Desvincular
              </button>
            </div>
          )}

          <div className="flex-1 xl:overflow-y-auto px-4 min-h-[140px]">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted py-10">
                <i className="fa-solid fa-basket-shopping text-4xl mb-3 text-nav-ink"></i>
                <p className="text-sm font-semibold text-muted">Aún no hay productos</p>
                <p className="text-xs mt-1">Toque un producto del catálogo o escanee su código.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {cart.map(item => (
                  <li key={item.key} className="py-3 flex gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink leading-snug line-clamp-2">{item.name}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {formatSoles(item.price)} {perUnitLabel(item.unit)}
                        {item.unitName && (
                          <span className="ml-1 text-[10px] font-bold text-brand-text bg-brand-soft rounded px-1 py-0.5">
                            {item.unitName} · {formatQuantity(item.factor)} u.
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-sm font-black text-ink tabular-nums">{formatSoles(item.price * item.qty)}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCartQty(item.key, roundQuantity(item.qty - 1))}
                          disabled={item.qty <= 1}
                          className="w-7 h-7 rounded-md bg-surface-muted hover:bg-surface-muted text-ink-soft font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Quitar uno"
                        >
                          −
                        </button>
                        <CartQtyInput item={item} onCommit={qty => setCartQty(item.key, qty)} />
                        <button
                          onClick={() => setCartQty(item.key, roundQuantity(item.qty + 1))}
                          className="w-7 h-7 rounded-md bg-surface-muted hover:bg-surface-muted text-ink-soft font-bold"
                          title="Agregar uno"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeFromCart(item.key)}
                          className="w-7 h-7 rounded-md text-muted hover:text-danger hover:bg-danger-soft ml-1"
                          title="Eliminar producto"
                        >
                          <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div ref={cartActionsRef} className="border-t border-line bg-surface-muted p-4 flex flex-col gap-3 shrink-0">
            <div>
              <label className="text-[11px] font-bold text-muted uppercase tracking-wide mb-1 block">
                Cliente {!isDirect && <span className="normal-case font-normal">(opcional, también se puede elegir en caja)</span>}
              </label>
              <CustomerSelector
                clients={clients}
                value={customerInput}
                onChange={v => { setCustomerInput(v); setCustomerError(''); }}
                customer={selectedCustomer}
                error={customerError}
                inputRef={customerPanelRef}
              />
            </div>

            {canDiscount && cart.length > 0 && !showDiscount && (
              <button
                type="button"
                onClick={() => setShowDiscount(true)}
                className="self-start text-xs font-semibold text-brand-text hover:text-brand-text hover:underline"
              >
                <i className="fa-solid fa-percent mr-1.5"></i> Aplicar descuento
              </button>
            )}

            {canDiscount && cart.length > 0 && showDiscount && (
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Descuento</span>
                  <div className="flex rounded-md border border-line overflow-hidden text-xs font-bold">
                    {([['PERCENT', '%'], ['AMOUNT', 'S/']] as const).map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setDiscountType(type)}
                        className={`px-2.5 py-1 ${discountType === type ? 'bg-panel text-white' : 'bg-surface text-ink-soft hover:bg-surface-muted'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    autoFocus
                    value={discountValue}
                    onChange={e => setDiscountValue(e.target.value)}
                    placeholder="0"
                    className={`w-20 px-2 py-1 border rounded-md text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand ${discountError ? 'border-danger' : 'border-line'}`}
                  />
                  <button type="button" onClick={clearDiscount} title="Quitar descuento" className="ml-auto text-muted hover:text-danger px-1">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
                {discountError
                  ? <p className="text-xs text-danger mt-1">{discountError}</p>
                  : !isAdmin && <p className="text-[11px] text-muted mt-1">Hasta {maxDiscountPercent} % del total.</p>}
              </div>
            )}

            {appliedDiscount > 0 && (
              <div className="text-sm text-muted flex flex-col gap-0.5">
                <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatSoles(cartSubtotal)}</span></div>
                <div className="flex justify-between text-success font-semibold">
                  <span>Descuento</span><span className="tabular-nums">− {formatSoles(appliedDiscount)}</span>
                </div>
              </div>
            )}

            <div className="flex justify-between items-end">
              <span className="text-sm text-muted">Total</span>
              <span className="text-3xl font-black text-ink tabular-nums">{formatSoles(cartTotal)}</span>
            </div>

            <button
              onClick={primaryAction}
              disabled={processing || cart.length === 0 || cajaCerrada || Boolean(discountError)}
              className="w-full bg-brand hover:bg-brand-strong text-brand-contrast font-bold py-3.5 rounded-lg shadow-md transition-colors text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {processing && !isDirect
                ? <><i className="fa-solid fa-spinner fa-spin"></i> Enviando…</>
                : <><i className={`fa-solid ${isDirect ? 'fa-cash-register' : 'fa-paper-plane'}`}></i> {isDirect ? 'Cobrar' : 'Enviar a caja'}</>}
              <kbd className="hidden sm:inline text-[10px] font-bold bg-brand-strong/60 rounded px-1.5 py-0.5">F9</kbd>
            </button>

            <button
              onClick={handleCreateQuote}
              disabled={processing || cart.length === 0}
              className="w-full bg-surface border border-line hover:bg-surface-muted text-ink-soft font-semibold py-2 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fa-solid fa-file-pdf mr-1.5 text-muted"></i> Guardar como cotización
            </button>
          </div>
        </div>
      </div>

      {/* Barra inferior en móvil/tablet para llegar al carrito */}
      {cart.length > 0 && !showCheckout && !cartActionsVisible && (
        <div className="xl:hidden fixed bottom-0 inset-x-0 lg:left-64 z-20 p-3 bg-surface/95 backdrop-blur border-t border-line shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <button
            onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="w-full bg-panel text-white rounded-lg py-3 px-4 flex justify-between items-center font-bold"
          >
            <span className="flex items-center gap-2 text-sm">
              <i className="fa-solid fa-cart-shopping text-brand"></i> Ver {isDirect ? 'venta' : 'pedido'} ({cartUnits})
            </span>
            <span className="text-lg text-brand tabular-nums">{formatSoles(cartTotal)}</span>
          </button>
        </div>
      )}

      {showCheckout && (
        <CheckoutModal
          total={cartTotal}
          units={cartUnits}
          clients={clients}
          customerInput={customerInput}
          onCustomerInputChange={setCustomerInput}
          onClose={() => setShowCheckout(false)}
          onConfirm={confirmDirectSale}
          allowDelivery={deliveriesEnabled}
        />
      )}

      {success && <SaleSuccessModal {...success} onClose={closeSuccess} />}

      <BarcodeScannerModal open={showScanner} onClose={() => setShowScanner(false)} onDetected={handleScanned} />

      <UnitChoiceModal
        product={unitChoice}
        inCart={unitChoice ? qtyInCart.get(unitChoice.id) || 0 : 0}
        wholesale={isWholesale}
        onClose={() => setUnitChoice(null)}
        onChoose={(product, unit) => { setUnitChoice(null); addToCart(product, unit); }}
      />

      {pendingQuotes && (
        <QuotePickerModal quotes={pendingQuotes} onClose={() => setPendingQuotes(null)} onLoad={loadQuote} />
      )}
    </div>
  );
}
