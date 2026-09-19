import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

// Sucursales o almacenes. Se guardan al momento. Una sucursal no se borra: se desactiva cuando no
// tiene usuarios, stock ni pedidos abiertos (el servidor lo valida y explica qué falta).
export default function BranchesSettings({ onChanged }) {
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({ name: '', address: '' });
  const [editing, setEditing] = useState(null); // { id, name, address }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    try {
      setBranches(await api.get('/sucursales?todas=1'));
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'No se pudieron cargar las sucursales.' });
    }
  };

  useEffect(() => { load(); }, []);

  const run = async (action, successText) => {
    try {
      setBusy(true);
      setMessage(null);
      await action();
      await load();
      if (onChanged) onChanged();
      setMessage({ type: 'success', text: successText });
      return true;
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if (await run(() => api.post('/sucursales', { name, address: form.address }), `${name} creada.`)) {
      setForm({ name: '', address: '' });
    }
  };

  const save = async () => {
    if (await run(() => api.put(`/sucursales/${editing.id}`, { name: editing.name, address: editing.address }), 'Sucursal actualizada.')) {
      setEditing(null);
    }
  };

  const toggle = (b) => run(
    () => api.put(`/sucursales/${b.id}`, { active: !b.active }),
    b.active ? `${b.name} desactivada.` : `${b.name} activada.`
  );

  const inputClass = 'border border-gray-300 px-2.5 py-1.5 rounded-lg text-sm focus:outline-none focus:border-orange-500 min-w-0';

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
        {branches.map(b => (
          <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            {editing?.id === b.id ? (
              <>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} maxLength={60}
                  aria-label="Nombre de la sucursal" className={`${inputClass} flex-1`} autoFocus />
                <input value={editing.address} onChange={e => setEditing({ ...editing, address: e.target.value })} maxLength={200}
                  aria-label="Dirección" placeholder="Dirección" className={`${inputClass} flex-[2]`} />
                <button type="button" onClick={save} disabled={busy} className="text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-md px-2.5 py-1.5 disabled:opacity-50">Guardar</button>
                <button type="button" onClick={() => setEditing(null)} className="text-xs font-semibold text-slate-500 px-2 py-1.5">Cancelar</button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${b.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                    <i className="fa-solid fa-store mr-2 text-slate-400"></i>{b.name}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {b.address || 'Sin dirección'} · {b.userCount} usuario(s) · {b.cashRegisterCount} caja(s)
                  </p>
                </div>
                {!b.active && <span className="text-[11px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inactiva</span>}
                <button type="button" onClick={() => setEditing({ id: b.id, name: b.name, address: b.address || '' })}
                  className="text-xs font-semibold text-slate-600 hover:text-orange-700 px-2 py-1">
                  <i className="fa-solid fa-pen mr-1"></i> Editar
                </button>
                <button type="button" onClick={() => toggle(b)} disabled={busy} className="text-xs font-semibold text-slate-600 hover:text-orange-700 px-2 py-1 disabled:opacity-40">
                  {b.active ? 'Desactivar' : 'Activar'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex flex-col sm:flex-row gap-2">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={60}
          placeholder="Nombre (ej. Sucursal Norte, Almacén Central)" className={`${inputClass} flex-1 py-2`} />
        <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} maxLength={200}
          placeholder="Dirección (opcional)" className={`${inputClass} flex-1 py-2`} />
        <button type="submit" disabled={busy || !form.name.trim()} className="px-3 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 shrink-0">
          <i className="fa-solid fa-plus mr-1"></i> Agregar sucursal
        </button>
      </form>

      {message && <p className={`text-xs ${message.type === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>{message.text}</p>}
    </div>
  );
}
