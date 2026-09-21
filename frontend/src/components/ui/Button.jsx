import React from 'react';

// Botones del sistema. Solo hay cuatro tipos y dos tamaños: si hace falta otro, se agrega aquí
// y no en la pantalla, para que todos se vean igual.
//
//   primary    la acción principal de la pantalla (una sola por pantalla)
//   secondary  acciones de apoyo
//   ghost      acciones menores, sin peso visual
//   danger     borrar o anular
const VARIANTS = {
  primary: 'bg-brand text-brand-contrast hover:bg-brand-strong shadow-card',
  secondary: 'bg-surface text-ink-soft border border-line hover:bg-surface-muted',
  ghost: 'text-ink-soft hover:bg-surface-muted',
  danger: 'bg-danger text-white hover:brightness-95 shadow-card',
};

const SIZES = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  block = false,
  className = '',
  disabled,
  children,
  ...props
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-xl font-semibold transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2
        focus-visible:ring-brand/40 ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
    >
      {loading
        ? <i className="fa-solid fa-spinner fa-spin"></i>
        : icon && <i className={`fa-solid ${icon}`}></i>}
      {children}
    </button>
  );
}
