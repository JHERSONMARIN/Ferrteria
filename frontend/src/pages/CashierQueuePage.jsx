import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../api.js';
import CheckoutModal from '../components/CheckoutModal.jsx';
import SaleSuccessModal from '../components/SaleSuccessModal.jsx';
import { formatSoles } from '../utils/currency.js';
import { customerOptionLabel } from '../utils/customers.js';
import { buildSaleTicket } from '../utils/tickets.js';

const REFRESH_MS = 5000;

function minutesAgo(date) {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// Cola de pedidos que los vendedores enviaron a caja.
export default function CashierQueuePage({ currentUser, onTriggerPrint, saleFlowMode, deliveriesEnabled = false }) {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [cajaAbierta, setCajaAbierta] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [customerInput, setCustomerInput] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [success, setSuccess] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState('');
  const searchRef = useRef(null);

  const selected = orders.find(o => o.id === selectedId) || null;

  const loadOrders = async () => {
    try {
      setOrders(await api.get('/pedidos?status=PENDING_PAYMENT'));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar la cola de pedidos.');
    }
  };

  const loadCaja = async () => {
    try {
      const data = await api.get('/caja/estado-actual');
      setCajaAbierta(Boolean(data?.abierta));
    } catch {
      setCajaAbierta(null);
    }
  };

  useEffect(() => {
    loadOrders();
    loadCaja();
    api.get('/clientes').then(setClients).catch(() => setClients([]));
    const interval = setInterval(() => { if (!showCheckout) loadOrders(); }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [showCheckout]);

  // Si el pedido elegido desaparece de la cola (otro cajero lo cobró o venció), se avisa.
  useEffect(() => {
    if (selectedId && !showCheckout && !orders.some(o => o.id === selectedId)) {
      setSelectedId(null);
      setNotice(`El pedido N° ${selectedId} ya no está pendiente (fue cobrado, anulado o venció).`);
    }
  }, [orders]);

  const selectOrder = (order) => {
    setSelectedId(order.id);
    setNotice('');
    const customer = clients.find(c => c.id === order.clienteId);
    setCustomerInput(customer ? customerOptionLabel(customer) : '');
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^n°?\s*/, '');
    if (!q) return orders;
    return orders.filter(o => String(o.id) === q || o.customer.toLowerCase().includes(q) || o.seller.toLowerCase().includes(q));
  }, [orders, search]);

  const handleSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    const number = parseInt(search.replace(/\D/g, ''), 10);
    const match = orders.find(o => o.id === number) || (filtered.length === 1 ? filtered[0] : null);
    if (match) {
      selectOrder(match);
      setSearch('');
    } else {
      setNotice(`No hay un pedido pendiente con el número ${search}.`);
    }
  };

  const confirmPayment = async (payment) => {
    const res = await api.post(`/pedidos/${selected.id}/cobrar`, {
      docType: payment.docType,
      payMethod: payment.payMethod,
      mixCash: payment.mixCash,
      mixDigital: payment.mixDigital,
      payCode: payment.payCode,
      clienteId: payment.customer ? payment.customer.id : null,
      delivery: payment.delivery,
    });
    const order = res.pedido;
    window.dispatchEvent(new Event('venta-registrada'));

    if (onTriggerPrint) {
      onTriggerPrint(buildSaleTicket({ ...payment, numDoc: order.numDoc, items: order.items, total: order.total, sellerName: order.seller }));
      setTimeout(() => window.print(), 300);
    }

    const staged = saleFlowMode === 'STAGED';
    const pickupMessage = staged
      ? 'Indique al cliente que recoja sus productos en despacho con este número.'
      : 'Entregue los productos al cliente.';
    setSuccess({
      icon: order.delivery ? 'fa-truck-fast' : staged ? 'fa-dolly' : 'fa-check',
      title: staged ? 'Pedido cobrado' : 'Venta completada',
      highlight: `N° ${order.id}`,
      subtitle: order.delivery
        ? `Se enviará a domicilio (${order.delivery.ref}). ${staged ? 'Almacén lo preparará para el repartidor.' : 'Entregue los productos al repartidor.'}`
        : pickupMessage,
      rows: [{ label: `${order.numDoc} (${payment.payMethod})`, value: formatSoles(order.total) }],
      change: payment.receivedCash !== null ? payment.receivedCash - order.total : null,
      buttonLabel: 'Siguiente pedido',
    });
    setShowCheckout(false);
    setSelectedId(null);
    loadOrders();
  };

  const cancelSelected = async () => {
    if (!selected || !window.confirm(`¿Anular el pedido N° ${selected.id}? Sus productos vuelven a estar disponibles.`)) return;
    try {
      setCancelling(true);
      await api.post(`/pedidos/${selected.id}/anular`, { reason: `Anulado en caja por ${currentUser?.name}` });
      setNotice(`Pedido N° ${selected.id} anulado.`);
      setSelectedId(null);
      loadOrders();
    } catch (err) {
      setNotice(err.message || 'No se pudo anular el pedido.');
    } finally {
      setCancelling(false);
    }
  };

  const closeSuccess = () => {
    setSuccess(null);
    searchRef.current?.focus();
  };

  return (
    <div className="tab-content active h-full p-3 sm:p-4 overflow-y-auto lg:overflow-hidden flex flex-col gap-3">
      {cajaAbierta === false && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <i className="fa-solid fa-lock"></i>
          <span><strong>Su caja está cerrada.</strong> Ábrala en "Arqueo de Caja" para poder cobrar pedidos.</span>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:min-h-0">
        {/* ===== COLA ===== */}
        <div className="lg:w-[400px] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 lg:overflow-hidden shrink-0">
          <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <i className="fa-solid fa-hand-holding-dollar text-orange-600"></i> Pedidos por cobrar
              </h3>
              <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full">{orders.length}</span>
            </div>
            <div className="relative">
              <i className="fa-solid fa-hashtag absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input
                ref={searchRef}
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="N° de pedido, cliente o vendedor"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-orange-500 text-sm"
              />
            </div>
          </div>

          <div className="flex-1 lg:overflow-y-auto p-3 flex flex-col gap-2 min-h-[160px]">
            {loadError ? (
              <p className="text-sm text-red-600 text-center py-8">{loadError}</p>
            ) : filtered.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <i className="fa-solid fa-mug-hot text-3xl mb-2 text-slate-300"></i>
                <p className="text-sm font-semibold">{orders.length === 0 ? 'No hay pedidos esperando' : 'Ningún pedido coincide'}</p>
              </div>
            ) : filtered.map(order => (
              <button
                key={order.id}
                onClick={() => selectOrder(order)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  order.id === selectedId ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-slate-200 hover:border-orange-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black text-slate-900">N° {order.id}</span>
                  <span className="font-black text-slate-900 tabular-nums">{formatSoles(order.total)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 mt-0.5">
                  <span className="truncate">{order.customer} · {order.items.length} prod.</span>
                  <span className="shrink-0">{minutesAgo(order.createdAt)}</span>
                </div>
                <p className="text-[11px] text-slate-400">Vendedor: {order.seller}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ===== DETALLE ===== */}
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 lg:overflow-hidden min-h-[300px]">
          {notice && (
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex justify-between gap-2">
              <span><i className="fa-solid fa-circle-info mr-1.5"></i>{notice}</span>
              <button onClick={() => setNotice('')} className="text-amber-600 hover:text-amber-800"><i className="fa-solid fa-xmark"></i></button>
            </div>
          )}

          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 p-8">
              <i className="fa-solid fa-receipt text-4xl mb-3 text-slate-200"></i>
              <p className="text-sm font-semibold text-slate-500">Elija un pedido de la cola</p>
              <p className="text-xs mt-1">o escriba el número que trae el cliente y presione Enter.</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">Pedido</p>
                  <p className="text-3xl font-black text-slate-900">N° {selected.id}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {selected.customer} · Vendedor: {selected.seller} · {minutesAgo(selected.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-3xl font-black text-slate-900 tabular-nums">{formatSoles(selected.total)}</p>
                </div>
              </div>

              <div className="flex-1 lg:overflow-y-auto px-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="py-2">Producto</th>
                      <th className="py-2 text-right">Cant.</th>
                      <th className="py-2 text-right">P. unit.</th>
                      <th className="py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selected.items.map(item => (
                      <tr key={item.id}>
                        <td className="py-2.5 text-slate-800">{item.name}<span className="block text-[10px] font-mono text-slate-400">{item.code}</span></td>
                        <td className="py-2.5 text-right font-bold">{item.qty}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatSoles(item.price)}</td>
                        <td className="py-2.5 text-right font-bold tabular-nums">{formatSoles(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t border-gray-200 bg-slate-50 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={cancelSelected}
                  disabled={cancelling}
                  className="px-4 py-3 font-bold text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-lg text-sm disabled:opacity-50"
                >
                  <i className="fa-solid fa-ban mr-1.5"></i> Anular pedido
                </button>
                <button
                  onClick={() => setShowCheckout(true)}
                  disabled={cajaAbierta === false}
                  className="flex-1 py-3 font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg text-base shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="fa-solid fa-cash-register mr-2"></i> Cobrar {formatSoles(selected.total)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showCheckout && selected && (
        <CheckoutModal
          title={`Pedido N° ${selected.id}`}
          total={selected.total}
          units={selected.items.length}
          clients={clients}
          customerInput={customerInput}
          onCustomerInputChange={setCustomerInput}
          onClose={() => setShowCheckout(false)}
          onConfirm={confirmPayment}
          allowDelivery={deliveriesEnabled}
        />
      )}

      {success && <SaleSuccessModal {...success} onClose={closeSuccess} />}
    </div>
  );
}
