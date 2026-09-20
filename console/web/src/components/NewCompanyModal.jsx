import React, { useState, useMemo } from 'react';
import { api } from '../api.js';

const PUERTO_INICIAL = 5301;

// Alta de una empresa: crea su base, su instancia y aplica el plan elegido.
export default function NewCompanyModal({ plans, companies, onClose, onCreated }) {
  const puertoSugerido = useMemo(() => {
    const usados = new Set(companies.map(c => c.port).filter(Boolean));
    let puerto = PUERTO_INICIAL;
    while (usados.has(puerto)) puerto += 1;
    return puerto;
  }, [companies]);

  const [form, setForm] = useState({ name: '', slug: '', port: puertoSugerido, plan: 'basico', contact: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  // Identificador sugerido a partir del nombre: minúsculas, sin tildes ni espacios.
  const sugerirSlug = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 31);

  const submit = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError('');
      const result = await api.post('/empresas', { ...form, port: Number(form.port) });
      setCreated(result);
      await onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const input = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-orange-500';

  if (created) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 z-40 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-3">
          <h2 className="font-black text-lg text-slate-800"><i className="fa-solid fa-circle-check text-emerald-600 mr-2"></i>Empresa creada</h2>
          <p className="text-sm text-slate-600">Entregue estos datos al cliente. La contraseña se muestra una sola vez.</p>
          <dl className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Usuario</dt><dd className="font-mono font-bold">admin</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Contraseña temporal</dt><dd className="font-mono font-bold">{created.adminPassword ?? 'ver salida'}</dd></div>
          </dl>
          <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap">{created.output}</pre>
          <button onClick={onClose} className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg">Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-40 flex items-center justify-center p-4 overflow-auto">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-3 my-4">
        <h2 className="font-black text-lg text-slate-800">Nueva empresa</h2>
        <label className="text-xs font-bold text-slate-600">Razón social
          <input value={form.name} onChange={e => { set('name', e.target.value); if (!form.slug) set('slug', sugerirSlug(e.target.value)); }}
            placeholder="Ferretería X S.A.C." className={input} autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-slate-600">Identificador
            <input value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="ferreteria-x" className={`${input} font-mono`} />
          </label>
          <label className="text-xs font-bold text-slate-600">Puerto
            <input type="number" value={form.port} onChange={e => set('port', e.target.value)} className={input} />
          </label>
        </div>
        <label className="text-xs font-bold text-slate-600">Plan
          <select value={form.plan} onChange={e => set('plan', e.target.value)} className={input}>
            {plans && Object.entries(plans.planes).map(([id, p]) => <option key={id} value={id}>{p.nombre} — {p.descripcion}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={form.contact} onChange={e => set('contact', e.target.value)} placeholder="Contacto" className={input} />
          <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Teléfono" className={input} />
          <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="Correo" className={input} />
        </div>
        <p className="text-[11px] text-slate-500">Crear la empresa construye su instancia: puede tardar varios minutos.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm font-bold text-slate-600">Cancelar</button>
          <button type="submit" disabled={busy || !form.name.trim() || !form.slug.trim()}
            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 rounded-lg disabled:opacity-50">
            {busy ? <><i className="fa-solid fa-spinner fa-spin mr-2"></i>Creando…</> : 'Crear empresa'}
          </button>
        </div>
      </form>
    </div>
  );
}
