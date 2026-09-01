import React from 'react';

export default function Header({ pageTitle, user, onLogout, onResetDemo }) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center">
          {pageTitle}
          {user && (
            <span className="text-xs bg-slate-200 px-3 py-1 rounded-full text-slate-600 ml-4 font-normal flex items-center gap-1">
              <i className="fa-solid fa-user text-slate-500"></i> {user.name} ({user.role})
            </span>
          )}
          {user && (
            <button
              onClick={onLogout}
              className="text-xs font-bold text-red-500 hover:text-red-700 underline ml-3"
            >
              Cerrar Sesión
            </button>
          )}
        </h2>
      </div>

      <button
        onClick={onResetDemo}
        className="text-xs text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded font-bold border border-red-200"
      >
        Reset Demo
      </button>
    </header>
  );
}
