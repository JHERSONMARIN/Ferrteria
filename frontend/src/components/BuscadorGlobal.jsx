import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { formatSoles } from '../utils/currency.js';

// Buscador general: se abre con Ctrl+K (o Ctrl+Barra) desde cualquier pantalla y encuentra de una vez
// productos, clientes y las pantallas del sistema. Es el atajo de quien pasa el día vendiendo.
//
// Al elegir un resultado se va a la pantalla que corresponde con la búsqueda ya escrita.
const sinTildes = (texto) => (texto || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function BuscadorGlobal({ open, onClose, pantallas, onIr }) {
  const [texto, setTexto] = useState('');
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [activo, setActivo] = useState(0);
  const campoRef = useRef(null);
  const listaRef = useRef(null);

  // Los datos se piden al abrir: así siempre muestra stock y deudas al día.
  useEffect(() => {
    if (!open) return;
    setTexto('');
    setActivo(0);
    campoRef.current?.focus();
    api.get('/productos').then(setProductos).catch(() => setProductos([]));
    api.get('/clientes').then(setClientes).catch(() => setClientes([]));
  }, [open]);

  const resultados = useMemo(() => {
    const q = sinTildes(texto).trim();
    const pantallasFiltradas = (q
      ? pantallas.filter(p => sinTildes(p.label).includes(q))
      : pantallas
    ).slice(0, q ? 4 : 6).map(p => ({ tipo: 'pantalla', id: `p-${p.id}`, ...p }));

    if (!q) return pantallasFiltradas;

    const prods = productos
      .filter(p => sinTildes(p.name).includes(q) || sinTildes(p.code).includes(q))
      .slice(0, 5)
      .map(p => ({ tipo: 'producto', id: `pr-${p.id}`, dato: p }));

    const clis = clientes
      .filter(c => sinTildes(c.name).includes(q) || sinTildes(c.doc).includes(q))
      .slice(0, 4)
      .map(c => ({ tipo: 'cliente', id: `cl-${c.id}`, dato: c }));

    return [...prods, ...clis, ...pantallasFiltradas];
  }, [texto, productos, clientes, pantallas]);

  useEffect(() => { setActivo(0); }, [texto]);

  const elegir = (item) => {
    if (!item) return;
    if (item.tipo === 'pantalla') onIr(item.id.replace(/^p-/, ''));
    else if (item.tipo === 'producto') onIr('inventory', item.dato.code);
    else if (item.tipo === 'cliente') onIr('client-dir', item.dato.doc || item.dato.name);
    onClose();
  };

  const alTeclear = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(i => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(resultados[activo]); }
    else if (e.key === 'Escape') onClose();
  };

  // La fila activa siempre visible al moverse con las flechas.
  useEffect(() => {
    listaRef.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activo]);

  if (!open) return null;

  const encabezado = (texto) => (
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted px-3 pt-3 pb-1">{texto}</p>
  );

  let grupoAnterior = null;

  return (
    <div
      className="fixed inset-0 z-[150] bg-panel-strong/60 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-float w-full max-w-xl overflow-hidden flex flex-col max-h-[70vh]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <i className="fa-solid fa-magnifying-glass text-muted"></i>
          <input
            ref={campoRef}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={alTeclear}
            placeholder="Buscar productos, clientes o pantallas…"
            className="flex-1 text-sm text-ink outline-none bg-transparent placeholder:text-muted"
          />
          <kbd className="text-[10px] font-bold text-muted border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listaRef} className="overflow-y-auto py-1">
          {resultados.length === 0 && (
            <p className="text-sm text-muted text-center py-8">Nada coincide con “{texto}”.</p>
          )}
          {resultados.map((item, i) => {
            const titulo = { producto: 'Productos', cliente: 'Clientes', pantalla: 'Ir a' }[item.tipo];
            const nuevoGrupo = titulo !== grupoAnterior;
            grupoAnterior = titulo;
            const seleccionado = i === activo;

            return (
              <React.Fragment key={item.id}>
                {nuevoGrupo && encabezado(titulo)}
                <button
                  data-activo={seleccionado}
                  onMouseEnter={() => setActivo(i)}
                  onClick={() => elegir(item)}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-3 ${seleccionado ? 'bg-brand-soft' : ''}`}
                >
                  <i className={`fa-solid ${item.tipo === 'producto' ? 'fa-box' : item.tipo === 'cliente' ? 'fa-user' : item.icon} w-5 text-center ${seleccionado ? 'text-brand' : 'text-muted'}`}></i>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-ink truncate">
                      {item.tipo === 'pantalla' ? item.label : item.dato.name}
                    </span>
                    {item.tipo === 'producto' && (
                      <span className="block text-[11px] text-muted truncate">
                        {item.dato.code} · {formatSoles(item.dato.price)} · {item.dato.stock} en stock
                      </span>
                    )}
                    {item.tipo === 'cliente' && (
                      <span className="block text-[11px] text-muted truncate">
                        {item.dato.doc}{item.dato.debt > 0 && ` · debe ${formatSoles(item.dato.debt)}`}
                      </span>
                    )}
                  </span>
                  {seleccionado && <i className="fa-solid fa-turn-down fa-rotate-90 text-muted text-xs"></i>}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-line bg-surface-muted text-[11px] text-muted flex gap-4">
          <span><kbd className="font-bold">↑ ↓</kbd> moverse</span>
          <span><kbd className="font-bold">Enter</kbd> abrir</span>
          <span className="ml-auto"><kbd className="font-bold">Ctrl</kbd> + <kbd className="font-bold">K</kbd> desde cualquier pantalla</span>
        </div>
      </div>
    </div>
  );
}
