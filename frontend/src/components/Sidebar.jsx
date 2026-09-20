import React, { useEffect, useState } from 'react';
import { roleLabel } from '../constants/roles.js';

// El menú está ordenado por frecuencia de uso: arriba lo de todos los días, al final lo que se
// toca una vez al mes. Configuración y la sesión viven abajo, separadas del trabajo diario.
const NAV_GROUPS = [
  { section: 'Todos los días', items: [
    { id: 'pos', label: 'Vender', icon: 'fa-cash-register' },
    { id: 'cobros', label: 'Por cobrar', icon: 'fa-hand-holding-dollar', badge: 'cobros' },
    { id: 'despacho', label: 'Por despachar', icon: 'fa-dolly', badge: 'despacho' },
    { id: 'caja', label: 'Caja', icon: 'fa-vault' },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: 'fa-file-invoice' },
    { id: 'deliveries', label: 'Entregas', icon: 'fa-truck-fast' },
  ]},
  { section: 'Almacén', items: [
    { id: 'inventory', label: 'Productos', icon: 'fa-boxes-stacked', subItems: [
      { id: 'inventory', label: 'Productos', icon: 'fa-box' },
      { id: 'categories', label: 'Categorías', icon: 'fa-tags' },
    ]},
    { id: 'kardex', label: 'Movimientos', icon: 'fa-receipt' },
    { id: 'compras', label: 'Compras', icon: 'fa-cart-flatbed' },
    { id: 'transfers', label: 'Transferencias', icon: 'fa-right-left' },
  ]},
  { section: 'Administración', items: [
    { id: 'client-dir', label: 'Clientes', icon: 'fa-users' },
    { id: 'customers', label: 'Créditos', icon: 'fa-book-journal-whills' },
    { id: 'personal', label: 'Personal', icon: 'fa-id-badge' },
    { id: 'dashboard', label: 'Reportes', icon: 'fa-chart-pie' },
    { id: 'audit', label: 'Auditoría', icon: 'fa-shield-halved' },
  ]},
];

// Configuración va aparte, al pie: no es trabajo diario.
const SETTINGS_ITEM = { id: 'settings', label: 'Configuración', icon: 'fa-gear' };

const CLAVE_COMPACTO = 'ferre_menu_compacto';

// Un botón del menú. Compacto muestra solo el ícono, con el nombre en el globo de ayuda.
function NavButton({ item, active, compact, count, sub = false, onClick }) {
  return (
    <button
      onClick={onClick}
      title={compact ? item.label : undefined}
      className={`relative w-full flex items-center gap-3 rounded-xl text-left text-sm font-medium transition-colors
        ${compact ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
        ${active
          ? 'bg-brand text-brand-contrast shadow-card'
          : `${sub ? 'text-nav-ink' : 'text-nav-muted'} hover:bg-white/10 hover:text-nav-ink`}`}
    >
      <i className={`fa-solid ${item.icon} w-5 text-center shrink-0`}></i>
      {!compact && <span className="flex-1 min-w-0 truncate">{item.label}</span>}
      {count > 0 && (
        <span className={`rounded-full text-[10px] font-bold px-1.5 py-0.5 min-w-[1.25rem] text-center leading-tight
          ${compact ? 'absolute top-1 right-1' : ''}
          ${active ? 'bg-white/25 text-brand-contrast' : 'bg-warning text-white'}`}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({
  activeTab, onSwitchTab, user, modules, businessName, businessLogo, open, onClose, onLogout,
  onChangePassword, counts = {}, oculto = false,
}) {
  const allowedModules = modules || [];
  // El modo compacto es una preferencia de quien usa el sistema: se recuerda en este navegador.
  const [compact, setCompact] = useState(() => localStorage.getItem(CLAVE_COMPACTO) === '1');
  useEffect(() => { localStorage.setItem(CLAVE_COMPACTO, compact ? '1' : '0'); }, [compact]);

  const handleSwitchTab = (tabId) => {
    onSwitchTab(tabId);
    if (onClose) onClose();
  };

  const puedeVer = (id) => allowedModules.includes(id);

  return (
    <>
      {/* Fondo oscuro al abrir el menú en móvil/tablet */}
      {open && <div onClick={onClose} className={`fixed inset-0 bg-nav-strong/60 z-30 ${oculto ? '' : 'lg:hidden'}`} />}

      <aside
        className={`fixed inset-y-0 left-0 bg-nav text-nav-ink flex flex-col z-40 shrink-0 h-screen
          transition-transform duration-200 ${compact ? 'w-64 lg:w-[4.5rem]' : 'w-64'}
          ${oculto ? '' : 'lg:static lg:translate-x-0'}
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Marca de la empresa */}
        <div className={`h-16 flex items-center justify-between border-b border-white/10 bg-nav-strong shrink-0
          ${compact ? 'lg:px-2 px-4' : 'px-4'}`}>
          <div className="flex items-center min-w-0 gap-3">
            {businessLogo
              ? <img src={businessLogo} alt="" className="w-9 h-9 rounded-lg object-contain bg-white/90 p-0.5 shrink-0" />
              : <i className="fa-solid fa-screwdriver-wrench text-brand text-xl w-9 text-center shrink-0"></i>}
            <div className={`min-w-0 ${compact ? 'lg:hidden' : ''}`}>
              <span className="block font-bold text-base truncate leading-tight text-white">
                {businessName || 'FerreSys'}
              </span>
              <span className="block text-[11px] text-nav-muted truncate">
                {businessName ? 'FerreSys v4.8' : 'v4.8'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-nav-muted hover:text-white lg:hidden shrink-0 ml-2">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-0.5 ${compact ? 'lg:px-2 px-3' : 'px-3'}`}>
          {NAV_GROUPS.map(group => {
            const visibles = group.items.filter(item => puedeVer(item.id));
            if (visibles.length === 0) return null;

            return (
              <React.Fragment key={group.section}>
                <p className={`text-[10px] font-bold text-nav-muted/70 px-3 mt-3 mb-1.5 uppercase tracking-wider
                  ${compact ? 'lg:hidden' : ''}`}>
                  {group.section}
                </p>
                {compact && <div className="hidden lg:block h-px bg-white/10 my-2" />}

                {visibles.map(item => {
                  const active = activeTab === item.id || item.subItems?.some(s => s.id === activeTab);
                  return (
                    <React.Fragment key={item.id}>
                      <NavButton
                        item={item}
                        active={active}
                        compact={compact}
                        count={counts[item.badge]}
                        onClick={() => handleSwitchTab(item.id)}
                      />
                      {/* Los submenús solo se abren con la sección activa y con el menú ancho */}
                      {item.subItems && active && !compact && (
                        <div className="ml-4 pl-3 border-l border-white/10 flex flex-col gap-0.5 my-0.5">
                          {item.subItems.map(sub => (
                            <NavButton
                              key={sub.id}
                              item={sub}
                              sub
                              active={activeTab === sub.id}
                              compact={false}
                              onClick={() => handleSwitchTab(sub.id)}
                            />
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Pie: configuración, usuario y sesión */}
        <div className={`border-t border-white/10 py-2 shrink-0 flex flex-col gap-0.5 ${compact ? 'lg:px-2 px-3' : 'px-3'}`}>
          {puedeVer(SETTINGS_ITEM.id) && (
            <NavButton
              item={SETTINGS_ITEM}
              active={activeTab === SETTINGS_ITEM.id}
              compact={compact}
              onClick={() => handleSwitchTab(SETTINGS_ITEM.id)}
            />
          )}

          {user && (
            <>
              <div className={`flex items-center gap-3 px-3 py-2 text-nav-ink min-w-0 ${compact ? 'lg:hidden' : ''}`}>
                <i className="fa-solid fa-circle-user text-nav-muted text-lg shrink-0"></i>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{user.name}</p>
                  <p className="text-[10px] text-nav-muted uppercase truncate">{roleLabel(user.role)}</p>
                </div>
              </div>
              <NavButton
                item={{ label: 'Cambiar contraseña', icon: 'fa-key' }}
                compact={compact}
                onClick={() => { onChangePassword(); if (onClose) onClose(); }}
              />
              <button
                onClick={onLogout}
                title={compact ? 'Cerrar sesión' : undefined}
                className={`w-full flex items-center gap-3 rounded-xl text-left text-sm font-semibold
                  text-danger hover:bg-danger/15 transition-colors
                  ${compact ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}`}
              >
                <i className="fa-solid fa-right-from-bracket w-5 text-center shrink-0"></i>
                {!compact && 'Cerrar sesión'}
              </button>
            </>
          )}

          {/* Ancho del menú: solo tiene sentido en pantallas grandes */}
          <button
            onClick={() => setCompact(c => !c)}
            className="hidden lg:flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold
              text-nav-muted hover:text-nav-ink hover:bg-white/10 transition-colors"
            title={compact ? 'Ampliar el menú' : 'Reducir el menú'}
          >
            <i className={`fa-solid ${compact ? 'fa-angles-right' : 'fa-angles-left'} w-5 text-center`}></i>
            {!compact && 'Reducir menú'}
          </button>
        </div>
      </aside>
    </>
  );
}
