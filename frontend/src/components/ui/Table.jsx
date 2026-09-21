import React from 'react';

// Tabla del sistema: encabezado fijo, filas altas y números alineados a la derecha con cifras
// del mismo ancho (tabular-nums), que es lo que permite comparar cantidades de un vistazo.
export function Table({ className = '', children }) {
  return (
    <div className={`overflow-auto ${className}`}>
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  );
}

export function THead({ children }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface-muted">
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

// Tailwind necesita ver las clases completas: por eso se listan en vez de armarlas con plantillas.
const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' };

export function Th({ align = 'left', className = '', children, ...props }) {
  return (
    <th
      {...props}
      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted whitespace-nowrap
        ${ALIGN[align]} ${className}`}
    >
      {children}
    </th>
  );
}

export function TBody({ children }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function Tr({ onClick, selected = false, className = '', children, ...props }) {
  return (
    <tr
      {...props}
      onClick={onClick}
      className={`${onClick ? 'cursor-pointer' : ''} ${selected ? 'bg-brand-soft' : 'hover:bg-surface-muted'}
        transition-colors ${className}`}
    >
      {children}
    </tr>
  );
}

export function Td({ align = 'left', numeric = false, className = '', children, ...props }) {
  return (
    <td
      {...props}
      className={`px-3 py-2.5 text-ink-soft align-middle ${numeric ? ALIGN.right : ALIGN[align]}
        ${numeric ? 'tabular-nums font-medium text-ink' : ''} ${className}`}
    >
      {children}
    </td>
  );
}

export default Table;
