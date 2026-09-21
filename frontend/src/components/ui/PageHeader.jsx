import React from 'react';

// Encabezado de página: el título va una sola vez, aquí. Las pantallas no repiten su nombre adentro.
// A la derecha, la acción principal; debajo, opcionalmente, una fila de filtros o de indicadores.
export default function PageHeader({ title, description, actions, children }) {
  return (
    <div className="px-4 pt-4 pb-3 flex flex-col gap-3 shrink-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink truncate">{title}</h2>
          {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
