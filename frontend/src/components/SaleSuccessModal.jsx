import React from 'react';
import { formatSoles } from '../utils/currency.js';

// Confirmación de una operación terminada (venta cobrada, pedido enviado a caja…).
export default function SaleSuccessModal({ icon = 'fa-check', title, highlight, subtitle, rows = [], change = null, buttonLabel, onClose }) {
  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-success-soft text-success flex items-center justify-center mx-auto mb-3 text-3xl">
          <i className={`fa-solid ${icon}`}></i>
        </div>
        <h3 className="text-xl font-bold text-ink">{title}</h3>
        {highlight && <p className="text-4xl font-black text-ink mt-2 tabular-nums">{highlight}</p>}
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}

        {(rows.length > 0 || change !== null) && (
          <div className="mt-4 rounded-xl bg-surface-muted border border-line divide-y divide-line text-sm">
            {rows.map(row => (
              <div key={row.label} className="flex justify-between px-4 py-2.5">
                <span className="text-muted">{row.label}</span>
                <span className="font-bold text-ink">{row.value}</span>
              </div>
            ))}
            {change !== null && (
              <div className="flex justify-between items-center px-4 py-3 bg-success-soft">
                <span className="text-success font-semibold">Vuelto a entregar</span>
                <span className="text-2xl font-black text-success tabular-nums">{formatSoles(change)}</span>
              </div>
            )}
          </div>
        )}

        <button
          autoFocus
          onClick={onClose}
          className="mt-5 w-full bg-brand hover:bg-brand-strong text-brand-contrast font-bold py-3 rounded-lg shadow-md transition-colors"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
