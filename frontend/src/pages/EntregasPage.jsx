import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import { formatSoles } from '../utils/currency.js';
import { useConfirm } from '../components/ui/index.js';

const REFRESH_MS = 5000;

const STATUS_BADGE = {
  ENTREGADO: { label: 'Entregado', className: 'bg-success-soft text-success' },
  CANCELADO: { label: 'Cancelado', className: 'bg-surface-muted text-ink-soft' },
};

const formatTime = (date) => (date ? new Date(date).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '');
const mapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

function DeliveryCard({ delivery, busy, onDepart, onDeliver, onCancel }) {
  const active = delivery.status === 'PENDIENTE' || delivery.status === 'EN_CAMINO';
  const badge = STATUS_BADGE[delivery.status];

  return (
    <div className="bg-surface rounded-xl border border-line shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-ink truncate">{delivery.contactName}</p>
          <p className="text-[11px] text-muted font-mono">
            {delivery.ref}{delivery.saleNumDoc && ` · ${delivery.saleNumDoc}`}
          </p>
        </div>
        {badge ? (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge.className}`}>{badge.label}</span>
        ) : delivery.total !== null && (
          <span className="text-xs font-bold text-success bg-success-soft px-2 py-0.5 rounded-full shrink-0">Pagado {formatSoles(delivery.total)}</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <a href={mapsUrl(delivery.address)} target="_blank" rel="noreferrer" className="text-ink-soft hover:text-brand flex gap-2">
          <i className="fa-solid fa-location-dot text-brand mt-0.5"></i>
          <span className="underline decoration-dotted">{delivery.address}</span>
        </a>
        {delivery.contactPhone && (
          <a href={`tel:${delivery.contactPhone}`} className="text-ink-soft hover:text-brand flex gap-2 items-center">
            <i className="fa-solid fa-phone text-brand"></i> {delivery.contactPhone}
          </a>
        )}
        {delivery.notes && (
          <p className="text-xs text-muted bg-surface-muted rounded px-2 py-1"><i className="fa-solid fa-note-sticky mr-1"></i>{delivery.notes}</p>
        )}
      </div>

      <ul className="text-xs text-ink-soft bg-surface-muted rounded-lg p-2 flex flex-col gap-0.5">
        {delivery.items.map((item, i) => (
          <li key={i}><span className="font-bold">{item.qty}×</span> {item.name}</li>
        ))}
      </ul>

      {active ? (
        <>
          {/* En camino: quien lo lleva es quien lo sacó a repartir. */}
          {delivery.status === 'EN_CAMINO' && delivery.courier && (
            <p className="text-xs text-ink-soft flex items-center gap-2">
              <i className="fa-solid fa-truck-fast text-brand"></i>
              Lleva: <span className="font-semibold text-ink">{delivery.courier.name}</span>
            </p>
          )}

          {delivery.waitingDispatch ? (
            <p className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2">
              <i className="fa-solid fa-hourglass-half mr-1.5"></i>Esperando que almacén despache los productos.
            </p>
          ) : delivery.status === 'PENDIENTE' ? (
            // Por salir: el pedido está libre; se lo lleva el repartidor que lo saque.
            <button
              onClick={() => onDepart(delivery)}
              disabled={busy}
              className="w-full bg-panel hover:bg-panel-strong text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              <i className="fa-solid fa-truck-fast mr-1.5"></i>Salir a repartir
            </button>
          ) : (
            // En camino: solo queda cerrarlo.
            <button
              onClick={() => onDeliver(delivery)}
              disabled={busy}
              className="w-full bg-success hover:brightness-95 text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              <i className="fa-solid fa-check mr-1.5"></i>Entregado
            </button>
          )}

          {delivery.status === 'PENDIENTE' && !delivery.legacy && (
            <button onClick={() => onCancel(delivery)} disabled={busy} className="text-xs font-semibold text-muted hover:text-danger">
              Cancelar envío (el cliente recoge en tienda)
            </button>
          )}
        </>
      ) : (
        <p className="text-[11px] text-muted">
          {delivery.courier && <>Repartidor: {delivery.courier.name} · </>}
          {delivery.status === 'ENTREGADO' ? `Entregado ${formatTime(delivery.deliveredAt)}` : `Registrado ${formatTime(delivery.createdAt)}`}
        </p>
      )}
    </div>
  );
}

function Column({ title, icon, deliveries, emptyText, renderCard }) {
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <h3 className="text-sm font-bold text-ink-soft flex items-center gap-2">
        <i className={`fa-solid ${icon} text-brand`}></i>{title}
        <span className="bg-surface-muted text-ink-soft text-[11px] px-2 py-0.5 rounded-full">{deliveries.length}</span>
      </h3>
      {deliveries.length === 0 ? (
        <p className="text-xs text-muted border border-dashed border-line rounded-xl p-4 text-center">{emptyText}</p>
      ) : deliveries.map(renderCard)}
    </section>
  );
}

function ScheduleDeliveryModal({ onClose, onScheduled }) {
  const [numDoc, setNumDoc] = useState('');
  const [sale, setSale] = useState(null);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const search = async () => {
    setError('');
    setSale(null);
    if (!numDoc.trim()) return setError('Ingrese el número de comprobante.');
    try {
      setWorking(true);
      const found = await api.get(`/entregas/venta/${encodeURIComponent(numDoc.trim())}`);
      if (found.existingDelivery) return setError(`Esta venta ya tiene el envío ${found.existingDelivery}.`);
      setSale(found);
      setAddress(found.customer?.address || '');
      setPhone(found.customer?.phone || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const schedule = async () => {
    setError('');
    if (address.trim().length < 5) return setError('Ingrese la dirección de entrega.');
    try {
      setWorking(true);
      await api.post('/entregas', {
        numDoc: sale.numDoc,
        address: address.trim(),
        contactName: sale.customer?.name || null,
        contactPhone: phone.trim() || null,
        notes: notes.trim() || null,
      });
      onScheduled(sale.numDoc);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm sm:p-4">
      <div className="bg-surface sm:rounded-xl rounded-t-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-5 py-4 bg-panel text-white flex justify-between items-center">
          <h3 className="font-bold"><i className="fa-solid fa-truck-ramp-box mr-2 text-brand"></i>Programar envío de una venta</h3>
          <button onClick={onClose} className="text-muted hover:text-white"><i className="fa-solid fa-xmark text-xl"></i></button>
        </div>
        <div className="p-5 flex flex-col gap-3 overflow-y-auto">
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Comprobante de la venta</label>
            <div className="flex gap-2">
              <input
                autoFocus
                value={numDoc}
                onChange={e => { setNumDoc(e.target.value.toUpperCase()); setSale(null); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Ej. B001-000038"
                className="flex-1 border border-line rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-brand"
              />
              <button onClick={search} disabled={working} className="px-4 rounded-lg bg-panel text-white text-sm font-bold disabled:opacity-50">Buscar</button>
            </div>
          </div>

          {sale && (
            <>
              <div className="rounded-lg bg-surface-muted border border-line p-3 text-sm">
                <p className="font-bold text-ink">{sale.customer?.name || 'Público general'} · {formatSoles(sale.total)}</p>
                <p className="text-xs text-muted">{sale.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Dirección de entrega</label>
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  maxLength={250}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none ${borderClass(error && address.trim().length < 5 ? error : '')}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} placeholder="Teléfono" className="border border-line rounded-lg px-3 py-2 text-sm outline-none" />
                <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} placeholder="Indicaciones" className="border border-line rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
            </>
          )}
          <FieldError msg={error} />
        </div>
        <div className="p-4 border-t border-line bg-surface-muted flex gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg bg-surface-muted text-ink-soft font-bold text-sm">Cancelar</button>
          <button
            onClick={schedule}
            disabled={!sale || working}
            className="flex-1 py-2.5 rounded-lg bg-brand hover:bg-brand-strong text-brand-contrast font-bold text-sm disabled:opacity-50"
          >
            Programar envío
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EntregasPage({ currentUser }) {
  const confirmar = useConfirm();
  const isCourier = currentUser?.role === 'REPARTIDOR';
  const [view, setView] = useState('activas');
  const [onlyMine, setOnlyMine] = useState(isCourier);
  const [deliveries, setDeliveries] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const wakeLockRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ estado: view, ...(onlyMine ? { mias: '1' } : {}) });
      setDeliveries(await api.get(`/entregas?${params}`));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'No se pudieron cargar las entregas.');
    }
  }, [view, onlyMine]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Mantiene la pantalla encendida mientras el repartidor tiene abierta la lista.
  useEffect(() => {
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(lock => { wakeLockRef.current = lock; }).catch(() => {});
    }
    return () => { wakeLockRef.current?.release(); };
  }, []);

  const run = async (delivery, action, successText) => {
    try {
      setBusyId(delivery.id);
      await action();
      if (successText) setNotice({ type: 'success', text: successText });
      await load();
    } catch (err) {
      setNotice({ type: 'warning', text: err.message || 'No se pudo completar la acción.' });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const cardProps = {
    onDepart: (d) => run(d, () => api.post(`/entregas/${d.id}/salir`, {}), `${d.ref} en camino.`),
    onDeliver: async (d) => {
      const seguro = await confirmar({
        title: 'Marcar como entregado',
        description: `${d.ref} fue entregado a ${d.contactName}.`,
        confirmText: 'Sí, se entregó',
      });
      if (seguro) {
        run(d, () => api.post(`/entregas/${d.id}/entregar`, {}), `${d.ref} entregado.`);
      }
    },
    onCancel: (d) => {
      const reason = window.prompt(`Motivo para cancelar el envío ${d.ref} (el cliente recogerá en tienda):`, '');
      if (reason !== null) run(d, () => api.post(`/entregas/${d.id}/cancelar`, { reason }), `Envío ${d.ref} cancelado.`);
    },
  };
  const renderCard = (d) => <DeliveryCard key={d.id} delivery={d} {...cardProps} busy={busyId === d.id} />;

  const waiting = deliveries.filter(d => d.status === 'PENDIENTE' && d.waitingDispatch);
  const ready = deliveries.filter(d => d.status === 'PENDIENTE' && !d.waitingDispatch);
  const onTheWay = deliveries.filter(d => d.status === 'EN_CAMINO');

  return (
    <div className="tab-content active h-full p-3 sm:p-4 overflow-y-auto">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg border border-line bg-surface overflow-hidden text-sm font-bold">
            {[{ id: 'activas', label: 'Activas' }, { id: 'finalizadas', label: 'Finalizadas (7 días)' }].map(tab => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`px-4 py-2 ${view === tab.id ? 'bg-brand text-brand-contrast' : 'text-ink-soft hover:bg-surface-muted'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer">
              <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} className="accent-orange-600 w-4 h-4" />
              Solo mis entregas
            </label>
            <button
              onClick={() => setShowSchedule(true)}
              className="bg-brand hover:bg-brand-strong text-brand-contrast font-bold py-2 px-4 rounded-lg shadow text-sm"
            >
              <i className="fa-solid fa-plus mr-1.5"></i>Programar envío
            </button>
          </div>
        </div>

        {notice && (
          <div className={`rounded-lg px-4 py-2.5 text-sm flex justify-between gap-2 border ${
            notice.type === 'success' ? 'bg-success-soft border-success/30 text-success' : 'bg-warning-soft border-warning/30 text-warning'
          }`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100"><i className="fa-solid fa-xmark"></i></button>
          </div>
        )}
        {loadError && <p className="text-sm text-danger">{loadError}</p>}

        {view === 'activas' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <Column title="Esperando despacho" icon="fa-hourglass-half" deliveries={waiting} emptyText="Nada esperando al almacén." renderCard={renderCard} />
            <Column title="Por salir" icon="fa-box" deliveries={ready} emptyText="No hay envíos listos para salir." renderCard={renderCard} />
            <Column title="En camino" icon="fa-truck-fast" deliveries={onTheWay} emptyText="Ningún repartidor en ruta." renderCard={renderCard} />
          </div>
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-muted text-center py-12">No hay entregas finalizadas en los últimos 7 días.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{deliveries.map(renderCard)}</div>
        )}
      </div>

      {showSchedule && (
        <ScheduleDeliveryModal
          onClose={() => setShowSchedule(false)}
          onScheduled={(numDoc) => {
            setShowSchedule(false);
            setNotice({ type: 'success', text: `Envío de ${numDoc} programado.` });
            setView('activas');
            load();
          }}
        />
      )}
    </div>
  );
}
