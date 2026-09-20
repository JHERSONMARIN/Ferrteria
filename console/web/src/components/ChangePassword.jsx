import React, { useState } from 'react';
import { api } from '../api.js';

// La primera clave es temporal: hay que cambiarla antes de usar la consola.
export default function ChangePassword({ onDone }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== repeat) return setError('Las contraseñas nuevas no coinciden.');
    try {
      setBusy(true);
      setError('');
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const input = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500';
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm flex flex-col gap-3">
        <h1 className="text-lg font-black text-slate-800">Cambie su contraseña</h1>
        <p className="text-xs text-slate-500">Su clave actual es temporal.</p>
        <input type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Contraseña actual" className={input} autoFocus />
        <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="Nueva contraseña (mínimo 8)" className={input} />
        <input type="password" value={repeat} onChange={e => setRepeat(e.target.value)} placeholder="Repita la nueva" className={input} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-lg disabled:opacity-50">
          Guardar
        </button>
      </form>
    </div>
  );
}
