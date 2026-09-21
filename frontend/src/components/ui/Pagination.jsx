import React, { useEffect, useMemo, useState } from 'react';

export const PAGE_SIZE = 10;

// Página actual de una lista ya filtrada. Vuelve a la primera cuando cambia la lista (otro filtro o
// búsqueda) y nunca queda en una página que ya no existe.
export function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pages - 1);

  useEffect(() => { setPage(0); }, [items.length]);

  const pageItems = useMemo(
    () => items.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [items, safePage, pageSize],
  );
  return { page: safePage, pages, setPage, pageItems, total: items.length, pageSize };
}

// Pie de la lista: "11–20 de 57" y botones. Con una sola página no se muestra.
export default function Pagination({ page, pages, setPage, total, pageSize, className = '' }) {
  if (pages <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);
  const btn = 'w-8 h-8 rounded-lg border border-line text-ink-soft text-xs font-bold hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed';

  // Hasta 5 números alrededor de la página actual.
  const start = Math.max(0, Math.min(page - 2, pages - 5));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-line text-xs text-muted ${className}`}>
      <span>{from}–{to} de {total}</span>
      <div className="flex items-center gap-1">
        <button type="button" className={btn} disabled={page === 0} onClick={() => setPage(page - 1)} title="Anterior">
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        {numbers.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setPage(n)}
            className={`${btn} ${n === page ? 'bg-brand text-brand-contrast border-brand hover:bg-brand' : ''}`}
          >
            {n + 1}
          </button>
        ))}
        <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => setPage(page + 1)} title="Siguiente">
          <i className="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}
