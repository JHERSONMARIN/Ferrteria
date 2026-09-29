import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Product } from '@ferresys/contracts/catalog';
import type { Customer } from '@ferresys/contracts/customers';
import { api } from '../api/client.ts';
import { queryKeys } from '../api/queryClient.ts';
import type { ScreenId } from './screens.ts';
import { formatSoles } from '../shared/utils/currency.ts';
import { capitalize, useVocabulary } from '../shared/industry/vocabulary.ts';

// Buscador general: se abre con Ctrl+K (o Ctrl+Barra) desde cualquier pantalla y encuentra de una vez
// productos, clientes y las pantallas del sistema. Es el atajo de quien pasa el día vendiendo.
//
// Al elegir un resultado se va a la pantalla que corresponde con la búsqueda ya escrita.
const sinTildes = (texto: string | null | undefined) => (texto || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

interface Pantalla {
  id: ScreenId;
  label: string;
  icon: string;
}

type Resultado =
  | ({ tipo: 'pantalla' } & Pantalla & { key: string })
  | { tipo: 'producto'; key: string; dato: Product }
  | { tipo: 'cliente'; key: string; dato: Customer };

interface Props {
  open: boolean;
  onClose: () => void;
  pantallas: Pantalla[];
  onIr: (pantalla: ScreenId, texto?: string) => void;
}

const TITULOS: Record<Resultado['tipo'], string> = { producto: 'Productos', cliente: 'Clientes', pantalla: 'Ir a' };

export default function BuscadorGlobal({ open, onClose, pantallas, onIr }: Props) {
  const [texto, setTexto] = useState('');
  const [activo, setActivo] = useState(0);
  const campoRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const vocabulary = useVocabulary();

  // Los datos se piden al abrir (si tienen más de unos segundos): así muestra stock y deudas al día.
  const productos = useQuery({
    queryKey: queryKeys.products,
    queryFn: () => api.get<Product[]>('/productos'),
    enabled: open,
    staleTime: 0,
  }).data ?? [];
  const clientes = useQuery({
    queryKey: queryKeys.customers,
    queryFn: () => api.get<Customer[]>('/clientes'),
    enabled: open,
    staleTime: 0,
  }).data ?? [];

  useEffect(() => {
    if (!open) return;
    setTexto('');
    setActivo(0);
    campoRef.current?.focus();
  }, [open]);

  const resultados = useMemo((): Resultado[] => {
    const q = sinTildes(texto).trim();
    const pantallasFiltradas = (q
      ? pantallas.filter(p => sinTildes(p.label).includes(q))
      : pantallas
    ).slice(0, q ? 4 : 6).map(p => ({ tipo: 'pantalla' as const, key: `p-${p.id}`, ...p }));

    if (!q) return pantallasFiltradas;

    const prods = productos
      .filter(p => sinTildes(p.name).includes(q) || sinTildes(p.code).includes(q))
      .slice(0, 5)
      .map(p => ({ tipo: 'producto' as const, key: `pr-${p.id}`, dato: p }));

    const clis = clientes
      .filter(c => sinTildes(c.name).includes(q) || sinTildes(c.doc).includes(q))
      .slice(0, 4)
      .map(c => ({ tipo: 'cliente' as const, key: `cl-${c.id}`, dato: c }));

    return [...prods, ...clis, ...pantallasFiltradas];
  }, [texto, productos, clientes, pantallas]);

  useEffect(() => { setActivo(0); }, [texto]);

  const elegir = (item: Resultado | undefined) => {
    if (!item) return;
    if (item.tipo === 'pantalla') onIr(item.id);
    else if (item.tipo === 'producto') onIr('inventory', item.dato.code);
    else if (item.tipo === 'cliente') onIr('client-dir', item.dato.doc || item.dato.name);
    onClose();
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(i => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(resultados[activo]); }
    else if (e.key === 'Escape') onClose();
  };

  // La fila activa siempre visible al moverse con las flechas.
  useEffect(() => {
    listaRef.current?.querySelector('[data-activo="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [activo]);

  if (!open) return null;

  const encabezado = (texto: string) => (
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted px-3 pt-3 pb-1">{texto}</p>
  );

  let grupoAnterior: string | null = null;

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
            placeholder={`Buscar ${vocabulary.products}, clientes o pantallas…`}
            className="flex-1 text-sm text-ink outline-none bg-transparent placeholder:text-muted"
          />
          <kbd className="text-[10px] font-bold text-muted border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listaRef} className="overflow-y-auto py-1">
          {resultados.length === 0 && (
            <p className="text-sm text-muted text-center py-8">Nada coincide con “{texto}”.</p>
          )}
          {resultados.map((item, i) => {
            const titulo = item.tipo === 'producto' ? capitalize(vocabulary.products) : TITULOS[item.tipo];
            const nuevoGrupo = titulo !== grupoAnterior;
            grupoAnterior = titulo;
            const seleccionado = i === activo;

            return (
              <Fragment key={item.key}>
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
                        {item.dato.doc}{item.dato.currentDebt > 0 && ` · debe ${formatSoles(item.dato.currentDebt)}`}
                      </span>
                    )}
                  </span>
                  {seleccionado && <i className="fa-solid fa-turn-down fa-rotate-90 text-muted text-xs"></i>}
                </button>
              </Fragment>
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
