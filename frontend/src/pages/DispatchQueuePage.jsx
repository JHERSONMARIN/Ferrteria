import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';
import { formatSoles } from '../utils/currency.js';

const REFRESH_MS = 5000;

const formatHour = (date) => (date ? new Date(date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '');

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
  // Con envío a domicilio hay que registrar a qué repartidor se le entrega la mercadería.
  const [couriers, setCouriers] = useState([]);
  const [courierId, setCourierId] = useState('');
  const [dispatchedToday, setDispatchedToday] = useState([]);
  const [view, setView] = useState('cola');

  const selected = orders.find(o => o.id === selectedId) || null;

  const loadOrders = async () => {
    try {
      const [pendientes, hoy] = await Promise.all([
        api.get('/pedidos?status=PAID'),
        api.get('/pedidos/despachados-hoy').catch(() => []),
      ]);
      setOrders(pendientes);
      setDispatchedToday(hoy);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar la cola de despacho.');
    }
  };

  // Repartidores de la sucursal, para decir a quién se le entrega cada envío.
  useEffect(() => {
    api.get('/personal')
      .then(staff => setCouriers(staff.filter(persona => persona.active !== false && (
        persona.role === 'REPARTIDOR' || persona.role === 'ADMINISTRADOR'
        || (Array.isArray(persona.modules) && persona.modules.includes('deliveries'))
      ))))
      .catch(() => setCouriers([]));
  }, []);

  // Al elegir un pedido se propone el repartidor que lo solicitó.
  useEffect(() => {
    setCourierId(selected?.delivery?.courier?.id ? String(selected.delivery.courier.id) : '');
  }, [selectedId]);

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
      await api.post(`/pedidos/${selected.id}/despachar`,
        selected.delivery ? { repartidorId: Number(courierId) } : {});
      setNotice({
        type: 'success',
        text: selected.delivery
          ? `Pedido N° ${selected.id} entregado a ${couriers.find(c => String(c.id) === courierId)?.name ?? 'el repartidor'}.`
          : `Pedido N° ${selected.id} entregado.`,
      });
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
          <div className="flex items-center gap-1 bg-surface-muted rounded-xl p-1">
            <button
              onClick={() => setView('cola')}
              className={`flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors ${
                view === 'cola' ? 'bg-brand text-brand-contrast shadow-card' : 'text-ink-soft hover:bg-surface'
              }`}
            >
              Por despachar ({orders.length})
            </button>
            <button
              onClick={() => setView('hoy')}
              className={`flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors ${
                view === 'hoy' ? 'bg-brand text-brand-contrast shadow-card' : 'text-ink-soft hover:bg-surface'
              }`}
            >
              Despachado hoy ({dispatchedToday.length})
            </button>
          </div>
          <div className={`relative ${view === 'cola' ? '' : 'hidden'}`}>
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
          {view === 'hoy' ? (
            dispatchedToday.length === 0 ? (
              <div className="text-center text-muted py-12">
                <i className="fa-solid fa-boxes-packing text-3xl mb-2"></i>
                <p className="text-sm font-semibold">Todavía no salió nada hoy</p>
              </div>
            ) : dispatchedToday.map(order => (
              <div key={order.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-ink">N° {order.id}</span>
                  <span className="text-xs text-muted shrink-0">{formatHour(order.dispatchedAt)}</span>
                </div>
                <p className="text-xs text-muted truncate">{order.customer} · {order.items.length} prod.</p>
                <p className="text-xs mt-1 flex items-center gap-1.5">
                  {order.delivery ? (
                    <>
                      <i className="fa-solid fa-truck-fast text-info"></i>
                      <span className="text-ink-soft">
                        Se lo llevó <span className="font-semibold text-ink">{order.delivery.courier?.name ?? 'un repartidor'}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-hand-holding-heart text-success"></i>
                      <span className="text-ink-soft">Lo recogió el cliente en tienda</span>
                    </>
                  )}
                </p>
                {order.dispatchedBy && <p className="text-[11px] text-muted mt-0.5">Despachó {order.dispatchedBy}</p>}
              </div>
            ))
          ) : loadError ? (
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
                <div className="mb-4 flex flex-col gap-3">
                  <div className="rounded-lg bg-info-soft border border-info/30 px-4 py-3 text-sm text-info">
                    <p className="font-bold"><i className="fa-solid fa-truck-fast mr-1.5"></i>Envío a domicilio · {selected.delivery.ref}</p>
                    <p className="text-xs mt-0.5">Entregue estos productos al repartidor, no al cliente. Destino: {selected.delivery.address}</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-muted uppercase tracking-wide mb-1 block">
                      ¿A qué repartidor se lo entrega?
                    </label>
                    <select
                      value={courierId}
                      onChange={e => setCourierId(e.target.value)}
                      className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-surface outline-none focus:border-brand"
                    >
                      <option value="">Elija el repartidor</option>
                      {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <p className="text-[11px] text-muted mt-1">
                      {selected.delivery.courier
                        ? `${selected.delivery.courier.name} solicitó este pedido.`
                        : 'Nadie lo solicitó todavía: elija a quién se lleva la mercadería.'}
                    </p>
                  </div>
                </div>
              )}
              <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Productos a entregar</p>
              <ul className="flex flex-col gap-2">
                {selected.items.map(item => (
                  <li key={`${item.id}:${item.unitId ?? 0}`} className="flex items-center gap-3 border border-line rounded-lg px-3 py-2.5">
                    <span className="w-12 h-12 shrink-0 rounded-lg bg-brand-soft text-brand-text font-black text-xl flex items-center justify-center">
                      {item.qty}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink leading-snug">{item.name}</p>
                      {item.unitName && (
                        <p className="text-xs font-bold text-brand-text">{item.unitName} ({item.factor} c/u)</p>
                      )}
                      <p className="text-[11px] font-mono text-muted">{item.code}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 border-t border-line bg-surface-muted">
              <button
                onClick={dispatchSelected}
                disabled={dispatching || (selected.delivery && !courierId)}
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
