import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';

export default function EntregasPage({ onTriggerPrint }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Formulario Nueva Entrega
  const [clients, setClients] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [products, setProducts] = useState([]);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSellerName, setSelectedSellerName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [productInput, setProductInput] = useState('');
  const [productQty, setProductQty] = useState('1');
  const [deliveryCart, setDeliveryCart] = useState([]);

  const wakeLockRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Polling 2s & High-Responsiveness Listeners (<100ms)
  useEffect(() => {
    loadDeliveries();

    const intervalId = setInterval(() => {
      loadDeliveriesSilently();
    }, 2000);

    const handleQuickRefetch = () => {
      loadDeliveriesSilently();
    };

    window.addEventListener('visibilitychange', handleQuickRefetch);
    window.addEventListener('focus', handleQuickRefetch);
    window.addEventListener('pointerdown', handleQuickRefetch);

    // Screen Wake Lock API
    requestWakeLock();

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleQuickRefetch);
      window.removeEventListener('focus', handleQuickRefetch);
      window.removeEventListener('pointerdown', handleQuickRefetch);
      releaseWakeLock();
    };
  }, []);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('🔒 Screen WakeLock activado para monitoreo de Entregas');
      }
    } catch (err) {
      console.warn('WakeLock no soportado o denegado:', err.message);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  const loadDeliveries = async () => {
    try {
      setLoading(true);
      const data = await api.get('/entregas');
      setDeliveries(data);
    } catch (err) {
      console.error('Error cargando entregas:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDeliveriesSilently = async () => {
    if (isFetchingRef.current) return;
    try {
      isFetchingRef.current = true;
      const data = await api.get('/entregas');
      setDeliveries(data);
    } catch (err) {
      // Ignorar errores silenciosos en polling
    } finally {
      isFetchingRef.current = false;
    }
  };

  const handleOpenDeliveryModal = async () => {
    try {
      const [cls, stf, prods] = await Promise.all([
        api.get('/clientes'),
        api.get('/personal'),
        api.get('/productos')
      ]);
      setClients(cls);
      setSellers(stf.filter(s => s.role === 'REPARTIDOR' || s.role === 'ADMINISTRADOR' || s.role === 'VENDEDOR'));
      setProducts(prods);

      if (cls.length > 0) setSelectedClientId(cls[0].id.toString());
      setSelectedSellerName('');
      setDeliveryAddress('');
      setProductInput('');
      setProductQty('1');
      setDeliveryCart([]);
      setShowModal(true);
    } catch (err) {
      alert('Error cargando catálogo para delivery: ' + err.message);
    }
  };

  const handleAddDeliveryItem = () => {
    if (!productInput.trim()) return alert('Ingrese un producto.');
    const qty = parseInt(productQty);
    if (isNaN(qty) || qty <= 0) return alert('Cantidad inválida.');

    const prod = products.find(p => `${p.code} - ${p.name}` === productInput.trim()) ||
      products.find(p => p.code === productInput.trim() || p.name.toLowerCase().includes(productInput.trim().toLowerCase()));

    if (!prod) return alert('Producto no encontrado.');
    if (qty > prod.stock) return alert(`Stock insuficiente. Disponible: ${prod.stock}`);

    setDeliveryCart(prev => {
      const exist = prev.find(item => item.id === prod.id);
      if (exist) {
        if (exist.qty + qty > prod.stock) {
          alert('Supera el stock disponible.');
          return prev;
        }
        return prev.map(item => item.id === prod.id ? { ...item, qty: item.qty + qty } : item);
      }
      return [...prev, { id: prod.id, name: prod.name, qty: qty, price: prod.price }];
    });

    setProductInput('');
    setProductQty('1');
  };

  const handleRemoveDeliveryItem = (id) => {
    setDeliveryCart(prev => prev.filter(item => item.id !== id));
  };

  const handleProcessDelivery = async () => {
    if (!selectedClientId) return alert('Seleccione un cliente.');
    if (deliveryCart.length === 0) return alert('La entrega debe tener al menos un producto.');

    const clientObj = clients.find(c => c.id.toString() === selectedClientId);

    try {
      setLoading(true);
      const res = await api.post('/entregas', {
        clienteId: selectedClientId,
        repartidorId: sellers.find(s => s.name === selectedSellerName)?.id || null,
        address: deliveryAddress || clientObj?.address || '',
        items: deliveryCart
      });

      if (res.success) {
        // Disparar ticket de orden de entrega
        onTriggerPrint({
          docTitle: 'ORDEN DE ENTREGA',
          numDoc: res.entrega.ref,
          dateStr: new Date().toLocaleString(),
          customerName: clientObj.name,
          customerDoc: clientObj.doc,
          docLabelTitle: clientObj.type === 'EMPRESA' ? 'RUC' : 'DNI',
          sellerName: selectedSellerName || 'Sin asignar',
          payMethod: 'ENTREGA A DOMICILIO',
          items: deliveryCart,
          total: deliveryCart.reduce((acc, curr) => acc + (curr.qty * curr.price), 0),
          isFiscal: false,
        });

        setTimeout(() => window.print(), 100);

        setShowModal(false);
        await loadDeliveries();
        alert('Orden de entrega generada.');
      }
    } catch (err) {
      alert('Error procesando entrega: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsDelivered = async (id, ref) => {
    if (window.confirm(`¿Confirmar que la orden ${ref} ha sido entregada?`)) {
      try {
        await api.patch(`/entregas/${id}/estado`, { status: 'ENTREGADO' });
        await loadDeliveries();
      } catch (err) {
        alert('Error cambiando estado: ' + err.message);
      }
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Control de Entregas</h2>
          <p className="text-xs text-slate-500">Monitoreo en tiempo real (Polling 2s & Re-fetch instantáneo al tocar pantalla)</p>
        </div>
        <button
          onClick={handleOpenDeliveryModal}
          className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors"
        >
          <i className="fa-solid fa-plus mr-2"></i>Nueva Entrega
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {deliveries.map(d => {
          const isDelivered = d.status === 'Entregado';
          return (
            <div
              key={d.id}
              className={`bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col transition-all ${
                isDelivered ? 'opacity-75' : ''
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <span className="font-bold text-slate-700">{d.ref}</span>
                <span className={`${isDelivered ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'} px-2 py-1 rounded text-xs font-bold`}>
                  {d.status}
                </span>
              </div>
              <h4 className="font-bold text-lg text-slate-800 mb-1">{d.client}</h4>
              <p className="text-slate-500 text-sm mb-1">
                <i className="fa-solid fa-id-badge mr-1"></i> Repartidor: <span className="font-semibold text-slate-700">{d.seller}</span>
              </p>
              <p className="text-slate-500 text-sm mb-2">
                <i className="fa-solid fa-map-location-dot mr-1"></i> {d.address}
              </p>
              <p className="text-slate-400 text-xs mb-4">
                <i className="fa-regular fa-calendar mr-1"></i> {d.date}
              </p>
              <div className="bg-slate-100 rounded p-2 text-xs text-slate-600 mb-4 flex-1">
                <span className="font-bold block mb-1">Carga:</span> {d.items}
              </div>

              {!isDelivered ? (
                <button
                  onClick={() => handleMarkAsDelivered(d.id, d.ref)}
                  className="w-full mt-2 bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded text-xs transition-colors"
                >
                  <i className="fa-solid fa-check mr-1"></i> Marcar Entregado
                </button>
              ) : (
                <div className="w-full mt-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold py-2 rounded text-xs text-center">
                  <i className="fa-solid fa-check-double mr-1"></i> Entregado
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Programar Entrega */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg"><i className="fa-solid fa-truck-ramp-box mr-2"></i> Programar Nueva Entrega</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-300 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-4 bg-slate-50 border-b border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Seleccionar Cliente</label>
                <select
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 bg-white text-sm"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Repartidor Asignado</label>
                <select
                  value={selectedSellerName}
                  onChange={e => setSelectedSellerName(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 bg-white text-sm"
                >
                  <option value="">-- Seleccionar --</option>
                  {sellers.map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Dirección de Entrega</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  placeholder="Ej: Av. Los Rosales 123..."
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                />
              </div>
            </div>

            <div className="p-4 border-b border-gray-100 flex gap-2 shrink-0 bg-white items-center">
              <div className="flex-1 relative">
                <i className="fa-solid fa-barcode absolute left-3 top-3 text-orange-500"></i>
                <input
                  list="deliv-prod-list"
                  value={productInput}
                  onChange={e => setProductInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddDeliveryItem()}
                  placeholder="Escanear código o buscar nombre..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded outline-none focus:border-orange-500 bg-white text-sm"
                />
                <datalist id="deliv-prod-list">
                  {products.map(p => (
                    <option key={p.id} value={`${p.code} - ${p.name}`}>Disp: {p.stock}</option>
                  ))}
                </datalist>
              </div>
              <input
                type="number"
                value={productQty}
                onChange={e => setProductQty(e.target.value)}
                className="w-20 border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
              />
              <button
                onClick={handleAddDeliveryItem}
                className="bg-slate-800 text-white font-bold px-4 py-2 rounded shadow hover:bg-slate-700 text-sm"
              >
                Agregar
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-gray-50">
              <table className="w-full text-left border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Cant.</th>
                    <th className="px-3 py-2">Acción</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {deliveryCart.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2 font-bold">{item.qty}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => handleRemoveDeliveryItem(item.id)} className="text-red-500 hover:text-red-700">
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-white border-t flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 font-bold text-slate-600 bg-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleProcessDelivery} disabled={loading} className="px-6 py-2 font-bold text-white bg-orange-600 rounded-lg shadow-md text-sm">
                <i className="fa-solid fa-print mr-2"></i>Generar Nota de Venta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
