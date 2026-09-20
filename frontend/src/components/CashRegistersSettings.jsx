import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

// Cajas físicas de la empresa. Los cambios se guardan al momento (no dependen del botón Guardar).
export default function CashRegistersSettings() {
  const [registers, setRegisters] = useState([]);
  const [branches, setBranches] = useState([]);
  const [newName, setNewName] = useState('');
  const [newBranchId, setNewBranchId] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    try {
      setRegisters(await api.get('/caja/registros'));
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'No se pudieron cargar las cajas.' });
    }
  };

  useEffect(() => {
    load();
    api.get('/sucursales').then(setBranches).catch(() => setBranches([]));
  }, []);

  // Con una sola sucursal no se muestra nada de sucursales.
  const multiBranch = branches.length > 1;

  const run = async (action, successText) => {
    try {
      setBusy(true);
      setMessage(null);
      await action();
      await load();
      if (successText) setMessage({ type: 'success', text: successText });
      return true;
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addRegister = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const payload = multiBranch && newBranchId ? { name, branchId: Number(newBranchId) } : { name };
    if (await run(() => api.post('/caja/registros', payload), `${name} creada.`)) setNewName('');
  };

  const saveName = async () => {
    if (await run(() => api.put(`/caja/registros/${editing.id}`, { name: editing.name.trim() }), 'Nombre actualizado.')) setEditing(null);
  };

  const toggleActive = (register) => run(
    () => api.put(`/caja/registros/${register.id}`, { active: !register.active }),
    register.active ? `${register.name} desactivada.` : `${register.name} activada.`
  );

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line border border-line rounded-lg">
        {registers.map(r => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            {editing?.id === r.id ? (
              <>
                <input
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  maxLength={40}
                  autoFocus
                  aria-label="Nombre de la caja"
                  className="flex-1 min-w-0 border border-line px-2 py-1 rounded-md text-sm focus:outline-none focus:border-brand"
                />
                <button type="button" onClick={saveName} disabled={busy} className="text-xs font-bold text-brand-contrast bg-brand hover:bg-brand-strong rounded-md px-2.5 py-1.5 disabled:opacity-50">
                  Guardar
                </button>
                <button type="button" onClick={() => setEditing(null)} className="text-xs font-semibold text-muted px-2 py-1.5">Cancelar</button>
              </>
            ) : (
              <>
                <span className={`flex-1 min-w-0 text-sm font-semibold ${r.active ? 'text-ink' : 'text-muted line-through'}`}>
                  <i className="fa-solid fa-cash-register mr-2 text-muted"></i>{r.name}
                  {multiBranch && r.branch && <span className="ml-2 text-[11px] font-normal text-muted">· {r.branch.name}</span>}
                </span>
                {r.isOpen && <span className="text-[11px] font-bold bg-success-soft text-success px-2 py-0.5 rounded-full">Turno abierto</span>}
                {!r.active && <span className="text-[11px] font-bold bg-surface-muted text-muted px-2 py-0.5 rounded-full">Inactiva</span>}
                <button type="button" onClick={() => setEditing({ id: r.id, name: r.name })} className="text-xs font-semibold text-ink-soft hover:text-brand-text px-2 py-1">
                  <i className="fa-solid fa-pen mr-1"></i> Renombrar
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(r)}
                  disabled={busy || (r.active && r.isOpen)}
                  title={r.active && r.isOpen ? 'Cierre el turno antes de desactivarla' : undefined}
                  className="text-xs font-semibold text-ink-soft hover:text-brand-text px-2 py-1 disabled:opacity-40"
                >
                  {r.active ? 'Desactivar' : 'Activar'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={addRegister} className="flex flex-wrap gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          maxLength={40}
          placeholder="Nombre de la nueva caja (ej. Caja 2)"
          className="flex-1 min-w-[12rem] border border-line px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-brand"
        />
        {multiBranch && (
          <select
            value={newBranchId}
            onChange={e => setNewBranchId(e.target.value)}
            aria-label="Sucursal de la caja"
            className="border border-line px-2 py-2 rounded-lg text-sm bg-surface focus:outline-none focus:border-brand"
          >
            <option value="">Mi sucursal</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <button type="submit" disabled={busy || !newName.trim()} className="px-3 py-2 text-sm font-bold text-white bg-panel hover:bg-panel-strong rounded-lg disabled:opacity-50">
          <i className="fa-solid fa-plus mr-1"></i> Agregar caja
        </button>
      </form>

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-danger' : 'text-success'}`}>{message.text}</p>
      )}
    </div>
  );
}
