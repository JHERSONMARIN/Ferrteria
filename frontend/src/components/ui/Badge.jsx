import React from 'react';

// Etiqueta de estado. El color comunica: verde bien, ámbar atención, rojo problema, azul informativo.
// Para lo que no es un estado se usa "neutral": el color no se gasta en decorar.
const TONES = {
  neutral: 'bg-surface-muted text-ink-soft border-line',
  brand: 'bg-brand-soft text-brand-text border-brand/20',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
  info: 'bg-info-soft text-info border-info/20',
};

export default function Badge({ tone = 'neutral', icon, className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-xs
      font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}>
      {icon && <i className={`fa-solid ${icon}`}></i>}
      {children}
    </span>
  );
}
