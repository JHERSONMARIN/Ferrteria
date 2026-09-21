import React from 'react';

// Tarjeta: la caja blanca sobre la que va todo el contenido. Con título opcional.
export default function Card({ icon, title, description, actions, padding = true, className = '', children }) {
  return (
    <section className={`bg-surface border border-line rounded-2xl shadow-card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-line">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              {icon && <i className={`fa-solid ${icon} text-muted`}></i>}
              {title}
            </h3>
            {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padding ? 'p-4' : ''}>{children}</div>
    </section>
  );
}
