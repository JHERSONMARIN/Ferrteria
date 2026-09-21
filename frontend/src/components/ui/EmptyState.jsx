import React from 'react';

// Lo que se ve cuando no hay nada: explica por qué está vacío y qué hacer, nunca una tabla en blanco.
export default function EmptyState({ icon = 'fa-inbox', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 gap-2">
      <div className="w-14 h-14 rounded-2xl bg-surface-muted border border-line flex items-center justify-center">
        <i className={`fa-solid ${icon} text-xl text-muted`}></i>
      </div>
      <p className="text-sm font-bold text-ink mt-1">{title}</p>
      {description && <p className="text-xs text-muted max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
