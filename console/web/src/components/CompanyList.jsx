import React, { useState, useMemo } from 'react';
import { urlEmpresa } from '../urls.js';

const ESTADO_BADGE = {
  activa: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  detenida: 'bg-red-100 text-red-700 border-red-200',
  parcial: 'bg-amber-100 text-amber-800 border-amber-200',
  'sin-contenedores': 'bg-slate-100 text-slate-500 border-slate-200',
  desconocido: 'bg-slate-100 text-slate-500 border-slate-200',
};
const ESTADO_LABEL = {
  activa: 'Activa', detenida: 'Suspendida', parcial: 'Parcial',
  'sin-contenedores': 'Sin instalar', desconocido: 'Desconocido',
};
const LICENCIA_BADGE = {
  vigente: 'text-slate-500',
  'por-vencer': 'text-amber-700 font-semibold',
  vencida: 'text-red-600 font-bold',
  'sin-vencimiento': 'text-slate-400',
};

const limite = (usado, tope) => (tope ? `${usado ?? '—'} / ${tope}` : `${usado ?? '—'}`);
const excede = (usado, tope) => Boolean(tope && usado != null && usado > tope);

export default function CompanyList({ companies, plans, onSelect, onNew }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter(c => c.slug.includes(term) || c.name.toLowerCase().includes(term));
  }, [companies, search]);

  const planName = (slug) => (slug && plans?.planes?.[slug]?.nombre) || (slug ?? 'sin plan');

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-slate-50 flex flex-wrap items-center gap-2">
        <h2 className="font-bold text-slate-800">
          Empresas <span className="text-sm font-normal text-slate-400">({companies.length})</span>
        </h2>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o identificador"
          className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-72 focus:outline-none focus:border-orange-500"
        />
        <button onClick={onNew} className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm px-3 py-1.5 rounded-lg">
          <i className="fa-solid fa-plus mr-1.5"></i>Nueva empresa
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">
          {companies.length === 0 ? 'Todavía no hay empresas instaladas.' : 'Ninguna empresa coincide con la búsqueda.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase bg-slate-100">
              <tr>
                <th className="px-4 py-2 text-left">Empresa</th>
                <th className="px-4 py-2 text-left">Plan</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-right">Usuarios</th>
                <th className="px-4 py-2 text-right">Sucursales</th>
                <th className="px-4 py-2 text-right">Ventas del mes</th>
                <th className="px-4 py-2 text-left">Licencia</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <tr key={c.slug} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <p className="font-semibold text-slate-800">{c.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {c.slug}
                      {urlEmpresa(c) && (
                        <a href={urlEmpresa(c)} target="_blank" rel="noreferrer" className="ml-2 text-orange-600 hover:underline">
                          {urlEmpresa(c)}
                        </a>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <span className={c.plan ? 'text-slate-700' : 'text-slate-400 italic'}>{planName(c.plan)}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${ESTADO_BADGE[c.docker.status]}`}>
                      {ESTADO_LABEL[c.docker.status]}
                    </span>
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${excede(c.usage?.users, c.limits.maxUsers) ? 'text-red-600 font-bold' : ''}`}>
                    {limite(c.usage?.users, c.limits.maxUsers)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${excede(c.usage?.branches, c.limits.maxBranches) ? 'text-red-600 font-bold' : ''}`}>
                    {limite(c.usage?.branches, c.limits.maxBranches)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.usage?.salesThisMonth ?? '—'}</td>
                  <td className={`px-4 py-2 text-xs ${LICENCIA_BADGE[c.license.state]}`}>
                    {c.license.expiresAt
                      ? `${c.license.expiresAt}${c.license.state === 'vencida' ? ' (vencida)' : c.license.daysLeft <= 15 ? ` (${c.license.daysLeft} d)` : ''}`
                      : 'sin vencimiento'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => onSelect(c.slug)} className="text-xs font-bold text-orange-700 hover:underline">
                      Administrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
