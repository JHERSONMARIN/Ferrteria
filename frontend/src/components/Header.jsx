import React from 'react';
import Badge from './ui/Badge.jsx';

// Barra superior: el nombre de la pantalla se escribe aquí y en ningún otro lado, para no repetirlo
// dentro de la página. A la derecha queda el contexto (la sucursal en la que se está trabajando).
export default function Header({ pageTitle, pageHint, user, showBranch = false, onResetDemo, onToggleSidebar, onBuscar }) {
  return (
    <header className="h-16 bg-surface border-b border-line flex items-center justify-between px-3 sm:px-5 gap-3 shrink-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="text-muted hover:text-ink lg:hidden shrink-0 p-2 -ml-1 rounded-lg hover:bg-surface-muted"
          title="Menú"
        >
          <i className="fa-solid fa-bars text-lg"></i>
        </button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-ink truncate leading-tight">{pageTitle}</h1>
          {pageHint && <p className="text-xs text-muted truncate hidden sm:block">{pageHint}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* El buscador general: visible para que se sepa que existe, y con su atajo a la vista. */}
        {onBuscar && (
          <button
            onClick={onBuscar}
            className="flex items-center gap-2 text-sm text-muted bg-surface-muted border border-line rounded-xl px-3 py-2 hover:border-brand hover:text-ink transition-colors"
            title="Buscar en todo el sistema (Ctrl+K)"
          >
            <i className="fa-solid fa-magnifying-glass"></i>
            <span className="hidden md:inline">Buscar</span>
            <kbd className="hidden md:inline text-[10px] font-bold border border-line rounded px-1.5 py-0.5 bg-surface">Ctrl K</kbd>
          </button>
        )}
        {user && showBranch && user.branch && (
          <Badge tone="brand" icon="fa-store">{user.branch.name}</Badge>
        )}
        {onResetDemo && (
          <button
            onClick={onResetDemo}
            className="text-xs font-semibold text-danger hover:bg-danger-soft px-2.5 py-1.5 rounded-lg hidden sm:block"
          >
            Reiniciar demo
          </button>
        )}
      </div>
    </header>
  );
}
