import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';
import { formatSoles } from '../utils/currency.js';

const REFRESH_MS = 5000;

function minutesAgo(date) {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// Cola de ventas cobradas que esperan salir del local: por etapas, todo lo cobrado; en los demás modos,
// las ventas con envío a domicilio (se entregan al repartidor). La atiende quien la sucursal eligió.
export default function DispatchQueuePage() {
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null);
  const [dispatching, setDispatching] = useState(false);

  const selected = orders.find(o => o.id === selectedId) || null;

  const loadOrders = async () => {
    try {
      setOrders(await api.get('/pedidos?status=PAID'));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar la cola de despacho.');
    }
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^n°?\s*/, '');
    if (!q) return orders;
    return orders.filter(o => String(o.id) === q || o.customer.toLowerCase().includes(q) || (o.numDoc || '').toLowerCase().includes(q));
  }, [orders, search]);

  const handleSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    const number = parseInt(search.replace(/\D/g, ''), 10);
    const match = orders.find(o => o.id === number) || (filtered.length === 1 ? filtered[0] : null);
    if (match) {
      setSelectedId(match.id);
      setNotice(null);
      setSearch('');
    } else {
      setNotice({ type: 'warning', text: `No hay un pedido pagado pendiente de entrega con el número ${search}.` });
    }
  };

  const dispatchSelected = async () => {
    if (!selected) return;
    try {
      setDispatching(true);
      await api.post(`/pedidos/${selected.id}/despachar`, {});
      setNotice({ type: 'success', text: `Pedido N° ${selected.id} entregado.` });
      setSelectedId(null);
      loadOrders();
    } catch (err) {
      setNotice({ type: 'warning', text: err.message || 'No se pudo registrar la entrega.' });
      loadOrders();
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="tab-content active h-full p-3 sm:p-4 overflow-y-auto lg:overflow-hidden">
      {/* Contenedor propio: .tab-content fuerza columna y no dejaría aplicar lg:flex-row. */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:min-h-0">
      {/* ===== COLA ===== */}
      <div className="lg:w-[400px] flex flex-col bg-surface rounded-xl shadow-sm border border-line lg:overflow-hidden shrink-0">
        <div className="p-4 border-b border-line flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-ink flex items-center gap-2">
              <i className="fa-solid fa-dolly text-brand"></i> Pedidos por despachar
            </h3>
            <span className="bg-brand-soft text-brand-text text-xs font-bold px-2.5 py-1 rounded-full">{orders.length}</span>
          </div>
          <div className="relative">
            <i className="fa-solid fa-hashtag absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm"></i>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="N° de pedido, comprobante o cliente"
              className="w-full pl-9 pr-3 py-2.5 border border-line rounded-lg outline-none focus:border-brand text-sm"
            />
          </div>
        </div>

        <div className="flex-1 lg:overflow-y-auto p-3 flex flex-col gap-2 min-h-[160px]">
          {loadError ? (
            <p className="text-sm text-danger text-center py-8">{loadError}</p>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted py-12">
              <i className="fa-solid fa-box-open text-3xl mb-2 text-muted"></i>
              <p className="text-sm font-semibold">{orders.length === 0 ? 'No hay pedidos por entregar' : 'Ningún pedido coincide'}</p>
            </div>
          ) : filtered.map(order => (
            <button
              key={order.id}
              onClick={() => { setSelectedId(order.id); setNotice(null); }}
              className={`text-left rounded-lg border p-3 transition-colors ${
                order.id === selectedId ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-line hover:border-brand/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-black text-ink">N° {order.id}</span>
                {order.delivery ? (
                  <span className="text-xs font-bold text-info bg-info-soft px-2 py-0.5 rounded-full">
                    <i className="fa-solid fa-truck-fast mr-1"></i>Envío
                  </span>
                ) : (
                  <span className="text-xs font-bold text-success bg-success-soft px-2 py-0.5 rounded-full">Retira</span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted mt-0.5">
                <span className="truncate">{order.customer} · {order.items.length} prod.</span>
                <span className="shrink-0">pagó {minutesAgo(order.paidAt)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ===== DETALLE ===== */}
      <div className="flex-1 flex flex-col bg-surface rounded-xl shadow-sm border border-line lg:overflow-hidden min-h-[300px]">
        {notice && (
          <div className={`px-4 py-2.5 border-b text-sm flex justify-between gap-2 ${
            notice.type === 'success' ? 'bg-success-soft border-success/30 text-success' : 'bg-warning-soft border-warning/30 text-warning'
          }`}>
            <span><i className={`fa-solid ${notice.type === 'success' ? 'fa-circle-check' : 'fa-circle-info'} mr-1.5`}></i>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100"><i className="fa-solid fa-xmark"></i></button>
          </div>
        )}

        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-muted p-8">
            <i className="fa-solid fa-dolly text-4xl mb-3 text-nav-ink"></i>
            <p className="text-sm font-semibold text-muted">Elija un pedido de la cola</p>
            <p className="text-xs mt-1">o escriba el número que trae el cliente y presione Enter.</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-line flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Pedido</p>
                <p className="text-3xl font-black text-ink">N° {selected.id}</p>
                <p className="text-xs text-muted mt-1">{selected.customer} · Comprobante {selected.numDoc}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">Pagado</p>
                <p className="text-xl font-black text-success tabular-nums">{formatSoles(selected.total)}</p>
              </div>
            </div>

            <div className="flex-1 lg:overflow-y-auto p-5">
              {selected.delivery && (
                <div className="mb-4 rounded-lg bg-info-soft border border-info/30 px-4 py-3 text-sm text-info">
                  <p className="font-bold"><i className="fa-solid fa-truck-fast mr-1.5"></i>Envío a domicilio · {selected.delivery.ref}</p>
                  <p className="text-xs mt-0.5">Entregue estos productos al repartidor, no al cliente. Destino: {selected.delivery.address}</p>
                </div>
              )}
              <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Productos a entregar</p>
              <ul className="flex flex-col gap-2">
                {selected.items.map(item => (
                  <li key={item.id} className="flex items-center gap-3 border border-line rounded-lg px-3 py-2.5">
                    <span className="w-12 h-12 shrink-0 rounded-lg bg-brand-soft text-brand-text font-black text-xl flex items-center justify-center">
                      {item.qty}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink leading-snug">{item.name}</p>
                      <p className="text-[11px] font-mono text-muted">{item.code}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 border-t border-line bg-surface-muted">
              <button
                onClick={dispatchSelected}
                disabled={dispatching}
                className="w-full py-3 font-bold text-white bg-success hover:brightness-95 rounded-lg text-base shadow-md transition-colors disabled:opacity-60"
              >
                {dispatching
                  ? <><i className="fa-solid fa-spinner fa-spin mr-2"></i> Registrando…</>
                  : <><i className="fa-solid fa-check-double mr-2"></i> Marcar como entregado</>}
              </button>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
