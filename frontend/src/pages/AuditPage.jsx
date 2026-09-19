import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

// Color por tipo de acción: rojo para anulaciones/bajas, ámbar para dinero y precios.
const ACTION_STYLE = {
  SALE_CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  QUOTE_CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  DELIVERY_CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  USER_DELETED: 'bg-red-50 text-red-700 border-red-200',
  DISCOUNT_APPLIED: 'bg-amber-50 text-amber-700 border-amber-200',
  PRICE_CHANGED: 'bg-amber-50 text-amber-700 border-amber-200',
  CASH_CLOSED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CREDIT_LIMIT_CHANGED: 'bg-amber-50 text-amber-700 border-amber-200',
};
const DEFAULT_STYLE = 'bg-slate-100 text-slate-700 border-slate-200';

const EMPTY_FILTERS = { action: '', userId: '', from: '', to: '' };

const formatDateTime = (value) => new Date(value).toLocaleString('es-PE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

// Los cambios con forma { campo: { before, after } } se muestran como tabla antes/después.
function AuditDetails({ details }) {
  if (!details) return <p className="text-xs text-slate-400">Sin detalle adicional.</p>;
  const entries = Object.entries(details);
  const isDiff = entries.every(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && 'before' in v && 'after' in v);

  if (isDiff) {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 pr-3 font-semibold">Campo</th>
            <th className="py-1 pr-3 font-semibold">Antes</th>
            <th className="py-1 font-semibold">Después</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([field, change]) => (
            <tr key={field} className="border-t border-slate-200 align-top">
              <td className="py-1 pr-3 font-mono text-slate-600">{field}</td>
              <td className="py-1 pr-3 text-red-700 break-all">{formatValue(change.before)}</td>
              <td className="py-1 text-emerald-700 break-all">{formatValue(change.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="font-mono text-slate-500">{key}</dt>
          <dd className="text-slate-800 break-all">{formatValue(value)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export default function AuditPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ page: String(page) });
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      setData(await api.get(`/auditoria?${params}`));
    } catch (err) {
      setError(err.message || 'No se pudo cargar la auditoría.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/personal').then(setStaff).catch(() => setStaff([]));
  }, []);

  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const hasFilters = Object.values(filters).some(Boolean);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const selectClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-500';

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-gray-100 bg-slate-50 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="bg-slate-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
              <i className="fa-solid fa-shield-halved"></i> Administración
            </span>
            <h3 className="font-bold text-slate-800 text-lg">Auditoría {data && <span className="text-slate-400 font-normal text-sm">({data.total} registros)</span>}</h3>
          </div>
          <p className="text-xs text-slate-500">
            Anulaciones, descuentos, cambios de precio, cierres de caja, ajustes de stock y cambios de configuración o de personal.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <select value={filters.action} onChange={e => setFilter('action', e.target.value)} className={selectClass} aria-label="Acción">
              <option value="">Todas las acciones</option>
              {data && Object.entries(data.actions).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <select value={filters.userId} onChange={e => setFilter('userId', e.target.value)} className={selectClass} aria-label="Usuario">
              <option value="">Todos los usuarios</option>
              {staff.map(u => <option key={u.id} value={u.id}>{u.name} ({u.user})</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Desde
              <input type="date" value={filters.from} onChange={e => setFilter('from', e.target.value)} className={`${selectClass} flex-1`} />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Hasta
              <input type="date" value={filters.to} onChange={e => setFilter('to', e.target.value)} className={`${selectClass} flex-1`} />
            </label>
            <button
              type="button"
              onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}
              disabled={!hasFilters}
              className="px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-40"
            >
              <i className="fa-solid fa-filter-circle-xmark mr-1.5"></i> Limpiar filtros
            </button>
          </div>
        </div>

        <div className="flex-1 p-4">
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          {loading && !data && <p className="text-sm text-slate-400"><i className="fa-solid fa-spinner fa-spin mr-2"></i>Cargando…</p>}
          {data && data.items.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <i className="fa-solid fa-clipboard-check text-4xl mb-3"></i>
              <p className="text-sm">{hasFilters ? 'No hay registros con estos filtros.' : 'Todavía no hay registros de auditoría.'}</p>
            </div>
          )}

          {data && data.items.length > 0 && (
            <ul className={`divide-y divide-slate-100 ${loading ? 'opacity-60' : ''}`}>
              {data.items.map(item => {
                const open = expanded === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : item.id)}
                      aria-expanded={open}
                      className="w-full text-left py-3 px-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 hover:bg-slate-50 rounded-lg"
                    >
                      <span className="text-xs text-slate-500 tabular-nums sm:w-36 shrink-0">{formatDateTime(item.createdAt)}</span>
                      <span className={`self-start sm:self-auto px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${ACTION_STYLE[item.action] || DEFAULT_STYLE}`}>
                        {item.actionLabel}
                      </span>
                      <span className="text-sm text-slate-800 flex-1 min-w-0">{item.summary}</span>
                      <span className="text-xs text-slate-500 sm:w-32 shrink-0 sm:text-right">
                        <i className="fa-solid fa-user mr-1 text-slate-400"></i>{item.userName}
                      </span>
                      <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-slate-400 text-xs hidden sm:block`}></i>
                    </button>
                    {open && (
                      <div className="mx-2 mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <AuditDetails details={item.details} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {data && totalPages > 1 && (
          <div className="p-3 border-t border-gray-100 flex justify-between items-center text-sm">
            <button
              type="button"
              onClick={() => setPage(p => p - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-100"
            >
              <i className="fa-solid fa-chevron-left mr-1"></i> Anteriores
            </button>
            <span className="text-slate-500">Página {page} de {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-100"
            >
              Siguientes <i className="fa-solid fa-chevron-right ml-1"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
