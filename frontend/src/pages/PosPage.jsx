import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function PosPage({ currentUser, onTriggerPrint }) {
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);

  // Formulario
  const [docType, setDocType] = useState('Nota de Venta');
  const [payMethod, setPayMethod] = useState('Efectivo');
  const [customerInput, setCustomerInput] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [payCode, setPayCode] = useState('');
  const [mixCash, setMixCash] = useState('');
  const [mixDigital, setMixDigital] = useState('');

  // Modales
  const [showCotizacionesModal, setShowCotizacionesModal] = useState(false);
  const [cotizacionesList, setCotizacionesList] = useState([]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [prodsData, clientsData, staffData] = await Promise.all([
        api.get('/productos'),
        api.get('/clientes'),
        api.get('/personal')
      ]);
      setProducts(prodsData);
      setClients(clientsData);
      setSellers(staffData.filter(s => s.role === 'VENDEDOR' || s.role === 'ADMINISTRADOR'));
      if (currentUser) {
        setSellerName(currentUser.name);
      }
    } catch (err) {
      alert('Error cargando datos del Punto de Venta: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (product) => {
    if (product.stock <= 0) {
      return alert('Producto agotado. No hay stock disponible en almacén.');
    }

    setCart(prevCart => {
      const existingIndex = prevCart.findIndex(item => item.id === product.id);
      if (existingIndex >= 0) {
        const existingItem = prevCart[existingIndex];
        if (existingItem.qty >= product.stock) {
          alert(`Límite alcanzado. Solo hay ${product.stock} unidades en stock.`);
          return prevCart;
        }
        const updated = [...prevCart];
        updated[existingIndex] = { ...existingItem, qty: existingItem.qty + 1 };
        return updated;
      }
      return [...prevCart, { id: product.id, name: product.name, code: product.code, price: product.price, qty: 1, stock: product.stock }];
    });
  };

  const updateCartQty = (id, delta) => {
    setCart(prevCart => {
      return prevCart.map(item => {
        if (item.id === id) {
          const newQty = item.qty + delta;
          if (newQty <= 0) return null;
          if (newQty > item.stock) {
            alert(`No puede superar el stock disponible (${item.stock} un.).`);
            return item;
          }
          return { ...item, qty: newQty };
        }
        return item;
      }).filter(Boolean);
    });
  };

  const removeFromCart = (id) => {
    setCart(prevCart => prevCart.filter(item => item.id !== id));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return alert('El carrito está vacío.');

    let matchedClient = null;
    if (customerInput.trim()) {
      matchedClient = clients.find(c =>
        `${c.doc} - ${c.name}` === customerInput.trim() ||
        c.doc === customerInput.trim() ||
        c.name.toLowerCase().includes(customerInput.trim().toLowerCase())
      );
    }

    if (payMethod === 'Fiado' && !matchedClient) {
      return alert('Para ventas al FIADO debe seleccionar un cliente registrado.');
    }

    let matchedSeller = null;
    if (sellerName.trim()) {
      matchedSeller = sellers.find(s => s.name === sellerName.trim());
    }

    const payload = {
      docType,
      payMethod,
      mixCash: parseFloat(mixCash) || 0,
      mixDigital: parseFloat(mixDigital) || 0,
      payCode,
      clienteId: matchedClient ? matchedClient.id : null,
      vendedorId: matchedSeller ? matchedSeller.id : (currentUser ? currentUser.id : null),
      cart
    };

    try {
      setLoading(true);
      const res = await api.post('/ventas', payload);

      if (res.success && res.venta) {
        if (onTriggerPrint) {
          onTriggerPrint({
            businessName: 'FERRESYS S.A.C.',
            businessRuc: '20123456789',
            businessAddress: 'Av. Las Flores 123, Cajamarca',
            docTitle: docType === 'Factura' ? 'FACTURA ELECTRÓNICA' : (docType === 'Boleta' ? 'BOLETA DE VENTA' : 'NOTA DE VENTA'),
            numDoc: res.venta.numDoc,
            dateStr: new Date().toLocaleString('es-PE'),
            customerName: matchedClient ? matchedClient.name : 'Público General',
            customerDoc: matchedClient ? matchedClient.doc : '00000000',
            docLabelTitle: matchedClient && matchedClient.type === 'EMPRESA' ? 'RUC' : 'DNI',
            sellerName: sellerName || 'General',
            payMethod,
            items: cart,
            total: cartTotal,
            isFiscal: docType === 'Boleta' || docType === 'Factura',
          });

          setTimeout(() => {
            window.print();
          }, 300);
        }

        alert(`¡Venta completada con éxito! Comprobante: ${res.venta.numDoc}`);
        setCart([]);
        setCustomerInput('');
        setPayCode('');
        setMixCash('');
        setMixDigital('');
        await loadInitialData();
      }
    } catch (err) {
      alert('Error procesando venta: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCrearCotizacion = async () => {
    if (cart.length === 0) return alert('Agregue productos al carrito para cotizar.');

    let matchedClient = null;
    if (customerInput.trim()) {
      matchedClient = clients.find(c =>
        `${c.doc} - ${c.name}` === customerInput.trim() ||
        c.doc === customerInput.trim()
      );
    }

    try {
      setLoading(true);
      const res = await api.post('/cotizaciones', {
        clienteId: matchedClient ? matchedClient.id : null,
        vendedorId: currentUser ? currentUser.id : null,
        validDays: 7,
        cart,
      });

      if (res.success && res.cotizacion) {
        if (onTriggerPrint) {
          onTriggerPrint({
            businessName: 'FERRESYS S.A.C.',
            businessRuc: '20123456789',
            businessAddress: 'Av. Las Flores 123, Cajamarca',
            docTitle: 'PROFORMA / COTIZACIÓN',
            numDoc: res.cotizacion.numDoc,
            dateStr: new Date().toLocaleString('es-PE'),
            customerName: matchedClient ? matchedClient.name : 'Público General',
            customerDoc: matchedClient ? matchedClient.doc : '00000000',
            docLabelTitle: matchedClient && matchedClient.type === 'EMPRESA' ? 'RUC' : 'DNI',
            sellerName: sellerName || 'General',
            payMethod: 'COTIZACIÓN (Válido 7 días)',
            items: cart,
            total: cartTotal,
            isFiscal: false,
          });

          setTimeout(() => {
            window.print();
          }, 300);
        }

        alert(`¡Cotización/Proforma creada! N° Documento: ${res.cotizacion.numDoc}`);
        setCart([]);
      }
    } catch (err) {
      alert('Error creando cotización: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCotizacionesModal = async () => {
    try {
      setLoading(true);
      const data = await api.get('/cotizaciones');
      setCotizacionesList(data.filter(c => c.status === 'PENDIENTE'));
      setShowCotizacionesModal(true);
    } catch (err) {
      alert('Error al obtener cotizaciones: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCargarCotizacion = (cot) => {
    const newCart = cot.detalles.map(d => ({
      id: d.producto.id,
      name: d.producto.name,
      code: d.producto.code,
      price: d.unitPrice,
      qty: d.quantity,
      stock: d.producto.stock,
    }));

    setCart(newCart);
    if (cot.clienteId) {
      setCustomerInput(`${cot.customerDoc} - ${cot.customer}`);
    }
    setShowCotizacionesModal(false);
    alert(`Cotización ${cot.numDoc} cargada en el Punto de Venta. Seleccione la forma de pago para procesar la Venta.`);
  };

  return (
    <div className="tab-content active h-full flex flex-col p-4 overflow-hidden">
      <div className="flex-1 flex flex-col xl:flex-row gap-4 overflow-hidden">
        {/* Panel Izquierdo: Catálogo y Búsqueda */}
        <div className="flex-1 flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-slate-50 flex justify-between items-center gap-3">
            <div className="relative flex-1">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400"></i>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por código de barra o nombre..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:border-orange-500 text-sm"
              />
            </div>
            <button
              onClick={handleOpenCotizacionesModal}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-2 rounded-lg text-xs shadow transition-colors flex items-center gap-1.5 shrink-0"
            >
              <i className="fa-solid fa-file-invoice"></i> Cargar Cotización
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map(prod => (
                <div
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  className="p-3 border border-gray-200 rounded-xl hover:border-orange-500 hover:shadow-md cursor-pointer transition-all bg-white flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 block mb-1">{prod.code}</span>
                    <h4 className="font-bold text-slate-800 text-xs line-clamp-2 mb-2">{prod.name}</h4>
                  </div>
                  <div className="flex justify-between items-end border-t pt-2">
                    <span className={`text-xs ${prod.stock <= (prod.minStock || 10) ? 'text-red-500 font-bold' : 'text-emerald-600'}`}>
                      {prod.stock} disp.
                    </span>
                    <span className="font-black text-slate-800">S/ {prod.price.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Panel lateral de Carrito y Cobro */}
        <div className="w-full xl:w-[400px] flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden shrink-0">
          <div className="p-3 bg-slate-900 text-white font-bold flex justify-between items-center">
            <span><i className="fa-solid fa-receipt mr-2"></i> Detalle de Venta</span>
          </div>

          <div className="p-3 bg-slate-50 border-b border-gray-200 text-sm flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded outline-none font-medium bg-white text-xs"
              >
                <option value="Nota de Venta">Nota de Venta</option>
                <option value="Boleta">Boleta</option>
                <option value="Factura">Factura</option>
              </select>

              <select
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded outline-none font-medium bg-white text-xs"
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Yape/Plin">Yape/Plin</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Pago Mixto">Pago Mixto</option>
                <option value="Fiado">Fiado (Crédito)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="relative w-full">
                <input
                  list="pos-customer-list"
                  value={customerInput}
                  onChange={e => setCustomerInput(e.target.value)}
                  placeholder="Buscar por DNI/RUC o Nombre..."
                  className="w-full px-3 py-2 border border-gray-300 rounded outline-none bg-white font-medium focus:border-orange-500 text-xs"
                />
                <datalist id="pos-customer-list">
                  {clients.map(c => (
                    <option key={c.id} value={`${c.doc} - ${c.name}`} />
                  ))}
                </datalist>
              </div>

              <div>
                <select
                  value={sellerName}
                  onChange={e => setSellerName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded outline-none font-medium bg-white text-xs"
                >
                  {sellers.map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
            </div>

            {payMethod === 'Yape/Plin' && (
              <input
                type="text"
                value={payCode}
                onChange={e => setPayCode(e.target.value)}
                placeholder="N° de Operación Yape/Plin..."
                className="w-full px-3 py-2 border border-gray-300 rounded outline-none text-xs font-mono"
              />
            )}

            {payMethod === 'Pago Mixto' && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={mixCash}
                  onChange={e => setMixCash(e.target.value)}
                  placeholder="S/ Efectivo"
                  className="px-3 py-2 border border-gray-300 rounded outline-none text-xs"
                />
                <input
                  type="number"
                  value={mixDigital}
                  onChange={e => setMixDigital(e.target.value)}
                  placeholder="S/ Digital"
                  className="px-3 py-2 border border-gray-300 rounded outline-none text-xs"
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 divide-y divide-gray-100">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <i className="fa-solid fa-cart-shopping text-3xl mb-2"></i>
                <p className="text-xs font-semibold">El carrito está vacío</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-400">S/ {item.price.toFixed(2)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateCartQty(item.id, -1)} className="w-5 h-5 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 font-bold">-</button>
                    <span className="font-bold w-6 text-center">{item.qty}</span>
                    <button onClick={() => updateCartQty(item.id, 1)} className="w-5 h-5 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 font-bold">+</button>
                  </div>
                  <span className="font-black text-slate-800 w-16 text-right">S/ {(item.price * item.qty).toFixed(2)}</span>
                  <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 pl-1"><i className="fa-solid fa-xmark"></i></button>
                </div>
              ))
            )}
          </div>

          <div className="p-4 bg-slate-900 text-white shrink-0">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold">Total a Pagar</span>
              <span className="text-2xl font-black text-orange-500">S/ {cartTotal.toFixed(2)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCrearCotizacion}
                disabled={loading || cart.length === 0}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-lg shadow text-xs transition-colors disabled:opacity-50"
              >
                <i className="fa-solid fa-file-pdf mr-1"></i> Cotización
              </button>
              <button
                onClick={handleCheckout}
                disabled={loading || cart.length === 0}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg shadow transition-colors text-xs disabled:opacity-50"
              >
                Cobrar Venta
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Cotizaciones Pendientes */}
      {showCotizacionesModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg"><i className="fa-solid fa-file-invoice mr-2"></i> Cotizaciones / Proformas Vigentes</h3>
              <button onClick={() => setShowCotizacionesModal(false)} className="text-slate-300 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Documento</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-gray-100">
                  {cotizacionesList.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-6 text-center text-slate-400">
                        No hay cotizaciones pendientes de cobro.
                      </td>
                    </tr>
                  ) : (
                    cotizacionesList.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-bold">{c.numDoc}</td>
                        <td className="px-3 py-2 text-slate-500">{c.date}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{c.customer}</td>
                        <td className="px-3 py-2 text-right font-black">S/ {c.total.toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleCargarCotizacion(c)}
                            className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-3 py-1.5 rounded shadow text-xs"
                          >
                            Cargar al POS
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
