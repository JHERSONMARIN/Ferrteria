import React from 'react';
import { roleLabel } from '../constants/roles.js';

export default function Sidebar({ activeTab, onSwitchTab, user, modules, businessName, businessLogo, open, onClose, onLogout, onChangePassword }) {
  const allowedModules = modules || [];

  const handleSwitchTab = (tabId) => {
    onSwitchTab(tabId);
    if (onClose) onClose();
  };

  const navItems = [
    { section: 'Operaciones', items: [
      { id: 'pos', label: 'Punto de Venta', icon: 'fa-cash-register' },
      { id: 'cobros', label: 'Por cobrar', icon: 'fa-hand-holding-dollar' },
      { id: 'despacho', label: 'Por despachar', icon: 'fa-dolly' },
      { id: 'cotizaciones', label: 'Cotizaciones', icon: 'fa-file-invoice' },
      { id: 'caja', label: 'Arqueo de Caja', icon: 'fa-vault' },
      { id: 'inventory', label: 'Almacén', icon: 'fa-boxes-stacked', subItems: [
        { id: 'inventory', label: 'Productos', icon: 'fa-box' },
        { id: 'categories', label: 'Categorías', icon: 'fa-tags' },
        // { id: 'suppliers', label: 'Proveedores', icon: 'fa-truck' },
      ]},
      { id: 'kardex', label: 'Kardex / Movimientos', icon: 'fa-receipt' },
      { id: 'transfers', label: 'Transferencias', icon: 'fa-right-left' },
      { id: 'compras', label: 'Compras a Proveedores', icon: 'fa-cart-flatbed' },
      { id: 'deliveries', label: 'Entregas', icon: 'fa-truck-fast' },
    ]},
    { section: 'Administración', items: [
      { id: 'client-dir', label: 'Directorio Clientes', icon: 'fa-users' },
      { id: 'customers', label: 'Créditos / Fiados', icon: 'fa-book-journal-whills' },
      { id: 'personal', label: 'Módulo Personal', icon: 'fa-id-badge' },
      { id: 'dashboard', label: 'Finanzas / Reportes', icon: 'fa-chart-pie' },
      { id: 'audit', label: 'Auditoría', icon: 'fa-shield-halved' },
      { id: 'settings', label: 'Configuración', icon: 'fa-gear' },
    ]}
  ];

  return (
    <>
      {/* Fondo oscuro al abrir el menú en móvil/tablet */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 z-30 lg:hidden"
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 w-64 bg-slate-900 text-white flex flex-col z-40 shrink-0 h-screen transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
      <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-950 shrink-0">
        <div className="flex items-center min-w-0 gap-3">
          {businessLogo
            ? <img src={businessLogo} alt="" className="w-9 h-9 rounded-lg object-contain bg-white/90 p-0.5 shrink-0" />
            : <i className="fa-solid fa-screwdriver-wrench text-orange-500 text-xl shrink-0"></i>}
          <div className="min-w-0">
            <span className="block font-bold text-base tracking-wide truncate leading-tight">
              {businessName || 'FerreSys'}
            </span>
            <span className="block text-[11px] text-slate-400 truncate">
              {businessName ? 'FerreSys v4.8' : 'v4.8'}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white lg:hidden shrink-0 ml-2"
        >
          <i className="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
        {navItems.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => allowedModules.includes(item.id));
          if (visibleItems.length === 0) return null;

          return (
            <React.Fragment key={gIdx}>
              <p className="text-xs font-bold text-slate-500 px-3 mt-2 mb-2 uppercase">
                {group.section}
              </p>
              { visibleItems.map(item => {
                const isActive = activeTab === item.id || item.subItems?.some(subItem => subItem.id === activeTab);
                return (
                  <React.Fragment key={item.id}>
                    <button
                      key={item.id}
                      onClick={() => handleSwitchTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-orange-600 text-white shadow-md'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <i className={`fa-solid ${item.icon} w-5`}></i>
                      {item.label}
                    </button>

                    {item.subItems && isActive && (
                      <div className="ml-6 mt-1 flex flex-col gap-1">
                        {item.subItems.map(subItem => {
                          const isSubActive = activeTab === subItem.id;
                          return (
                            <button
                              key={subItem.id}
                              onClick={() => handleSwitchTab(subItem.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                                isSubActive
                                  ? 'bg-orange-800 text-white shadow-md'
                                  : 'text-slate-100 hover:bg-slate-800'
                              }`}
                            >
                              <i className={`fa-solid ${subItem.icon} w-5`}></i>
                              {subItem.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-slate-800 p-3 shrink-0">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-2 text-slate-300 min-w-0">
            <i className="fa-solid fa-user text-slate-500 shrink-0"></i>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{user.name}</p>
              <p className="text-[10px] text-slate-500 uppercase truncate">{roleLabel(user.role)}</p>
            </div>
          </div>
          <button
            onClick={() => { onChangePassword(); if (onClose) onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <i className="fa-solid fa-key w-5"></i>
            Cambiar contraseña
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-bold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
          >
            <i className="fa-solid fa-right-from-bracket w-5"></i>
            Cerrar Sesión
          </button>
        </div>
      )}
      </aside>
    </>
  );
}
