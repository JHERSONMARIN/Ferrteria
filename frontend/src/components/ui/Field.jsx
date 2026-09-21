import React from 'react';

// Campos de formulario: etiqueta arriba, ayuda o error abajo. Todos los campos del sistema
// se escriben con estos tres componentes para que midan y se vean igual.
const base = `w-full rounded-xl border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors
  placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-surface-muted
  disabled:text-muted`;

const borde = (error) => (error ? 'border-danger' : 'border-line');

export function Field({ label, error, hint, required, className = '', children }) {
  return (
    <div className={className}>
      {label && (
        <label className="text-xs font-bold text-ink-soft mb-1 block">
          {label}{required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error
        ? <p className="text-[11px] text-danger mt-1 font-semibold"><i className="fa-solid fa-circle-exclamation mr-1"></i>{error}</p>
        : hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

export function Input({ error, className = '', ...props }) {
  return <input {...props} className={`${base} ${borde(error)} ${className}`} />;
}

export function Select({ error, className = '', children, ...props }) {
  return <select {...props} className={`${base} ${borde(error)} ${className}`}>{children}</select>;
}

export function Textarea({ error, className = '', ...props }) {
  return <textarea {...props} className={`${base} ${borde(error)} ${className}`} />;
}

// Buscador: el campo más usado del sistema, siempre con su lupa y su botón de limpiar.
export function SearchInput({ value, onChange, placeholder = 'Buscar…', className = '', ...props }) {
  return (
    <div className={`relative ${className}`}>
      <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm"></i>
      <input
        {...props}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`${base} ${borde(false)} pl-9 pr-8`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange({ target: { value: '' } })}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink px-1"
          title="Limpiar"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      )}
    </div>
  );
}

export default Field;
