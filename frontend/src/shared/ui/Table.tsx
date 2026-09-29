import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

// Tabla del sistema: encabezado fijo, filas altas y números alineados a la derecha con cifras
// del mismo ancho (tabular-nums), que es lo que permite comparar cantidades de un vistazo.
export function Table({ className = '', children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`overflow-auto ${className}`}>
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  );
}

export function THead({ children }: { children?: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface-muted">
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

// Tailwind necesita ver las clases completas: por eso se listan en vez de armarlas con plantillas.
type Align = 'left' | 'center' | 'right';
const ALIGN: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };

export function Th({ align = 'left', className = '', children, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { align?: Align }) {
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

export function TBody({ children }: { children?: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function Tr({ onClick, selected = false, className = '', children, ...props }: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
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

export function Td({ align = 'left', numeric = false, className = '', children, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { align?: Align; numeric?: boolean }) {
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
