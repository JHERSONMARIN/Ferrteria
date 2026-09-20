import React, { useState } from 'react';
import { api } from '../api.js';

// Acciones sobre una empresa: plan, contacto, actualizar, suspender, clave del administrador y baja.
export default function CompanyDetail({ company, plans, onClose, onChanged }) {
  const [plan, setPlan] = useState(company.plan || '');
  const [extras, setExtras] = useState([]);
  const [expiresAt, setExpiresAt] = useState(company.license.expiresAt || '');
  const [contact, setContact] = useState({
    contact: company.contacto?.contact || '', phone: company.contacto?.phone || '',
    email: company.contacto?.email || '', notes: company.contacto?.notes || '',
  });
  const [confirmSlug, setConfirmSlug] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  const run = async (key, action, successText) => {
    try {
      setBusy(key);
      setMessage(null);
      const result = await action();
      setMessage({ type: 'success', text: successText, result });
      await onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err.message, salida: err.salida });
    } finally {
      setBusy('');
    }
  };

  const suspendida = company.docker.status === 'detenida';
  const input = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-orange-500';
  const boton = 'px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50';

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-30 flex items-start justify-center p-4 overflow-auto">
      <div className="bg-slate-50 rounded-xl shadow-xl w-full max-w-3xl my-4">
        <header className="bg-white rounded-t-xl border-b border-gray-200 p-4 flex items-start gap-3">
          <div className="min-w-0">
            <h2 className="font-black text-lg text-slate-800">{company.name}</h2>
            <p className="text-xs text-slate-500 font-mono">
              {company.slug}
              {company.url && <a href={company.url} target="_blank" rel="noreferrer" className="ml-2 text-orange-600 hover:underline">{company.url}</a>}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-700 text-xl px-2"><i className="fa-solid fa-xmark"></i></button>
        </header>

        <div className="p-4 flex flex-col gap-4">
          {message && (
            <div className={`rounded-lg px-3 py-2 text-sm border ${message.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
              <p>{message.text}</p>
              {message.result?.password && (
                <p className="mt-1 font-mono text-base">Contraseña temporal: <strong>{message.result.password}</strong> (se muestra una sola vez)</p>
              )}
              {message.salida && <pre className="mt-1 text-[11px] whitespace-pre-wrap max-h-40 overflow-auto">{message.salida}</pre>}
            </div>
          )}

          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-bold text-slate-800 text-sm mb-2">Uso y estado</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-[11px] text-slate-500">Usuarios</p><p className="font-bold">{company.usage?.users ?? '—'}{company.limits.maxUsers ? ` / ${company.limits.maxUsers}` : ''}</p></div>
              <div><p className="text-[11px] text-slate-500">Sucursales</p><p className="font-bold">{company.usage?.branches ?? '—'}{company.limits.maxBranches ? ` / ${company.limits.maxBranches}` : ''}</p></div>
              <div><p className="text-[11px] text-slate-500">Cajas</p><p className="font-bold">{company.usage?.cashRegisters ?? '—'}{company.limits.maxCashRegisters ? ` / ${company.limits.maxCashRegisters}` : ''}</p></div>
              <div><p className="text-[11px] text-slate-500">Ventas del mes</p><p className="font-bold">{company.usage?.salesThisMonth ?? '—'}</p></div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Contenedores: {company.docker.containers.map(c => `${c.name} (${c.state})`).join(' · ') || 'ninguno'}
            </p>
            {company.features.length > 0 && (
              <p className="text-[11px] text-slate-500 mt-1">Funciones: {company.features.join(', ')}</p>
            )}
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-bold text-slate-800 text-sm mb-2">Plan</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select value={plan} onChange={e => setPlan(e.target.value)} className={input} aria-label="Plan">
                <option value="">Elija un plan</option>
                {plans && Object.entries(plans.planes).map(([id, p]) => <option key={id} value={id}>{p.nombre}</option>)}
              </select>
              <label className="text-xs text-slate-500 flex items-center gap-2">
                Vence <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className={input} />
              </label>
              <button
                onClick={() => run('plan', () => api.put(`/empresas/${company.slug}/plan`, { plan, extras, expiresAt: expiresAt || null }), 'Plan aplicado y empresa reiniciada.')}
                disabled={!plan || busy === 'plan'}
                className={`${boton} bg-orange-600 hover:bg-orange-700 text-white`}
              >
                {busy === 'plan' ? 'Aplicando…' : 'Aplicar plan'}
              </button>
            </div>
            {plans && (
              <div className="flex flex-wrap gap-3 mt-2">
                {Object.entries(plans.adicionales).map(([id, extra]) => (
                  <label key={id} className="text-xs text-slate-600 flex items-center gap-1.5">
                    <input type="checkbox" checked={extras.includes(id)} className="accent-orange-600"
                      onChange={e => setExtras(prev => (e.target.checked ? [...prev, id] : prev.filter(x => x !== id)))} />
                    {extra.nombre}
                  </label>
                ))}
              </div>
            )}
            {plan && plans?.planes[plan] && (
              <p className="text-[11px] text-slate-500 mt-2">{plans.planes[plan].descripcion}</p>
            )}
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-bold text-slate-800 text-sm mb-2">Contacto del cliente</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={contact.contact} onChange={e => setContact({ ...contact, contact: e.target.value })} placeholder="Persona de contacto" className={input} />
              <input value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} placeholder="Teléfono" className={input} />
              <input value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} placeholder="Correo" className={input} />
              <input value={contact.notes} onChange={e => setContact({ ...contact, notes: e.target.value })} placeholder="Notas" className={input} />
            </div>
            <button
              onClick={() => run('contacto', () => api.put(`/empresas/${company.slug}/contacto`, contact), 'Contacto guardado.')}
              disabled={busy === 'contacto'}
              className={`${boton} bg-slate-800 hover:bg-slate-700 text-white mt-2`}
            >
              Guardar contacto
            </button>
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-2">
            <button
              onClick={() => run('actualizar', () => api.post(`/empresas/${company.slug}/actualizar`, {}), 'Empresa actualizada a la versión actual.')}
              disabled={busy === 'actualizar'}
              className={`${boton} bg-slate-800 hover:bg-slate-700 text-white`}
            >
              <i className="fa-solid fa-arrow-up-right-dots mr-1.5"></i>{busy === 'actualizar' ? 'Actualizando…' : 'Actualizar versión'}
            </button>
            {suspendida ? (
              <button
                onClick={() => run('reactivar', () => api.post(`/empresas/${company.slug}/reactivar`, {}), 'Empresa reactivada.')}
                disabled={busy === 'reactivar'}
                className={`${boton} bg-emerald-600 hover:bg-emerald-700 text-white`}
              >
                <i className="fa-solid fa-play mr-1.5"></i>Reactivar
              </button>
            ) : (
              <button
                onClick={() => window.confirm(`¿Suspender ${company.name}? Sus usuarios no podrán entrar hasta reactivarla.`)
                  && run('suspender', () => api.post(`/empresas/${company.slug}/suspender`, {}), 'Empresa suspendida.')}
                disabled={busy === 'suspender'}
                className={`${boton} bg-amber-600 hover:bg-amber-700 text-white`}
              >
                <i className="fa-solid fa-pause mr-1.5"></i>Suspender
              </button>
            )}
            <button
              onClick={() => window.confirm('¿Restablecer la contraseña del usuario admin de esta empresa?')
                && run('clave', () => api.post(`/empresas/${company.slug}/clave-admin`, {}), 'Contraseña restablecida.')}
              disabled={busy === 'clave'}
              className={`${boton} bg-white border border-slate-300 text-slate-700 hover:bg-slate-100`}
            >
              <i className="fa-solid fa-key mr-1.5"></i>Clave del administrador
            </button>
          </section>

          <section className="bg-white rounded-lg border border-red-200 p-4">
            <h3 className="font-bold text-red-700 text-sm">Dar de baja</h3>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">
              Elimina la instancia y su base de datos. Antes se guarda un respaldo en el servidor. No se puede deshacer.
            </p>
            <div className="flex flex-wrap gap-2">
              <input value={confirmSlug} onChange={e => setConfirmSlug(e.target.value)}
                placeholder={`Escriba "${company.slug}" para confirmar`} className={`${input} sm:w-72`} />
              <button
                onClick={() => run('baja', () => api.del(`/empresas/${company.slug}`, { confirmar: confirmSlug }), 'Empresa dada de baja.').then(onClose)}
                disabled={confirmSlug !== company.slug || busy === 'baja'}
                className={`${boton} bg-red-600 hover:bg-red-700 text-white`}
              >
                {busy === 'baja' ? 'Dando de baja…' : 'Dar de baja'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
