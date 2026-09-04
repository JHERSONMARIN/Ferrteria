import React from 'react';

export default function Sidebar({ activeTab, onSwitchTab, user }) {
  const allowedModules = user?.modules || [];

  const navItems = [
    { section: 'Operaciones', items: [
      { id: 'pos', label: 'Punto de Venta', icon: 'fa-cash-register' },
      { id: 'caja', label: 'Arqueo de Caja', icon: 'fa-vault' },
      { id: 'inventory', label: 'Almacén', icon: 'fa-boxes-stacked', subItems: [
        { id: 'inventory', label: 'Productos', icon: 'fa-box' },
        { id: 'categories', label: 'Categorías', icon: 'fa-tags' },
        // { id: 'suppliers', label: 'Proveedores', icon: 'fa-truck' },
      ]},
      { id: 'kardex', label: 'Kardex / Movimientos', icon: 'fa-receipt' },
      { id: 'compras', label: 'Compras a Proveedores', icon: 'fa-cart-flatbed' },
      { id: 'deliveries', label: 'Entregas', icon: 'fa-truck-fast' },
    ]},
    { section: 'Administración', items: [
      { id: 'client-dir', label: 'Directorio Clientes', icon: 'fa-users' },
      { id: 'customers', label: 'Créditos / Fiados', icon: 'fa-book-journal-whills' },
      { id: 'personal', label: 'Módulo Personal', icon: 'fa-id-badge' },
      { id: 'dashboard', label: 'Finanzas / Reportes', icon: 'fa-chart-pie' },
    ]}
  ];

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col transition-all z-20 shrink-0 h-screen">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
        <i className="fa-solid fa-screwdriver-wrench text-orange-500 text-xl mr-3"></i>
        <span className="font-bold text-lg tracking-wide">
          FerreSys <span className="text-xs text-orange-500 align-top">v4.8</span>
        </span>
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
                      onClick={() => onSwitchTab(item.id)}
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
                              onClick={() => onSwitchTab(subItem.id)}
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
    </aside>
  );
}
