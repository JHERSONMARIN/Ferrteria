import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { formatSoles } from '../utils/currency.js';
import { formatQuantity } from '../utils/quantities.js';
import { downloadCsv, csvNumber } from '../utils/csv.js';

const todayInLima = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const shiftDay = (day, n) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};

const PRESETS = [
  { id: 'today', label: 'Hoy', range: (t) => [t, t] },
  { id: '7', label: '7 días', range: (t) => [shiftDay(t, -6), t] },
  { id: '30', label: '30 días', range: (t) => [shiftDay(t, -29), t] },
  { id: 'month', label: 'Este mes', range: (t) => [`${t.slice(0, 8)}01`, t] },
];

const formatDay = (day) => {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
};

function Section({ title, subtitle, onExport, children }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-slate-50 flex flex-wrap justify-between items-center gap-2">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
        {onExport && (
          <button type="button" onClick={onExport} className="text-xs font-semibold text-slate-600 hover:text-orange-700 border border-slate-300 bg-white rounded-lg px-2.5 py-1">
            <i className="fa-solid fa-file-csv mr-1"></i> CSV
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint, accent }) {
  return (
    <div className={`bg-white p-4 rounded-xl shadow-sm border border-gray-100 border-l-4 ${accent}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl font-black text-slate-800 mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Empty({ text }) {
  return <p className="px-4 py-6 text-center text-sm text-slate-400">{text}</p>;
}

// Barras simples por día: alto proporcional al día de mayor venta.
function DailyChart({ daily }) {
  const max = Math.max(...daily.map(d => d.total), 0);
  if (max === 0) return <Empty text="No hay ventas cobradas en este período." />;
  const labelEvery = Math.ceil(daily.length / 10);
  return (
    <div className="p-4">
      <div className="flex items-end gap-[2px] h-40">
        {daily.map(d => (
          <div key={d.day} className="flex-1 h-full flex flex-col justify-end group relative min-w-0">
            <div
              className="bg-orange-500 group-hover:bg-orange-600 rounded-t-sm"
              style={{ height: `${Math.max((d.total / max) * 100, d.total > 0 ? 2 : 0)}%` }}
              title={`${formatDay(d.day)}: ${formatSoles(d.total)} · ${d.sales} venta(s)`}
            ></div>
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">
        {daily.map((d, i) => (
          <span key={d.day} className="flex-1 min-w-0 flex justify-center text-[9px] text-slate-400 whitespace-nowrap">
            {i % labelEvery === 0 ? formatDay(d.day) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function PeopleTable({ rows, showDiscounts }) {
  if (rows.length === 0) return <Empty text="Sin ventas en el período." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500 uppercase bg-slate-100">
          <tr>
            <th className="px-4 py-2 text-left">Nombre</th>
            <th className="px-4 py-2 text-right">Ventas</th>
            <th className="px-4 py-2 text-right">Total</th>
            <th className="px-4 py-2 text-right">Ticket prom.</th>
            {showDiscounts && <th className="px-4 py-2 text-right">Descuentos</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(r => (
            <tr key={r.userId ?? 'none'}>
              <td className="px-4 py-2 font-semibold text-slate-700">{r.name}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.sales}</td>
              <td className="px-4 py-2 text-right tabular-nums font-bold">{formatSoles(r.total)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatSoles(r.average)}</td>
              {showDiscounts && <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{r.discounts > 0 ? formatSoles(r.discounts) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SalesReports() {
  const today = todayInLima();
  const [range, setRange] = useState({ from: shiftDay(today, -29), to: today });
  const [preset, setPreset] = useState('30');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productSort, setProductSort] = useState('amount');
  const [rotationView, setRotationView] = useState('low');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    api.get('/sucursales').then(setBranches).catch(() => setBranches([]));
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const branchParam = branchId ? `&branchId=${branchId}` : '';
      setData(await api.get(`/dashboard/reportes?from=${range.from}&to=${range.to}${branchParam}`));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los reportes.');
    } finally {
      setLoading(false);
    }
  }, [range, branchId]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (p) => {
    const [from, to] = p.range(todayInLima());
    setPreset(p.id);
    setRange({ from, to });
  };

  const setDay = (key, value) => {
    if (!value) return;
    setPreset(null);
    setRange(prev => ({ ...prev, [key]: value }));
  };

  const branchSuffix = branchId ? `_${(branches.find(b => b.id === Number(branchId))?.name || branchId).replace(/\s+/g, '_')}` : '';
  const suffix = data ? `${data.range.from}_a_${data.range.to}${branchSuffix}` : '';
  const products = data
    ? [...data.topProducts].sort((a, b) => (productSort === 'amount' ? b.amount - a.amount : b.quantity - a.quantity))
    : [];

  const exportPeople = (rows, name, withDiscounts) => downloadCsv(`${name}_${suffix}.csv`, [
    { label: 'Nombre', value: r => r.name },
    { label: 'Ventas', value: r => r.sales },
    { label: 'Total', value: r => csvNumber(r.total) },
    { label: 'Ticket promedio', value: r => csvNumber(r.average) },
    ...(withDiscounts ? [{ label: 'Descuentos', value: r => csvNumber(r.discounts) }] : []),
  ], rows);

  const exportProducts = () => downloadCsv(`productos_mas_vendidos_${suffix}.csv`, [
    { label: 'Código', value: p => p.code },
    { label: 'Producto', value: p => p.name },
    { label: 'Unidad', value: p => p.unit },
    { label: 'Cantidad', value: p => csvNumber(p.quantity) },
    { label: 'Importe', value: p => csvNumber(p.amount) },
    { label: 'Ventas', value: p => p.sales },
  ], products);

  const rotationRows = data ? (rotationView === 'low' ? data.rotation.lowCoverage : data.rotation.noMovement) : [];
  const exportRotation = () => downloadCsv(`${rotationView === 'low' ? 'por_agotarse' : 'sin_movimiento'}_${suffix}.csv`, [
    { label: 'Código', value: p => p.code },
    { label: 'Producto', value: p => p.name },
    { label: 'Unidad', value: p => p.unit },
    { label: 'Stock', value: p => csvNumber(p.stock) },
    { label: 'Vendido en el período', value: p => csvNumber(p.sold) },
    { label: 'Venta diaria promedio', value: p => csvNumber(p.dailyAverage) },
    { label: 'Días de stock', value: p => p.coverageDays ?? '' },
    { label: 'Valor del stock', value: p => csvNumber(p.stockValue) },
  ], rotationRows);

  const inputClass = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-orange-500';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${preset === p.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
          >
            {p.label}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
          Desde <input type="date" value={range.from} max={range.to} onChange={e => setDay('from', e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          Hasta <input type="date" value={range.to} min={range.from} onChange={e => setDay('to', e.target.value)} className={inputClass} />
        </label>
        {branches.length > 1 && (
          <select value={branchId} onChange={e => setBranchId(e.target.value)} aria-label="Sucursal" className={inputClass}>
            <option value="">Toda la empresa</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {loading && <i className="fa-solid fa-spinner fa-spin text-slate-400"></i>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <div className={`flex flex-col gap-5 ${loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Ventas cobradas" value={data.summary.sales} hint={`${data.range.days} día(s)`} accent="border-l-slate-400" />
            <Kpi label="Ingresos" value={formatSoles(data.summary.revenue)} hint="Incluye fiado" accent="border-l-emerald-500" />
            <Kpi label="Ticket promedio" value={formatSoles(data.summary.averageTicket)} accent="border-l-blue-500" />
            <Kpi
              label="Descuentos"
              value={formatSoles(data.summary.discounts)}
              hint={`${data.summary.discountedSales} venta(s) con descuento`}
              accent="border-l-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2">
              <Section title="Ventas por día" subtitle="Monto cobrado cada día (hora de Perú).">
                <DailyChart daily={data.daily} />
              </Section>
            </div>
            <Section title="Medios de pago">
              {data.payMethods.length === 0 ? <Empty text="Sin ventas en el período." /> : (
                <ul className="divide-y divide-gray-100">
                  {data.payMethods.map(m => (
                    <li key={m.method} className="px-4 py-2 flex justify-between text-sm">
                      <span className="text-slate-700">{m.label} <span className="text-xs text-slate-400">({m.sales})</span></span>
                      <span className="font-bold tabular-nums">{formatSoles(m.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Section title="Ventas por vendedor" subtitle="Quién registró la venta." onExport={() => exportPeople(data.sellers, 'ventas_por_vendedor', true)}>
              <PeopleTable rows={data.sellers} showDiscounts />
            </Section>
            <Section title="Cobros por cajero" subtitle="Quién cobró (en cajas compartidas, cada cajero)." onExport={() => exportPeople(data.cashiers, 'cobros_por_cajero', false)}>
              <PeopleTable rows={data.cashiers} />
            </Section>
          </div>

          <Section
            title="Productos más vendidos"
            subtitle="Importe según precio de cada línea (antes del descuento sobre el total)."
            onExport={products.length ? exportProducts : null}
          >
            <div className="px-4 pt-3 flex gap-2">
              {[['amount', 'Por importe'], ['quantity', 'Por cantidad']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setProductSort(id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold border ${productSort === id ? 'bg-orange-50 text-orange-700 border-orange-300' : 'bg-white text-slate-600 border-slate-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {products.length === 0 ? <Empty text="Sin ventas en el período." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left">Producto</th>
                      <th className="px-4 py-2 text-right">Cantidad</th>
                      <th className="px-4 py-2 text-right">Importe</th>
                      <th className="px-4 py-2 text-right">Ventas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.map((p, i) => (
                      <tr key={p.id}>
                        <td className="px-4 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2 text-slate-700">
                          {p.name} <span className="text-[10px] font-mono text-slate-400">{p.code}</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatQuantity(p.quantity)} <span className="text-xs text-slate-400">{p.unit}</span></td>
                        <td className="px-4 py-2 text-right tabular-nums font-bold">{formatSoles(p.amount)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{p.sales}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Rotación de inventario"
            subtitle={`Días de stock = stock actual ÷ venta diaria promedio del período (${data.range.days} días).`}
            onExport={rotationRows.length ? exportRotation : null}
          >
            <div className="px-4 pt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRotationView('low')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold border ${rotationView === 'low' ? 'bg-red-50 text-red-700 border-red-300' : 'bg-white text-slate-600 border-slate-300'}`}
              >
                Por agotarse ({data.rotation.lowCoverageCount})
              </button>
              <button
                type="button"
                onClick={() => setRotationView('none')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold border ${rotationView === 'none' ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-white text-slate-600 border-slate-300'}`}
              >
                Sin movimiento ({data.rotation.noMovementCount})
              </button>
            </div>
            <p className="px-4 pt-2 text-xs text-slate-500">
              {rotationView === 'low'
                ? `Productos que se venden y alcanzan para menos de ${data.rotation.lowCoverageDays} días al ritmo actual.`
                : `Productos con stock que no se vendieron en el período: ${formatSoles(data.rotation.noMovementValue)} inmovilizados (a precio de venta).`}
            </p>
            {rotationRows.length === 0 ? (
              <Empty text={rotationView === 'low' ? 'Ningún producto está por agotarse.' : 'Todos los productos con stock tuvieron ventas.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Producto</th>
                      <th className="px-4 py-2 text-right">Stock</th>
                      <th className="px-4 py-2 text-right">Vendido</th>
                      {rotationView === 'low'
                        ? <th className="px-4 py-2 text-right">Días de stock</th>
                        : <th className="px-4 py-2 text-right">Valor del stock</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rotationRows.map(p => (
                      <tr key={p.id}>
                        <td className="px-4 py-2 text-slate-700">{p.name} <span className="text-[10px] font-mono text-slate-400">{p.code}</span></td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatQuantity(p.stock)} <span className="text-xs text-slate-400">{p.unit}</span></td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatQuantity(p.sold)}</td>
                        {rotationView === 'low' ? (
                          <td className={`px-4 py-2 text-right tabular-nums font-bold ${p.coverageDays < 3 ? 'text-red-600' : 'text-amber-600'}`}>
                            {p.coverageDays === 0 ? 'Agotado' : p.coverageDays}
                          </td>
                        ) : (
                          <td className="px-4 py-2 text-right tabular-nums font-bold">{formatSoles(p.stockValue)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
