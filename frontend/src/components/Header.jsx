import React from 'react';
import { roleLabel } from '../constants/roles.js';

export default function Header({ pageTitle, user, showBranch = false, onResetDemo, onToggleSidebar }) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 gap-2 shadow-sm z-10 shrink-0">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="text-slate-500 hover:text-orange-600 lg:hidden shrink-0 p-1"
        >
          <i className="fa-solid fa-bars text-lg"></i>
        </button>
        <h2 className="text-base sm:text-xl font-bold text-slate-800 flex items-center flex-wrap gap-2 min-w-0">
          <span className="truncate">{pageTitle}</span>
          {user && (
            <span className="hidden sm:flex text-xs bg-slate-200 px-3 py-1 rounded-full text-slate-600 font-normal items-center gap-1">
              <i className="fa-solid fa-user text-slate-500"></i> {user.name} ({roleLabel(user.role)})
            </span>
          )}
          {user && showBranch && user.branch && (
            <span className="flex text-xs bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full text-orange-700 font-semibold items-center gap-1">
              <i className="fa-solid fa-store"></i> {user.branch.name}
            </span>
          )}
        </h2>
      </div>

      {onResetDemo && (
        <button
          onClick={onResetDemo}
          className="text-xs text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded font-bold border border-red-200 shrink-0 hidden sm:block"
        >
          Reset Demo
        </button>
      )}
    </header>
  );
}
