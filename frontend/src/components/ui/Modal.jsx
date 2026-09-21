import React, { useEffect } from 'react';

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };

// Ventana del sistema. Reemplaza a las ventanas del navegador (alert y confirm), que se ven
// como un error del sistema y no como parte del producto. Se cierra con Esc o tocando el fondo.
export default function Modal({ open, onClose, title, description, icon, size = 'md', footer, children }) {
  useEffect(() => {
    if (!open || !onClose) return;
    const alSoltarTecla = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alSoltarTecla);
    return () => window.removeEventListener('keydown', alSoltarTecla);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-panel-strong/60 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget && onClose) onClose(); }}
    >
      <div className={`bg-surface rounded-2xl shadow-float w-full ${SIZES[size]} max-h-[90vh] flex flex-col overflow-hidden`}>
        {title && (
          <header className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-line shrink-0">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                {icon && <i className={`fa-solid ${icon} text-muted`}></i>}
                {title}
              </h3>
              {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
            </div>
            {onClose && (
              <button onClick={onClose} className="text-muted hover:text-ink p-1 shrink-0" title="Cerrar">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            )}
          </header>
        )}
        <div className="p-5 overflow-auto flex-1">{children}</div>
        {footer && (
          <footer className="px-5 py-3 border-t border-line bg-surface-muted flex items-center justify-end gap-2 shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
