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

// Cola de pedidos pagados que esperan ser entregados en almacén (modo por etapas).
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
    <div className="tab-content active h-full p-3 sm:p-4 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4">
      {/* ===== COLA ===== */}
      <div className="lg:w-[400px] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 lg:overflow-hidden shrink-0">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <i className="fa-solid fa-dolly text-orange-600"></i> Pedidos por despachar
            </h3>
            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full">{orders.length}</span>
          </div>
          <div className="relative">
            <i className="fa-solid fa-hashtag absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="N° de pedido, comprobante o cliente"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-orange-500 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 lg:overflow-y-auto p-3 flex flex-col gap-2 min-h-[160px]">
          {loadError ? (
            <p className="text-sm text-red-600 text-center py-8">{loadError}</p>
          ) : filtered.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              <i className="fa-solid fa-box-open text-3xl mb-2 text-slate-300"></i>
              <p className="text-sm font-semibold">{orders.length === 0 ? 'No hay pedidos por entregar' : 'Ningún pedido coincide'}</p>
            </div>
          ) : filtered.map(order => (
            <button
              key={order.id}
              onClick={() => { setSelectedId(order.id); setNotice(null); }}
              className={`text-left rounded-lg border p-3 transition-colors ${
                order.id === selectedId ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-slate-200 hover:border-orange-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-black text-slate-900">N° {order.id}</span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Pagado</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-0.5">
                <span className="truncate">{order.customer} · {order.items.length} prod.</span>
                <span className="shrink-0">pagó {minutesAgo(order.paidAt)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ===== DETALLE ===== */}
      <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 lg:overflow-hidden min-h-[300px]">
        {notice && (
          <div className={`px-4 py-2.5 border-b text-sm flex justify-between gap-2 ${
            notice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <span><i className={`fa-solid ${notice.type === 'success' ? 'fa-circle-check' : 'fa-circle-info'} mr-1.5`}></i>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100"><i className="fa-solid fa-xmark"></i></button>
          </div>
        )}

        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 p-8">
            <i className="fa-solid fa-dolly text-4xl mb-3 text-slate-200"></i>
            <p className="text-sm font-semibold text-slate-500">Elija un pedido de la cola</p>
            <p className="text-xs mt-1">o escriba el número que trae el cliente y presione Enter.</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">Pedido</p>
                <p className="text-3xl font-black text-slate-900">N° {selected.id}</p>
                <p className="text-xs text-slate-500 mt-1">{selected.customer} · Comprobante {selected.numDoc}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Pagado</p>
                <p className="text-xl font-black text-emerald-700 tabular-nums">{formatSoles(selected.total)}</p>
              </div>
            </div>

            <div className="flex-1 lg:overflow-y-auto p-5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Productos a entregar</p>
              <ul className="flex flex-col gap-2">
                {selected.items.map(item => (
                  <li key={item.id} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2.5">
                    <span className="w-12 h-12 shrink-0 rounded-lg bg-orange-100 text-orange-700 font-black text-xl flex items-center justify-center">
                      {item.qty}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 leading-snug">{item.name}</p>
                      <p className="text-[11px] font-mono text-slate-400">{item.code}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 border-t border-gray-200 bg-slate-50">
              <button
                onClick={dispatchSelected}
                disabled={dispatching}
                className="w-full py-3 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg text-base shadow-md transition-colors disabled:opacity-60"
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
  );
}
