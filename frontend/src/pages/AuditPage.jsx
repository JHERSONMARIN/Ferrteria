import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

// Color por tipo de acción: rojo para anulaciones/bajas, ámbar para dinero y precios.
const ACTION_STYLE = {
  SALE_CANCELLED: 'bg-danger-soft text-danger border-danger/30',
  QUOTE_CANCELLED: 'bg-danger-soft text-danger border-danger/30',
  DELIVERY_CANCELLED: 'bg-danger-soft text-danger border-danger/30',
  USER_DELETED: 'bg-danger-soft text-danger border-danger/30',
  DISCOUNT_APPLIED: 'bg-warning-soft text-warning border-warning/30',
  PRICE_CHANGED: 'bg-warning-soft text-warning border-warning/30',
  CASH_CLOSED: 'bg-success-soft text-success border-success/30',
  CREDIT_LIMIT_CHANGED: 'bg-warning-soft text-warning border-warning/30',
};
const DEFAULT_STYLE = 'bg-surface-muted text-ink-soft border-line';

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
  if (!details) return <p className="text-xs text-muted">Sin detalle adicional.</p>;
  const entries = Object.entries(details);
  const isDiff = entries.every(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && 'before' in v && 'after' in v);

  if (isDiff) {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-3 font-semibold">Campo</th>
            <th className="py-1 pr-3 font-semibold">Antes</th>
            <th className="py-1 font-semibold">Después</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([field, change]) => (
            <tr key={field} className="border-t border-line align-top">
              <td className="py-1 pr-3 font-mono text-ink-soft">{field}</td>
              <td className="py-1 pr-3 text-danger break-all">{formatValue(change.before)}</td>
              <td className="py-1 text-success break-all">{formatValue(change.after)}</td>
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
          <dt className="font-mono text-muted">{key}</dt>
          <dd className="text-ink break-all">{formatValue(value)}</dd>
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
  const selectClass = 'border border-line rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:border-brand';

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-line bg-surface-muted flex flex-col gap-3">
          {data && <p className="text-sm font-bold text-ink">{data.total} registro{data.total === 1 ? '' : 's'}</p>}
          <p className="text-xs text-muted">
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
            <label className="flex items-center gap-2 text-xs text-muted">
              Desde
              <input type="date" value={filters.from} onChange={e => setFilter('from', e.target.value)} className={`${selectClass} flex-1`} />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              Hasta
              <input type="date" value={filters.to} onChange={e => setFilter('to', e.target.value)} className={`${selectClass} flex-1`} />
            </label>
            <button
              type="button"
              onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}
              disabled={!hasFilters}
              className="px-3 py-2 text-sm font-semibold text-ink-soft border border-line rounded-lg bg-surface hover:bg-surface-muted disabled:opacity-40"
            >
              <i className="fa-solid fa-filter-circle-xmark mr-1.5"></i> Limpiar filtros
            </button>
          </div>
        </div>

        <div className="flex-1 p-4">
          {error && <p className="text-sm text-danger mb-3">{error}</p>}
          {loading && !data && <p className="text-sm text-muted"><i className="fa-solid fa-spinner fa-spin mr-2"></i>Cargando…</p>}
          {data && data.items.length === 0 && (
            <div className="text-center py-16 text-muted">
              <i className="fa-solid fa-clipboard-check text-4xl mb-3"></i>
              <p className="text-sm">{hasFilters ? 'No hay registros con estos filtros.' : 'Todavía no hay registros de auditoría.'}</p>
            </div>
          )}

          {data && data.items.length > 0 && (
            <ul className={`divide-y divide-line ${loading ? 'opacity-60' : ''}`}>
              {data.items.map(item => {
                const open = expanded === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : item.id)}
                      aria-expanded={open}
                      className="w-full text-left py-3 px-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 hover:bg-surface-muted rounded-lg"
                    >
                      <span className="text-xs text-muted tabular-nums sm:w-36 shrink-0">{formatDateTime(item.createdAt)}</span>
                      <span className={`self-start sm:self-auto px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${ACTION_STYLE[item.action] || DEFAULT_STYLE}`}>
                        {item.actionLabel}
                      </span>
                      <span className="text-sm text-ink flex-1 min-w-0">{item.summary}</span>
                      <span className="text-xs text-muted sm:w-32 shrink-0 sm:text-right">
                        <i className="fa-solid fa-user mr-1 text-muted"></i>{item.userName}
                      </span>
                      <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-muted text-xs hidden sm:block`}></i>
                    </button>
                    {open && (
                      <div className="mx-2 mb-3 p-3 bg-surface-muted border border-line rounded-lg">
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
          <div className="p-3 border-t border-line flex justify-between items-center text-sm">
            <button
              type="button"
              onClick={() => setPage(p => p - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 border border-line rounded-lg disabled:opacity-40 hover:bg-surface-muted"
            >
              <i className="fa-solid fa-chevron-left mr-1"></i> Anteriores
            </button>
            <span className="text-muted">Página {page} de {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 border border-line rounded-lg disabled:opacity-40 hover:bg-surface-muted"
            >
              Siguientes <i className="fa-solid fa-chevron-right ml-1"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
