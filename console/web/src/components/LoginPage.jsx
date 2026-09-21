import React, { useState } from 'react';
import { api } from '../api.js';

// Acceso del personal de VALETEC. No tiene nada que ver con los usuarios de las ferreterías.
export default function LoginPage({ onLogin }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError('');
      const res = await api.post('/auth/login', { user: user.trim(), pass });
      onLogin(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm flex flex-col gap-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-3 text-2xl">
            <i className="fa-solid fa-shop-lock"></i>
          </div>
          <h1 className="text-xl font-black text-slate-800">Consola VALETEC</h1>
          <p className="text-xs text-slate-500">Gestión de las empresas de FerreSys</p>
        </div>
        <input value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario" autoFocus
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500" />
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500" />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={busy || !user.trim() || !pass}
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-lg disabled:opacity-50">
          {busy ? <><i className="fa-solid fa-spinner fa-spin mr-2"></i>Ingresando…</> : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
