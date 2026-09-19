import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';
import { formatQuantity, quantityProblem } from '../utils/quantities.js';

const formatDateTime = (value) => new Date(value).toLocaleString('es-PE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// Disponible del producto en una sucursal (stock menos lo reservado para pedidos).
const availableIn = (product, branchId) => {
  const row = product.branches?.find(b => b.branchId === branchId);
  return row ? Math.max(row.stock - row.reserved, 0) : 0;
};

export default function TransfersPage({ currentUser }) {
  const isAdmin = currentUser?.role === 'ADMINISTRADOR';
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [fromBranchId, setFromBranchId] = useState(currentUser?.branchId ?? null);
  const [toBranchId, setToBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState([]); // { id, qty }
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    try {
      const [branchList, productList, transfers] = await Promise.all([
        api.get('/sucursales'), api.get('/productos'), api.get('/transferencias'),
      ]);
      setBranches(branchList);
      setProducts(productList);
      setHistory(transfers);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'No se pudieron cargar los datos.' });
    }
  };

  useEffect(() => { loadData(); }, []);

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const destinations = branches.filter(b => b.id !== fromBranchId);
  const originName = branches.find(b => b.id === fromBranchId)?.name ?? currentUser?.branch?.name ?? '';

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter(p => p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [products, search]);

  const changeOrigin = (value) => {
    const id = Number(value);
    setFromBranchId(id);
    if (Number(toBranchId) === id) setToBranchId('');
    setLines([]);
  };

  const addLine = (product) => {
    setLines(prev => (prev.some(l => l.id === product.id) ? prev : [...prev, { id: product.id, qty: '' }]));
    setSearch('');
  };

  const lineError = (line) => {
    const product = productById.get(line.id);
    if (line.qty === '') return 'Ingrese la cantidad.';
    const qty = Number(line.qty);
    const problem = quantityProblem(qty, product.allowsFractions);
    if (problem) return `La cantidad ${problem}.`;
    if (qty > availableIn(product, fromBranchId)) return `Solo hay ${formatQuantity(availableIn(product, fromBranchId))} disponibles.`;
    return '';
  };

  const canSubmit = toBranchId && lines.length > 0 && lines.every(l => !lineError(l)) && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      setSaving(true);
      setMessage(null);
      const transfer = await api.post('/transferencias', {
        fromBranchId,
        toBranchId: Number(toBranchId),
        items: lines.map(l => ({ id: l.id, qty: Number(l.qty) })),
        notes,
      });
      setMessage({ type: 'success', text: `${transfer.number} registrada: ${transfer.items.length} producto(s) de ${transfer.from.name} a ${transfer.to.name}.` });
      setLines([]);
      setNotes('');
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full border border-gray-300 px-3 py-2 rounded-lg text-sm bg-white focus:outline-none focus:border-orange-500';

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">
        <section className="xl:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Nueva transferencia</h3>
            <p className="text-xs text-slate-500">
              El stock sale del disponible del origen y entra al destino en un solo paso. Lo reservado para pedidos no se puede transferir.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-600">
              Desde
              {isAdmin ? (
                <select value={fromBranchId ?? ''} onChange={e => changeOrigin(e.target.value)} className={`${inputClass} mt-1`}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              ) : (
                <p className="mt-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700">{originName}</p>
              )}
            </label>
            <label className="text-xs font-bold text-slate-600">
              Hacia
              <select value={toBranchId} onChange={e => setToBranchId(e.target.value)} className={`${inputClass} mt-1`}>
                <option value="">Elija la sucursal de destino</option>
                {destinations.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>

          <div className="relative">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto por código o nombre para agregarlo"
              className={inputClass}
            />
            {results.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-auto">
                {results.map(p => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addLine(p)}
                      className="w-full text-left px-3 py-2 hover:bg-orange-50 flex justify-between gap-3 text-sm"
                    >
                      <span className="text-slate-700 min-w-0 truncate">
                        <span className="font-mono text-[11px] text-slate-400 mr-2">{p.code}</span>{p.name}
                      </span>
                      <span className="text-xs text-slate-500 shrink-0">{formatQuantity(availableIn(p, fromBranchId))} {p.unit} disp.</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg">
              Busque y agregue los productos a transferir.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {lines.map(line => {
                const product = productById.get(line.id);
                const error = line.qty !== '' ? lineError(line) : '';
                return (
                  <li key={line.id} className="px-3 py-2 flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[10rem]">
                      <p className="text-sm font-semibold text-slate-800">{product.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {product.code} · disponible en {originName}: {formatQuantity(availableIn(product, fromBranchId))} {product.unit}
                      </p>
                      {error && <p className="text-[11px] text-red-600">{error}</p>}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step={product.allowsFractions ? '0.001' : '1'}
                      value={line.qty}
                      onChange={e => setLines(prev => prev.map(l => (l.id === line.id ? { ...l, qty: e.target.value } : l)))}
                      aria-label={`Cantidad de ${product.name}`}
                      placeholder="0"
                      className={`w-24 border px-2 py-1.5 rounded-md text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500 ${error ? 'border-red-400' : 'border-slate-300'}`}
                    />
                    <span className="text-xs text-slate-500 w-14">{product.unit}</span>
                    <button
                      type="button"
                      onClick={() => setLines(prev => prev.filter(l => l.id !== line.id))}
                      title="Quitar"
                      className="text-slate-400 hover:text-red-600 px-1"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={200} placeholder="Nota (opcional): motivo, guía de remisión…" className={inputClass} />

          {message && <p className={`text-sm ${message.type === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>{message.text}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <><i className="fa-solid fa-spinner fa-spin mr-2"></i>Transfiriendo…</> : <><i className="fa-solid fa-right-left mr-2"></i>Transferir</>}
          </button>
        </section>

        <section className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-slate-50">
            <h3 className="font-bold text-slate-800 text-sm">Últimas transferencias</h3>
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Todavía no hay transferencias.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.map(t => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-mono font-bold text-slate-700">{t.number}</span>
                    <span className="text-xs text-slate-500">{formatDateTime(t.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {t.from.name} <i className="fa-solid fa-arrow-right text-[10px] mx-1 text-orange-500"></i> {t.to.name} · {t.createdBy}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t.items.map(i => `${formatQuantity(i.qty)} ${i.unit} ${i.name}`).join(' · ')}
                  </p>
                  {t.notes && <p className="text-[11px] text-slate-400 italic mt-0.5">{t.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
