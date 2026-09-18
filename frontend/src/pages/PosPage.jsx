import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';

const COMPROBANTES = [
  { id: 'Nota de Venta', icon: 'fa-receipt', ayuda: 'Sin datos' },
  { id: 'Boleta', icon: 'fa-file-lines', ayuda: 'Con DNI' },
  { id: 'Factura', icon: 'fa-file-invoice-dollar', ayuda: 'Con RUC' },
];

const METODOS_PAGO = [
  { id: 'Efectivo', label: 'Efectivo', icon: 'fa-money-bill-wave' },
  { id: 'Tarjeta', label: 'Tarjeta', icon: 'fa-credit-card' },
  { id: 'Yape/Plin', label: 'Yape / Plin', icon: 'fa-mobile-screen' },
  { id: 'Transferencia', label: 'Transferencia', icon: 'fa-building-columns' },
  { id: 'Pago Mixto', label: 'Mixto', icon: 'fa-shuffle' },
  { id: 'Fiado', label: 'Fiado', icon: 'fa-book' },
];

const soles = (n) => `S/ ${Number(n || 0).toFixed(2)}`;

function ClienteSelector({ value, onChange, cliente, error, inputRef }) {
  const escrito = value.trim() !== '';
  return (
    <div>
      <div className="relative">
        <i className="fa-solid fa-user absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input
          ref={inputRef}
          list="pos-customer-list"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Público general · buscar DNI/RUC o nombre"
          className={`w-full pl-8 pr-8 py-2 border rounded-lg outline-none text-sm bg-white transition-colors focus:border-orange-500 ${
            error ? 'border-red-400' : 'border-gray-300'
          }`}
        />
        {escrito && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 p-1"
            title="Quitar cliente"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>
      {error ? (
        <FieldError msg={error} />
      ) : cliente ? (
        <p className="mt-1 text-xs text-emerald-700 font-semibold truncate">
          <i className="fa-solid fa-circle-check mr-1"></i>
          {cliente.name} · {cliente.type === 'EMPRESA' ? 'RUC' : 'DNI'} {cliente.doc}
        </p>
      ) : escrito ? (
        <p className="mt-1 text-xs text-amber-600">
          <i className="fa-solid fa-circle-info mr-1"></i> Seleccione un cliente de la lista
        </p>
      ) : null}
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <section>
      <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">{titulo}</h4>
      {children}
    </section>
  );
}

export default function PosPage({ currentUser, onTriggerPrint }) {
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [procesando, setProcesando] = useState(false);

  // Catálogo
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');

  // Venta
  const [cart, setCart] = useState([]);
  const [customerInput, setCustomerInput] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [estadoCaja, setEstadoCaja] = useState(null);
  const [cotizacionCargada, setCotizacionCargada] = useState(null);

  // Cobro
  const [showCobro, setShowCobro] = useState(false);
  const [docType, setDocType] = useState('Nota de Venta');
  const [payMethod, setPayMethod] = useState('Efectivo');
  const [payCode, setPayCode] = useState('');
  const [mixCash, setMixCash] = useState('');
  const [mixDigital, setMixDigital] = useState('');
  const [receivedCash, setReceivedCash] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerDni, setCustomerDni] = useState('');
  const [customerRuc, setCustomerRuc] = useState('');
  const [checkoutErrors, setCheckoutErrors] = useState({});
  const [errorCobro, setErrorCobro] = useState('');
  const [ventaExitosa, setVentaExitosa] = useState(null);

  // Cotizaciones
  const [showCotizacionesModal, setShowCotizacionesModal] = useState(false);
  const [cotizacionesList, setCotizacionesList] = useState([]);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const searchRef = useRef(null);
  const clientePanelRef = useRef(null);
  const cartRef = useRef(null);

  const clearCheckoutError = (f) => setCheckoutErrors(prev => ({ ...prev, [f]: '' }));

  const mostrarToast = (mensaje, tipo = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ mensaje, tipo });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    loadInitialData();
    if (currentUser) loadEstadoCaja();
  }, [currentUser]);

  // En pantallas táctiles el foco automático abriría el teclado al entrar.
  useEffect(() => {
    if (window.matchMedia('(min-width: 1280px)').matches) searchRef.current?.focus();
  }, []);

  const loadEstadoCaja = async () => {
    try {
      const data = await api.get(`/caja/estado-actual`);
      setEstadoCaja(data);
      return data;
    } catch (err) {
      console.error('Error cargando estado de caja:', err);
    }
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [prodsData, clientsData, staffData, catsData] = await Promise.all([
        api.get('/productos'),
        api.get('/clientes'),
        api.get('/personal'),
        api.get('/categorias').catch(() => [])
      ]);
      setProducts(prodsData || []);
      setClients(clientsData || []);
      setSellers((staffData || []).filter(s => s.role === 'VENDEDOR' || s.role === 'ADMINISTRADOR'));
      setDbCategories(catsData || []);
      if (currentUser) setSellerName(currentUser.name);
      return prodsData || [];
    } catch (err) {
      mostrarToast('Error cargando datos del Punto de Venta: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const fromDb = dbCategories.map(c => c.name);
    const fromProds = products.map(p => p.category).filter(Boolean);
    const unique = Array.from(new Set([...fromDb, ...fromProds]));
    return ['Todas', ...(unique.length > 0 ? unique : ['General'])];
  }, [dbCategories, products]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter(p => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'Todas' || (p.category || 'General') === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, selectedCategory]);

  const cantidadEnCarrito = useMemo(() => new Map(cart.map(i => [i.id, i.qty])), [cart]);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartUnidades = cart.reduce((sum, item) => sum + item.qty, 0);
  const cajaCerrada = estadoCaja && estadoCaja.abierta === false;

  // Solo coincidencias exactas: una búsqueda parcial podía asignar la venta (o un fiado) a otro cliente.
  const buscarCliente = (input) => {
    const texto = input.trim();
    if (!texto) return null;
    return clients.find(c => `${c.doc} - ${c.name}` === texto || c.doc === texto) || null;
  };
  const clienteSeleccionado = buscarCliente(customerInput);

  const montoRecibido = parseFloat(receivedCash);
  const vuelto = !isNaN(montoRecibido) ? montoRecibido - cartTotal : null;
  const restoDigital = cartTotal - (parseFloat(mixCash) || 0);

  const montosRapidos = useMemo(() => {
    if (cartTotal <= 0) return [];
    const redondearA = (m) => Math.ceil(cartTotal / m) * m;
    const candidatos = [redondearA(5), redondearA(10), redondearA(50), redondearA(100), 200];
    return [...new Set(candidatos.map(n => Math.round(n * 100) / 100))]
      .filter(n => n > cartTotal + 0.001)
      .sort((a, b) => a - b)
      .slice(0, 4);
  }, [cartTotal]);

  useEffect(() => {
    if (cart.length === 0) setCotizacionCargada(null);
  }, [cart.length]);

  // ---------- Carrito ----------

  const addToCart = (product) => {
    if (product.stock <= 0) return mostrarToast(`${product.name} está agotado.`, 'error');
    const actual = cart.find(i => i.id === product.id);
    if (actual && actual.qty >= product.stock) {
      return mostrarToast(`Solo hay ${product.stock} unidades de ${product.name}.`, 'error');
    }
    setCart(prev => actual
      ? prev.map(i => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i))
      : [...prev, { id: product.id, name: product.name, code: product.code, price: product.price, qty: 1, stock: product.stock }]
    );
  };

  const setCartQty = (id, qty) => {
    const item = cart.find(i => i.id === id);
    if (!item || qty < 1) return;
    let cantidad = qty;
    if (cantidad > item.stock) {
      mostrarToast(`Solo hay ${item.stock} unidades de ${item.name}.`, 'error');
      cantidad = item.stock;
    }
    setCart(prev => prev.map(i => (i.id === id ? { ...i, qty: cantidad } : i)));
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(item => item.id !== id));

  const vaciarCarrito = () => {
    if (cart.length === 0) return;
    if (window.confirm('¿Vaciar la venta actual?')) setCart([]);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      setSearch('');
      return;
    }
    if (e.key !== 'Enter') return;

    const q = search.trim().toLowerCase();
    if (!q) return;
    // Enter agrega por código exacto (lector de barras) o el único resultado de la búsqueda.
    const candidato = products.find(p => p.code.toLowerCase() === q)
      || (filteredProducts.length === 1 ? filteredProducts[0] : null);

    if (candidato) {
      addToCart(candidato);
      setSearch('');
    } else if (filteredProducts.length === 0) {
      mostrarToast('No se encontró ningún producto con ese código o nombre.', 'error');
    }
  };

  // ---------- Cobro ----------

  const validarClienteEscrito = () => {
    if (customerInput.trim() && !clienteSeleccionado) {
      setCheckoutErrors(prev => ({ ...prev, customer: 'Cliente no registrado. Selecciónelo de la lista o borre el campo.' }));
      clientePanelRef.current?.focus();
      return false;
    }
    return true;
  };

  const abrirCobro = () => {
    if (cart.length === 0 || procesando) return;
    if (!validarClienteEscrito()) return;
    setErrorCobro('');
    setCheckoutErrors({});
    setShowCobro(true);
  };

  const resetFormularioCobro = () => {
    setCustomerInput('');
    setDocType('Nota de Venta');
    setPayMethod('Efectivo');
    setPayCode('');
    setMixCash('');
    setMixDigital('');
    setReceivedCash('');
    setCustomerName('');
    setCustomerDni('');
    setCustomerRuc('');
    setCheckoutErrors({});
    setErrorCobro('');
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || procesando) return;
    setErrorCobro('');

    const cajaActual = await loadEstadoCaja();
    if (!cajaActual) {
      return setErrorCobro('No se pudo verificar el estado de la caja. Revise su conexión e intente nuevamente.');
    }
    if (!cajaActual.abierta) {
      return setErrorCobro('La caja está cerrada. Abra su turno en "Arqueo de Caja" para poder cobrar.');
    }

    const matchedClient = clienteSeleccionado;
    const ce = {};

    if (customerInput.trim() && !matchedClient) {
      ce.customer = 'Cliente no registrado. Selecciónelo de la lista o borre el campo.';
    } else if (payMethod === 'Fiado' && !matchedClient) {
      ce.customer = 'Para vender al fiado debe seleccionar un cliente registrado.';
    }

    if (!matchedClient && docType !== 'Nota de Venta') {
      if (!customerName.trim()) ce.customerName = 'Ingrese el nombre del cliente.';
      if (docType === 'Boleta' && !/^\d{8}$/.test(customerDni.trim())) ce.customerDoc = 'El DNI debe tener 8 dígitos.';
      if (docType === 'Factura' && !/^\d{11}$/.test(customerRuc.trim())) ce.customerDoc = 'El RUC debe tener 11 dígitos.';
    }

    if (payMethod === 'Efectivo' && receivedCash !== '') {
      if (isNaN(montoRecibido) || montoRecibido < 0) ce.receivedCash = 'Monto recibido inválido.';
      else if (montoRecibido + 0.001 < cartTotal) ce.receivedCash = `El monto recibido es menor al total (${soles(cartTotal)}).`;
    }

    if (payMethod === 'Yape/Plin' && !payCode.trim()) {
      ce.payCode = 'Ingrese el N° de operación de Yape/Plin.';
    }

    if (payMethod === 'Pago Mixto') {
      const cashNum = parseFloat(mixCash);
      const digNum = parseFloat(mixDigital);
      if (mixCash === '' || isNaN(cashNum) || cashNum < 0) ce.mixCash = 'Monto en efectivo inválido.';
      if (mixDigital === '' || isNaN(digNum) || digNum < 0) ce.mixDigital = 'Monto digital inválido.';
      if (!ce.mixCash && !ce.mixDigital && Math.abs(cashNum + digNum - cartTotal) > 0.01) {
        ce.mixDigital = `La suma de ambos montos debe ser ${soles(cartTotal)}.`;
      }
    }

    setCheckoutErrors(ce);
    if (Object.values(ce).some(Boolean)) return;

    const matchedSeller = sellerName.trim() ? sellers.find(s => s.name === sellerName.trim()) : null;

    const payload = {
      docType,
      payMethod,
      mixCash: parseFloat(mixCash) || 0,
      mixDigital: parseFloat(mixDigital) || 0,
      payCode,
      usuarioCajaId: currentUser ? currentUser.id : null,
      clienteId: matchedClient ? matchedClient.id : null,
      vendedorId: matchedSeller ? matchedSeller.id : (currentUser ? currentUser.id : null),
      cotizacionId: cotizacionCargada ? cotizacionCargada.id : null,
      totalEsperado: Math.round(cartTotal * 100) / 100,
      cart: cart.map(item => ({ id: item.id, name: item.name, qty: item.qty })),
    };

    try {
      setProcesando(true);
      const res = await api.post('/ventas', payload);
      if (!res.success || !res.venta) return;

      window.dispatchEvent(new Event('venta-registrada'));

      // El ticket usa lo que registró el servidor, no lo que calculó la pantalla.
      const itemsVendidos = res.venta.items || cart;
      const totalVendido = res.venta.total ?? cartTotal;

      if (onTriggerPrint) {
        onTriggerPrint({
          docTitle: docType === 'Factura' ? 'FACTURA ELECTRÓNICA' : (docType === 'Boleta' ? 'BOLETA DE VENTA' : 'NOTA DE VENTA'),
          numDoc: res.venta.numDoc,
          dateStr: new Date().toLocaleString('es-PE'),
          customerName: matchedClient ? matchedClient.name : customerName || 'Público General',
          customerDoc: matchedClient ? matchedClient.doc : customerDni || customerRuc || '00000000',
          docLabelTitle: matchedClient ? (matchedClient.type === 'EMPRESA' ? 'RUC' : 'DNI') : customerDni ? 'DNI' : 'RUC',
          sellerName: sellerName || 'General',
          payMethod,
          items: itemsVendidos,
          total: totalVendido,
          isFiscal: docType === 'Boleta' || docType === 'Factura',
        });
        setTimeout(() => window.print(), 300);
      }

      setVentaExitosa({
        numDoc: res.venta.numDoc,
        total: totalVendido,
        payMethod,
        cliente: matchedClient ? matchedClient.name : customerName || 'Público General',
        vuelto: payMethod === 'Efectivo' && !isNaN(montoRecibido) ? montoRecibido - totalVendido : null,
      });
      setShowCobro(false);
      setCart([]);
      setCotizacionCargada(null);
      resetFormularioCobro();

      loadEstadoCaja();
      loadInitialData();
    } catch (err) {
      if (err.codigo === 'PRECIOS_CAMBIARON') {
        const preciosServidor = new Map((err.data?.precios || []).map(p => [p.id, p.price]));
        setCart(prev => prev.map(item =>
          preciosServidor.has(item.id) ? { ...item, price: preciosServidor.get(item.id) } : item
        ));
        loadInitialData();
        setErrorCobro(`${err.message} Ya se actualizaron los precios; verifique el nuevo total y confirme otra vez.`);
      } else {
        setErrorCobro(err.message || 'Error procesando la venta.');
      }
    } finally {
      setProcesando(false);
    }
  };

  const cerrarVentaExitosa = () => {
    setVentaExitosa(null);
    searchRef.current?.focus();
  };

  // ---------- Cotizaciones ----------

  const handleCrearCotizacion = async () => {
    if (cart.length === 0 || procesando) return;
    if (!validarClienteEscrito()) return;
    const matchedClient = clienteSeleccionado;

    try {
      setProcesando(true);
      const res = await api.post('/cotizaciones', {
        clienteId: matchedClient ? matchedClient.id : null,
        vendedorId: currentUser ? currentUser.id : null,
        validDays: 7,
        cart: cart.map(item => ({ id: item.id, name: item.name, qty: item.qty })),
      });
      if (!res.success || !res.cotizacion) return;

      if (onTriggerPrint) {
        onTriggerPrint({
          docTitle: 'PROFORMA / COTIZACIÓN',
          numDoc: res.cotizacion.numDoc,
          dateStr: new Date().toLocaleString('es-PE'),
          customerName: matchedClient ? matchedClient.name : 'Público General',
          customerDoc: matchedClient ? matchedClient.doc : '00000000',
          docLabelTitle: matchedClient ? (matchedClient.type === 'EMPRESA' ? 'RUC' : 'DNI') : 'DNI',
          sellerName: sellerName || 'General',
          payMethod: 'COTIZACIÓN (Válido 7 días)',
          items: res.cotizacion.detalles.map(d => ({ name: d.producto.name, qty: d.quantity, price: d.unitPrice })),
          total: res.cotizacion.total,
          isFiscal: false,
        });
        setTimeout(() => window.print(), 300);
      }

      mostrarToast(`Cotización ${res.cotizacion.numDoc} guardada.`, 'exito');
      setCart([]);
    } catch (err) {
      mostrarToast('Error creando cotización: ' + err.message, 'error');
    } finally {
      setProcesando(false);
    }
  };

  const handleOpenCotizacionesModal = async () => {
    try {
      setProcesando(true);
      const data = await api.get('/cotizaciones');
      setCotizacionesList(data.filter(c => c.status === 'PENDIENTE'));
      setShowCotizacionesModal(true);
    } catch (err) {
      mostrarToast('Error al obtener cotizaciones: ' + err.message, 'error');
    } finally {
      setProcesando(false);
    }
  };

  const handleCargarCotizacion = (cot) => {
    if (cart.length > 0 && !window.confirm('Se reemplazarán los productos de la venta actual. ¿Continuar?')) return;

    setCart(cot.detalles.map(d => ({
      id: d.producto.id,
      name: d.producto.name,
      code: d.producto.code,
      price: d.unitPrice,
      qty: d.quantity,
      stock: d.producto.stock,
    })));
    setCotizacionCargada({ id: cot.id, numDoc: cot.numDoc });
    setCustomerInput(cot.clienteId ? `${cot.customerDoc} - ${cot.customer}` : '');
    setShowCotizacionesModal(false);
    mostrarToast(`Cotización ${cot.numDoc} cargada. Revise y cobre la venta.`, 'exito');
  };

  // ---------- Atajos de teclado ----------

  const atajosRef = useRef(null);
  atajosRef.current = (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      searchRef.current?.focus();
    } else if (e.key === 'F9') {
      e.preventDefault();
      if (!showCobro && !ventaExitosa && !showCotizacionesModal && !cajaCerrada) abrirCobro();
    } else if (e.key === 'Escape') {
      if (ventaExitosa) cerrarVentaExitosa();
      else if (showCobro && !procesando) setShowCobro(false);
      else if (showCotizacionesModal) setShowCotizacionesModal(false);
    }
  };

  useEffect(() => {
    const handler = (e) => atajosRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ---------- Render ----------

  const colorToast = {
    error: 'bg-red-600',
    exito: 'bg-emerald-600',
    info: 'bg-slate-800',
  };

  return (
    <div className="tab-content active h-full flex flex-col p-3 sm:p-4 pb-24 xl:pb-4 overflow-y-auto xl:overflow-hidden">
      <datalist id="pos-customer-list">
        {clients.map(c => (
          <option key={c.id} value={`${c.doc} - ${c.name}`} />
        ))}
      </datalist>

      <div className="flex-1 flex flex-col xl:flex-row gap-4 xl:overflow-hidden xl:min-h-0">

        {/* ===== CATÁLOGO ===== */}
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 xl:h-full xl:overflow-hidden min-w-0">
          <div className="p-3 sm:p-4 border-b border-gray-100 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <i className="fa-solid fa-barcode absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Escanee o busque por código o nombre…"
                  className="w-full pl-10 pr-20 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm transition"
                />
                {search ? (
                  <button
                    onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 p-1"
                    title="Limpiar búsqueda"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                ) : (
                  <kbd className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">F2</kbd>
                )}
              </div>
              <button
                onClick={handleOpenCotizacionesModal}
                disabled={procesando}
                className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
              >
                <i className="fa-solid fa-file-import text-orange-600"></i> Cargar cotización
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 whitespace-nowrap border transition-colors ${
                    selectedCategory === cat
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 p-3 sm:p-4 xl:overflow-y-auto bg-slate-50/60">
            <p className="text-xs text-slate-500 mb-3">
              {filteredProducts.length} producto{filteredProducts.length === 1 ? '' : 's'}
              {search && <> para “<strong className="text-slate-700">{search}</strong>”</>}
              {selectedCategory !== 'Todas' && <> en <strong className="text-slate-700">{selectedCategory}</strong></>}
            </p>

            {loading && products.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando productos…
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <i className="fa-solid fa-magnifying-glass text-3xl mb-3 text-slate-300"></i>
                <p className="text-sm font-semibold">No hay productos que coincidan</p>
                {(search || selectedCategory !== 'Todas') && (
                  <button
                    onClick={() => { setSearch(''); setSelectedCategory('Todas'); }}
                    className="mt-3 text-xs font-bold text-orange-600 hover:underline"
                  >
                    Quitar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {filteredProducts.map(prod => {
                  const agotado = prod.stock <= 0;
                  const stockBajo = !agotado && prod.stock <= (prod.minStock || 10);
                  const enCarrito = cantidadEnCarrito.get(prod.id) || 0;

                  return (
                    <button
                      key={prod.id}
                      onClick={() => addToCart(prod)}
                      disabled={agotado}
                      className={`relative text-left p-3 rounded-xl border bg-white transition-all flex flex-col gap-1.5 min-h-[118px] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                        enCarrito > 0
                          ? 'border-orange-400 ring-1 ring-orange-200'
                          : 'border-gray-200 hover:border-orange-400 hover:shadow-md'
                      }`}
                    >
                      {enCarrito > 0 && (
                        <span className="absolute top-2 right-2 bg-orange-600 text-white text-[11px] font-black rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center shadow">
                          {enCarrito}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-400 truncate pr-7">{prod.code}</span>
                      <h4 className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2 flex-1">{prod.name}</h4>
                      <div className="flex items-end justify-between gap-2">
                        <span className="text-base font-black text-slate-900">{soles(prod.price)}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                          agotado
                            ? 'bg-slate-200 text-slate-500'
                            : stockBajo
                            ? 'bg-red-100 text-red-600'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {agotado ? 'Agotado' : `${prod.stock} disp.`}
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
          className="w-full xl:w-[420px] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 xl:h-full xl:overflow-hidden shrink-0"
        >
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <i className="fa-solid fa-cart-shopping text-orange-600"></i> Venta actual
              {cart.length > 0 && (
                <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  {cartUnidades} und.
                </span>
              )}
            </h3>
            {cart.length > 0 && (
              <button onClick={vaciarCarrito} className="text-xs font-semibold text-slate-400 hover:text-red-600 transition-colors">
                <i className="fa-solid fa-trash-can mr-1"></i> Vaciar
              </button>
            )}
          </div>

          {cajaCerrada && (
            <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center gap-2">
              <i className="fa-solid fa-lock"></i>
              <span><strong>Caja cerrada.</strong> Abra su turno en "Arqueo de Caja" para poder cobrar.</span>
            </div>
          )}

          {cotizacionCargada && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex justify-between items-center gap-2">
              <span>
                <i className="fa-solid fa-file-invoice mr-1.5"></i>
                Cobrando cotización <strong>{cotizacionCargada.numDoc}</strong>
              </span>
              <button
                onClick={() => setCotizacionCargada(null)}
                className="text-amber-700 hover:text-red-600 font-bold shrink-0 underline"
                title="Se cobrará como venta normal y la cotización seguirá pendiente"
              >
                Desvincular
              </button>
            </div>
          )}

          <div className="flex-1 xl:overflow-y-auto px-4 min-h-[140px]">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-10">
                <i className="fa-solid fa-basket-shopping text-4xl mb-3 text-slate-200"></i>
                <p className="text-sm font-semibold text-slate-500">Aún no hay productos</p>
                <p className="text-xs mt-1">Toque un producto del catálogo o escanee su código.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {cart.map(item => (
                  <li key={item.id} className="py-3 flex gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{item.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{soles(item.price)} c/u</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-sm font-black text-slate-900 tabular-nums">{soles(item.price * item.qty)}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCartQty(item.id, item.qty - 1)}
                          disabled={item.qty <= 1}
                          className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Quitar uno"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.qty}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                            if (!isNaN(n)) setCartQty(item.id, n);
                          }}
                          className="w-11 h-7 text-center border border-slate-300 rounded-md text-sm font-bold outline-none focus:border-orange-500"
                        />
                        <button
                          onClick={() => setCartQty(item.id, item.qty + 1)}
                          className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                          title="Agregar uno"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 ml-1"
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

          <div className="border-t border-gray-200 bg-slate-50 p-4 flex flex-col gap-3 shrink-0">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">Cliente</label>
              <ClienteSelector
                value={customerInput}
                onChange={v => { setCustomerInput(v); clearCheckoutError('customer'); }}
                cliente={clienteSeleccionado}
                error={checkoutErrors.customer}
                inputRef={clientePanelRef}
              />
            </div>

            <div className="flex justify-between items-end">
              <span className="text-sm text-slate-500">Total</span>
              <span className="text-3xl font-black text-slate-900 tabular-nums">{soles(cartTotal)}</span>
            </div>

            <button
              onClick={abrirCobro}
              disabled={procesando || cart.length === 0 || cajaCerrada}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-lg shadow-md transition-colors text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-cash-register"></i> Cobrar
              <kbd className="hidden sm:inline text-[10px] font-bold bg-orange-700/60 rounded px-1.5 py-0.5">F9</kbd>
            </button>

            <button
              onClick={handleCrearCotizacion}
              disabled={procesando || cart.length === 0}
              className="w-full bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold py-2 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fa-solid fa-file-pdf mr-1.5 text-slate-500"></i> Guardar como cotización
            </button>
          </div>
        </div>
      </div>

      {/* Barra inferior en móvil/tablet para llegar al carrito */}
      {cart.length > 0 && !showCobro && (
        <div className="xl:hidden fixed bottom-0 inset-x-0 lg:left-64 z-20 p-3 bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <button
            onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="w-full bg-slate-900 text-white rounded-lg py-3 px-4 flex justify-between items-center font-bold"
          >
            <span className="flex items-center gap-2 text-sm">
              <i className="fa-solid fa-cart-shopping text-orange-400"></i> Ver venta ({cartUnidades})
            </span>
            <span className="text-lg text-orange-400 tabular-nums">{soles(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* ===== MODAL: COBRO ===== */}
      {showCobro && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm sm:p-4">
          <div className="bg-white sm:rounded-xl rounded-t-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <p className="text-xs text-slate-400 font-semibold">Total a cobrar · {cartUnidades} und.</p>
                <p className="text-3xl font-black text-orange-400 tabular-nums">{soles(cartTotal)}</p>
              </div>
              <button
                onClick={() => !procesando && setShowCobro(false)}
                className="text-slate-400 hover:text-white p-1"
                title="Cerrar (Esc)"
              >
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              {errorCobro && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex gap-2">
                  <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
                  <span>{errorCobro}</span>
                </div>
              )}

              <Seccion titulo="1. Comprobante">
                <div className="grid grid-cols-3 gap-2">
                  {COMPROBANTES.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setDocType(c.id); clearCheckoutError('customerName'); clearCheckoutError('customerDoc'); }}
                      className={`rounded-lg border p-2.5 text-center transition-colors ${
                        docType === c.id
                          ? 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-500'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <i className={`fa-solid ${c.icon} text-base`}></i>
                      <p className="text-xs font-bold mt-1">{c.id}</p>
                      <p className="text-[10px] opacity-70">{c.ayuda}</p>
                    </button>
                  ))}
                </div>
              </Seccion>

              <Seccion titulo="2. Cliente">
                <ClienteSelector
                  value={customerInput}
                  onChange={v => { setCustomerInput(v); clearCheckoutError('customer'); }}
                  cliente={clienteSeleccionado}
                  error={checkoutErrors.customer}
                />

                {!clienteSeleccionado && docType !== 'Nota de Venta' && (
                  <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-2">
                      Cliente no registrado: ingrese sus datos para la {docType.toLowerCase()}.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      <input
                        type="text"
                        maxLength={120}
                        value={customerName}
                        onChange={e => { setCustomerName(e.target.value); clearCheckoutError('customerName'); }}
                        placeholder={docType === 'Factura' ? 'Razón social' : 'Nombres y apellidos'}
                        className={`sm:col-span-3 w-full px-3 py-2 border rounded-lg outline-none text-sm ${borderClass(checkoutErrors.customerName)}`}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={docType === 'Boleta' ? 8 : 11}
                        value={docType === 'Boleta' ? customerDni : customerRuc}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '');
                          docType === 'Boleta' ? setCustomerDni(v) : setCustomerRuc(v);
                          clearCheckoutError('customerDoc');
                        }}
                        placeholder={docType === 'Boleta' ? 'DNI (8)' : 'RUC (11)'}
                        className={`sm:col-span-2 w-full px-3 py-2 border rounded-lg outline-none text-sm font-mono ${borderClass(checkoutErrors.customerDoc)}`}
                      />
                    </div>
                    <FieldError msg={checkoutErrors.customerName || checkoutErrors.customerDoc} />
                  </div>
                )}
              </Seccion>

              <Seccion titulo="3. Método de pago">
                <div className="grid grid-cols-3 gap-2">
                  {METODOS_PAGO.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setPayMethod(m.id); setCheckoutErrors(prev => ({ customer: prev.customer, customerName: prev.customerName, customerDoc: prev.customerDoc })); }}
                      className={`rounded-lg border py-2.5 px-1 text-center transition-colors ${
                        payMethod === m.id
                          ? 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-500'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <i className={`fa-solid ${m.icon} text-base`}></i>
                      <p className="text-xs font-bold mt-1">{m.label}</p>
                    </button>
                  ))}
                </div>

                {payMethod === 'Efectivo' && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Recibido (opcional)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.10"
                          value={receivedCash}
                          onChange={e => { setReceivedCash(e.target.value); clearCheckoutError('receivedCash'); }}
                          onKeyDown={e => e.key === 'Enter' && handleCheckout()}
                          placeholder="0.00"
                          className={`w-full px-3 py-2.5 border rounded-lg outline-none text-lg font-bold ${borderClass(checkoutErrors.receivedCash)}`}
                        />
                      </div>
                      <div className={`rounded-lg border px-3 py-2 flex flex-col justify-center ${
                        vuelto === null
                          ? 'bg-slate-50 border-slate-200 text-slate-400'
                          : vuelto < 0
                          ? 'bg-red-50 border-red-200 text-red-600'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}>
                        <span className="text-xs font-semibold">{vuelto !== null && vuelto < 0 ? 'Falta' : 'Vuelto'}</span>
                        <span className="text-2xl font-black tabular-nums">
                          {vuelto === null ? '—' : soles(Math.abs(vuelto))}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setReceivedCash(cartTotal.toFixed(2)); clearCheckoutError('receivedCash'); }}
                        className="px-3 py-1.5 rounded-full text-xs font-bold border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
                      >
                        Exacto
                      </button>
                      {montosRapidos.map(monto => (
                        <button
                          key={monto}
                          type="button"
                          onClick={() => { setReceivedCash(monto.toFixed(2)); clearCheckoutError('receivedCash'); }}
                          className="px-3 py-1.5 rounded-full text-xs font-bold border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
                        >
                          {soles(monto)}
                        </button>
                      ))}
                    </div>
                    <FieldError msg={checkoutErrors.receivedCash} />
                  </div>
                )}

                {payMethod === 'Yape/Plin' && (
                  <div className="mt-3">
                    <label className="text-xs text-slate-500 mb-1 block">N° de operación</label>
                    <input
                      type="text"
                      maxLength={40}
                      value={payCode}
                      onChange={e => { setPayCode(e.target.value); clearCheckoutError('payCode'); }}
                      placeholder="Ej. 12345678"
                      className={`w-full px-3 py-2.5 border rounded-lg outline-none text-sm font-mono ${borderClass(checkoutErrors.payCode)}`}
                    />
                    <FieldError msg={checkoutErrors.payCode} />
                  </div>
                )}

                {payMethod === 'Pago Mixto' && (
                  <div className="mt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Efectivo</label>
                        <input
                          type="number"
                          min="0"
                          step="0.10"
                          value={mixCash}
                          onChange={e => { setMixCash(e.target.value); clearCheckoutError('mixCash'); clearCheckoutError('mixDigital'); }}
                          placeholder="0.00"
                          className={`w-full px-3 py-2.5 border rounded-lg outline-none text-sm font-bold ${borderClass(checkoutErrors.mixCash)}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Digital</label>
                        <input
                          type="number"
                          min="0"
                          step="0.10"
                          value={mixDigital}
                          onChange={e => { setMixDigital(e.target.value); clearCheckoutError('mixDigital'); clearCheckoutError('mixCash'); }}
                          placeholder="0.00"
                          className={`w-full px-3 py-2.5 border rounded-lg outline-none text-sm font-bold ${borderClass(checkoutErrors.mixDigital)}`}
                        />
                      </div>
                    </div>
                    {mixCash !== '' && restoDigital >= 0 && Math.abs((parseFloat(mixDigital) || 0) - restoDigital) > 0.001 && (
                      <button
                        type="button"
                        onClick={() => { setMixDigital(restoDigital.toFixed(2)); clearCheckoutError('mixDigital'); }}
                        className="mt-2 text-xs font-bold text-orange-600 hover:underline"
                      >
                        Completar digital con {soles(restoDigital)}
                      </button>
                    )}
                    <FieldError msg={checkoutErrors.mixCash || checkoutErrors.mixDigital} />
                  </div>
                )}

                {payMethod === 'Fiado' && (
                  <p className="mt-3 text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <i className="fa-solid fa-circle-info text-amber-500 mr-1"></i>
                    Se cargará a la cuenta del cliente. Requiere un cliente registrado con crédito disponible.
                  </p>
                )}
              </Seccion>
            </div>

            <div className="p-4 border-t border-gray-200 bg-slate-50 flex gap-2 shrink-0">
              <button
                onClick={() => setShowCobro(false)}
                disabled={procesando}
                className="px-4 py-3 font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCheckout}
                disabled={procesando}
                className="flex-1 py-3 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg text-base shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {procesando ? (
                  <><i className="fa-solid fa-spinner fa-spin"></i> Procesando…</>
                ) : (
                  <><i className="fa-solid fa-check"></i> Confirmar cobro · {soles(cartTotal)}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: VENTA REGISTRADA ===== */}
      {ventaExitosa && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 text-3xl">
              <i className="fa-solid fa-check"></i>
            </div>
            <h3 className="text-xl font-bold text-slate-800">Venta registrada</h3>
            <p className="text-sm text-slate-500 mt-1">
              {ventaExitosa.numDoc} · {ventaExitosa.cliente}
            </p>

            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-sm">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-slate-500">Total ({ventaExitosa.payMethod})</span>
                <span className="font-bold text-slate-800">{soles(ventaExitosa.total)}</span>
              </div>
              {ventaExitosa.vuelto !== null && (
                <div className="flex justify-between items-center px-4 py-3 bg-emerald-50">
                  <span className="text-emerald-700 font-semibold">Vuelto a entregar</span>
                  <span className="text-2xl font-black text-emerald-700 tabular-nums">{soles(ventaExitosa.vuelto)}</span>
                </div>
              )}
            </div>

            <button
              autoFocus
              onClick={cerrarVentaExitosa}
              className="mt-5 w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors"
            >
              Nueva venta
            </button>
          </div>
        </div>
      )}

      {/* ===== MODAL: COTIZACIONES PENDIENTES ===== */}
      {showCotizacionesModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <i className="fa-solid fa-file-import text-orange-400"></i> Cargar cotización
              </h3>
              <button onClick={() => setShowCotizacionesModal(false)} className="text-slate-400 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              {cotizacionesList.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <i className="fa-solid fa-file-circle-check text-4xl mb-3 text-slate-300"></i>
                  <p className="text-sm font-semibold">No hay cotizaciones pendientes</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cotizacionesList.map(c => (
                    <li
                      key={c.id}
                      className="border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:border-orange-300 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-800">{c.numDoc}</span>
                          <span className="text-xs text-slate-400">{c.date}</span>
                        </div>
                        <p className="text-sm text-slate-600 truncate">{c.customer}</p>
                        <p className="text-xs text-slate-400">
                          {c.detalles.length} producto{c.detalles.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <span className="font-black text-slate-900 tabular-nums">{soles(c.total)}</span>
                        <button
                          onClick={() => handleCargarCotizacion(c)}
                          className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg text-sm shadow-sm"
                        >
                          Cargar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed z-[60] bottom-24 xl:bottom-6 left-1/2 -translate-x-1/2 xl:left-auto xl:right-6 xl:translate-x-0 max-w-[90vw]">
          <div className={`${colorToast[toast.tipo] || colorToast.info} text-white text-sm font-semibold px-4 py-3 rounded-lg shadow-lg flex items-center gap-2`}>
            <i className={`fa-solid ${toast.tipo === 'error' ? 'fa-circle-exclamation' : toast.tipo === 'exito' ? 'fa-circle-check' : 'fa-circle-info'}`}></i>
            {toast.mensaje}
          </div>
        </div>
      )}
    </div>
  );
}
