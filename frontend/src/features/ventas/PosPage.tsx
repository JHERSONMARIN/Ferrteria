// Vender: catálogo a la izquierda y la venta (o el pedido, si la sucursal trabaja con caja separada) a la derecha.
// Esta pantalla coordina: el carrito, la búsqueda y el descuento viven en hooks/, y cada panel en components/.
import { useState, useEffect, useRef, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Product } from '@ferresys/contracts/catalog';
import type { SaleFlowMode, SessionUser } from '@ferresys/contracts/identity';
import type {
  DirectSaleRequest, DirectSaleSaved, OrderRequest, OrderSaved, Quote, QuoteRequest, QuoteSaved,
} from '@ferresys/contracts/sales';
import { api, ApiError } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { fetchCashStatus, useCashStatus, useCategories, useCustomers, useProducts } from '../../api/queries.ts';
import BarcodeScannerModal from '../../shared/scanner/BarcodeScannerModal.tsx';
import { formatSoles } from '../../shared/utils/currency.ts';
import { findCustomerByInput } from '../../shared/utils/customers.ts';
import { buildSaleTicket, type TicketData } from '../../shared/utils/tickets.ts';
import { roundMoney } from '../../shared/utils/quantities.ts';
import { useToast, useConfirm } from '../../shared/ui/index.ts';
import FieldError from '../../shared/ui/FieldError.tsx';
import { useIndustryUi } from '../../industries/index.ts';
import CustomerSelector from './components/CustomerSelector.tsx';
import CheckoutModal, { type CheckoutPayment } from './components/CheckoutModal.tsx';
import SaleSuccessModal, { type SaleSuccess } from './components/SaleSuccessModal.tsx';
import UnitChoiceModal from './components/UnitChoiceModal.tsx';
import QuotePickerModal from './components/QuotePickerModal.tsx';
import ProductCatalog from './components/ProductCatalog.tsx';
import CartPanel from './components/CartPanel.tsx';
import { useCatalogSearch } from './hooks/useCatalogSearch.ts';
import { usePosCart } from './hooks/usePosCart.ts';
import { useSaleDiscount } from './hooks/useSaleDiscount.ts';
import { cartPayload } from './cart.ts';
import { fetchQuotes } from './queries.ts';

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
  const dbCategories = useCategories().data ?? [];
  // En modo directo se cobra aquí: hace falta estar en un turno de caja.
  const estadoCaja = useCashStatus(isDirect).data ?? null;
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (productsQuery.error) aviso.error(`Error cargando datos del Punto de Venta: ${productsQuery.error.message}`);
  }, [productsQuery.error, aviso]);

  const [customerInput, setCustomerInput] = useState('');
  const [customerError, setCustomerError] = useState('');
  const selectedCustomer = findCustomerByInput(clients, customerInput);
  const isWholesale = selectedCustomer?.priceList === 'WHOLESALE';

  const catalog = useCatalogSearch(products, dbCategories);
  const cart = usePosCart(products, isWholesale);
  const discount = useSaleDiscount(cart.subtotal, currentUser.role === 'ADMINISTRADOR', maxDiscountPercent);
  const cartTotal = roundMoney(cart.subtotal - discount.applied);
  // Cantidad de líneas: sumar metros con unidades no tiene sentido.
  const cartUnits = cart.cart.length;
  const cajaCerrada = isDirect && estadoCaja !== null && !estadoCaja.abierta;

  const [showCheckout, setShowCheckout] = useState(false);
  const [success, setSuccess] = useState<SaleSuccess | null>(null);
  const [pendingQuotes, setPendingQuotes] = useState<Quote[] | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const customerPanelRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  const cartActionsRef = useRef<HTMLDivElement>(null);
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

  // Con el carrito vacío el descuento ya no tiene sobre qué aplicarse.
  useEffect(() => {
    if (cart.cart.length === 0) discount.clear();
  }, [cart.cart.length]);

  // Después de vender cambian el stock, la deuda del cliente (fiado) y la caja.
  const refreshAfterSale = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.products });
    queryClient.invalidateQueries({ queryKey: queryKeys.customers });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashStatus });
  };

  // Datos del rubro de la venta (farmacia: la receta), solo si los productos del carrito los piden.
  const { sale: saleUi } = useIndustryUi();
  const [saleData, setSaleData] = useState<Record<string, unknown>>({});
  const [saleDataError, setSaleDataError] = useState('');
  const cartProducts = useMemo(
    () => products.filter(p => cart.cart.some(item => item.id === p.id)),
    [cart.cart, products],
  );
  const saleNeedsData = Boolean(saleUi?.needs(cartProducts));
  const validateSaleData = () => {
    const problem = saleNeedsData ? saleUi?.problem(saleData, cartProducts) ?? null : null;
    setSaleDataError(problem ?? '');
    return !problem;
  };
  const saleDataPayload = saleNeedsData ? { industryData: saleData } : {};

  const resetSale = () => {
    cart.clear();
    setSaleData({});
    setSaleDataError('');
    setCustomerInput('');
    setCustomerError('');
  };

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      catalog.setSearch('');
      return;
    }
    if (e.key !== 'Enter') return;

    const q = catalog.search.trim().toLowerCase();
    if (!q) return;
    // Enter agrega por código exacto (lector de barras, también el de una presentación) o el único
    // resultado de la búsqueda.
    const byCode = catalog.findByCode(q);
    const candidate = byCode?.product ?? (catalog.filteredProducts.length === 1 ? catalog.filteredProducts[0] : undefined);

    if (candidate) {
      cart.add(candidate, byCode ? byCode.unit : undefined);
      catalog.setSearch('');
    } else if (catalog.filteredProducts.length === 0) {
      aviso.error('No se encontró ningún producto con ese código o nombre.');
    }
  };

  // Código leído con la cámara o el lector: si coincide con un producto se agrega; si no, se busca.
  const handleScanned = (code: string) => {
    const found = catalog.findByCode(code);
    if (found) {
      cart.add(found.product, found.unit);
      catalog.setSearch('');
    } else {
      catalog.setSearch(code);
      aviso.error(`No hay un producto con el código ${code}.`);
    }
  };

  // Si el servidor rechaza porque los precios cambiaron, el carrito se actualiza con los reales.
  const pricesChanged = (err: unknown): err is ApiError => err instanceof ApiError && err.codigo === 'PRECIOS_CAMBIARON';
  const applyServerPrices = (err: ApiError) => {
    cart.applyServerPrices(err);
    queryClient.invalidateQueries({ queryKey: queryKeys.products });
  };

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
    if (cart.cart.length === 0 || processing || !validateTypedCustomer() || !validateSaleData()) return;
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
        cotizacionId: cart.loadedQuote ? cart.loadedQuote.id : null,
        totalEsperado: cartTotal,
        discount: discount.payload,
        cart: cartPayload(cart.cart),
        delivery: payment.delivery,
        ...saleDataPayload,
      } satisfies DirectSaleRequest);
    } catch (err) {
      if (pricesChanged(err)) {
        applyServerPrices(err);
        throw new Error(`${err.message} Ya se actualizaron los precios; verifique el nuevo total y confirme otra vez.`);
      }
      throw err;
    }

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
    if (cart.cart.length === 0 || processing || !validateTypedCustomer() || !validateSaleData()) return;
    try {
      setProcessing(true);
      const res = await api.post<OrderSaved>('/pedidos', {
        cart: cartPayload(cart.cart),
        clienteId: selectedCustomer ? selectedCustomer.id : null,
        cotizacionId: cart.loadedQuote ? cart.loadedQuote.id : null,
        totalEsperado: cartTotal,
        discount: discount.payload,
        ...saleDataPayload,
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
    if (cart.cart.length === 0 || processing || !validateTypedCustomer()) return;
    try {
      setProcessing(true);
      const res = await api.post<QuoteSaved>('/cotizaciones', {
        clienteId: selectedCustomer ? selectedCustomer.id : null,
        validDays: 7,
        cart: cartPayload(cart.cart),
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
      cart.clear();
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
    if (cart.cart.length > 0) {
      const seguro = await confirmar({
        title: 'Cargar la cotización',
        description: 'Se reemplazarán los productos de la venta actual.',
        confirmText: 'Cargar',
      });
      if (!seguro) return;
    }
    cart.loadQuote(quote);
    setCustomerInput(quote.clienteId ? `${quote.customerDoc} - ${quote.customer}` : '');
    setPendingQuotes(null);
    aviso.exito(`Cotización ${quote.numDoc} cargada. Revise y ${isDirect ? 'cobre la venta' : 'envíela a caja'}.`);
  };

  // ---------- Atajos de teclado ----------

  const shortcutsRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutsRef.current = (e: KeyboardEvent) => {
    if (showCheckout || showScanner || cart.unitChoice) return; // Esas ventanas manejan sus propias teclas.
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
        <ProductCatalog
          catalog={catalog}
          loading={productsQuery.isPending}
          searchRef={searchRef}
          onSearchKeyDown={handleSearchKeyDown}
          qtyInCart={cart.qtyInCart}
          isWholesale={isWholesale}
          busy={processing}
          onAdd={product => cart.add(product)}
          onScan={() => setShowScanner(true)}
          onOpenQuotes={openQuotesModal}
        />

        <CartPanel
          cart={cart}
          discount={discount}
          total={cartTotal}
          isDirect={isDirect}
          cashClosed={cajaCerrada}
          processing={processing}
          wholesaleCustomer={isWholesale && selectedCustomer ? selectedCustomer.name : null}
          panelRef={cartRef}
          actionsRef={cartActionsRef}
          onPrimary={primaryAction}
          onQuote={handleCreateQuote}
        >
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

          {saleNeedsData && saleUi && (
            <div>
              <saleUi.Fields value={saleData} products={cartProducts} onChange={v => { setSaleData(v); setSaleDataError(''); }} />
              <FieldError msg={saleDataError} />
            </div>
          )}
        </CartPanel>
      </div>

      {/* Barra inferior en móvil/tablet para llegar al carrito */}
      {cartUnits > 0 && !showCheckout && !cartActionsVisible && (
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
        product={cart.unitChoice}
        inCart={cart.unitChoice ? cart.qtyInCart.get(cart.unitChoice.id) || 0 : 0}
        wholesale={isWholesale}
        onClose={cart.closeUnitChoice}
        onChoose={(product, unit) => { cart.closeUnitChoice(); cart.add(product, unit); }}
      />

      {pendingQuotes && (
        <QuotePickerModal quotes={pendingQuotes} onClose={() => setPendingQuotes(null)} onLoad={loadQuote} />
      )}
    </div>
  );
}
