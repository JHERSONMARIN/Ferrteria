import { Fragment, useEffect, useRef, useState } from 'react';
import { roleLabel } from '../shared/constants/roles.ts';
import type { AppInfo } from '@ferresys/contracts/app';
import type { SessionUser } from '@ferresys/contracts/identity';
import type { ScreenId } from './screens.ts';
import { capitalize, useVocabulary } from '../industries/vocabulary.ts';

type Badge = 'cobros' | 'despacho';

interface NavItem {
  id: ScreenId;
  label: string;
  icon: string;
  badge?: Badge;
  subItems?: NavItem[];
}

// El menú está ordenado por frecuencia de uso: arriba lo de todos los días, al final lo que se
// toca una vez al mes. Configuración y la sesión viven abajo, separadas del trabajo diario.
const NAV_GROUPS: { section: string; items: NavItem[] }[] = [
  { section: 'Todos los días', items: [
    { id: 'pos', label: 'Vender', icon: 'fa-cash-register' },
    { id: 'cobros', label: 'Por cobrar', icon: 'fa-hand-holding-dollar', badge: 'cobros' },
    { id: 'despacho', label: 'Por despachar', icon: 'fa-dolly', badge: 'despacho' },
    { id: 'caja', label: 'Caja', icon: 'fa-vault' },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: 'fa-file-invoice' },
    { id: 'deliveries', label: 'Entregas', icon: 'fa-truck-fast' },
  ]},
  { section: 'Almacén', items: [
    { id: 'inventory', label: 'Productos', icon: 'fa-box' },
    { id: 'categories', label: 'Categorías', icon: 'fa-tags' },
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

// Configuración no es trabajo diario: se abre desde el menú del usuario, al pie.
const SETTINGS_ITEM: NavItem = { id: 'settings', label: 'Configuración', icon: 'fa-gear' };

// Un botón del menú.
interface NavButtonProps {
  item: NavItem;
  active: boolean;
  count?: number;
  sub?: boolean;
  onClick: () => void;
}

function NavButton({ item, active, count = 0, sub = false, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full flex items-center gap-3 rounded-xl text-left text-sm font-medium transition-colors px-3 py-2.5
        ${active
          ? 'bg-brand text-brand-contrast shadow-card'
          : `${sub ? 'text-nav-ink' : 'text-nav-muted'} hover:bg-navline/10 hover:text-nav-ink`}`}
    >
      <i className={`fa-solid ${item.icon} w-5 text-center shrink-0`}></i>
      <span className="flex-1 min-w-0 truncate">{item.label}</span>
      {count > 0 && (
        <span className={`rounded-full text-[10px] font-bold px-1.5 py-0.5 min-w-[1.25rem] text-center leading-tight
          ${active ? 'bg-white/25 text-brand-contrast' : 'bg-warning text-white'}`}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

// Una opción del menú del usuario. Va sobre fondo claro, no sobre el menú oscuro.
interface OpcionUsuarioProps {
  icon: string;
  label: string;
  onClick: () => void;
  peligro?: boolean;
}

function OpcionUsuario({ icon, label, onClick, peligro = false }: OpcionUsuarioProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-left transition-colors
        ${peligro ? 'text-danger hover:bg-danger-soft' : 'text-ink-soft hover:bg-surface-muted'}`}
    >
      <i className={`fa-solid ${icon} w-5 text-center`}></i>
      {label}
    </button>
  );
}

interface Props {
  activeTab: ScreenId | null;
  onSwitchTab: (id: ScreenId) => void;
  user: SessionUser | null;
  modules: readonly ScreenId[];
  businessName?: string | null;
  businessLogo?: string | null;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  onChangePassword: () => void;
  counts?: Partial<Record<Badge, number>>;
  oculto?: boolean;
  appVersion?: AppInfo['version'] | null;
}

export default function Sidebar({
  activeTab, onSwitchTab, user, modules, businessName, businessLogo, open, onClose, onLogout,
  onChangePassword, counts = {}, oculto = false, appVersion = null,
}: Props) {
  // "FerreSys v4.8.0"; el commit va en el tooltip, para dictárselo a soporte si lo pide.
  const version = appVersion?.number ? `v${appVersion.number}` : '';
  const versionTitle = appVersion?.commit ? `Versión ${appVersion.number} · ${appVersion.commit}` : undefined;
  const allowedModules = modules;
  const vocabulary = useVocabulary();
  // El nombre de lo que se vende depende del rubro (Productos, Medicamentos…).
  const labelOf = (item: NavItem) => (item.id === 'inventory' ? capitalize(vocabulary.products) : item.label);
  // Menú del usuario: se cierra al tocar fuera o con Escape.
  const [menuUsuario, setMenuUsuario] = useState(false);
  const menuUsuarioRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuUsuario) return;
    const fuera = (e: MouseEvent) => { if (!menuUsuarioRef.current?.contains(e.target as Node)) setMenuUsuario(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuUsuario(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape); };
  }, [menuUsuario]);

  const handleSwitchTab = (tabId: ScreenId) => {
    onSwitchTab(tabId);
    onClose();
  };

  const puedeVer = (id: ScreenId) => allowedModules.includes(id);

  return (
    <>
      {/* Fondo oscuro al abrir el menú en móvil/tablet */}
      {open && <div onClick={onClose} className={`fixed inset-0 bg-nav-strong/60 z-30 ${oculto ? '' : 'lg:hidden'}`} />}

      <aside
        className={`fixed inset-y-0 left-0 bg-nav text-nav-ink flex flex-col z-40 shrink-0 h-screen
          transition-transform duration-200 w-64
          ${oculto ? '' : 'lg:static lg:translate-x-0'}
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Marca de la empresa */}
        <div className="h-16 flex items-center justify-between border-b border-navline/10 bg-nav-strong shrink-0 px-4">
          <div className="flex items-center min-w-0 gap-3">
            {businessLogo
              ? <img src={businessLogo} alt="" className="w-9 h-9 rounded-lg object-contain bg-white/90 p-0.5 shrink-0" />
              : <i className="fa-solid fa-screwdriver-wrench text-brand text-xl w-9 text-center shrink-0"></i>}
            <div className="min-w-0">
              <span className="block font-bold text-base truncate leading-tight text-nav-ink">
                {businessName || 'FerreSys'}
              </span>
              <span className="block text-[11px] text-nav-muted truncate" title={versionTitle}>
                {businessName ? `FerreSys ${version}`.trim() : version}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-nav-muted hover:text-nav-ink lg:hidden shrink-0 ml-2">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-0.5 px-3">
          {NAV_GROUPS.map(group => {
            const visibles = group.items.filter(item => puedeVer(item.id));
            if (visibles.length === 0) return null;

            return (
              <Fragment key={group.section}>
                <p className="text-[10px] font-bold text-nav-muted/70 px-3 mt-3 mb-1.5 uppercase tracking-wider">
                  {group.section}
                </p>

                {visibles.map(item => {
                  const active = activeTab === item.id || Boolean(item.subItems?.some(s => s.id === activeTab));
                  return (
                    <Fragment key={item.id}>
                      <NavButton
                        item={{ ...item, label: labelOf(item) }}
                        active={active}
                        count={item.badge ? counts[item.badge] : 0}
                        onClick={() => handleSwitchTab(item.id)}
                      />
                      {/* Los submenús solo se abren con la sección activa */}
                      {item.subItems && active && (
                        <div className="ml-4 pl-3 border-l border-navline/10 flex flex-col gap-0.5 my-0.5">
                          {item.subItems.map(sub => (
                            <NavButton
                              key={sub.id}
                              item={sub}
                              sub
                              active={activeTab === sub.id}
                              onClick={() => handleSwitchTab(sub.id)}
                            />
                          ))}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </nav>

        {/* Pie: el usuario, y al tocarlo su menú (configuración, contraseña y salir) */}
        <div className="border-t border-navline/10 py-2 shrink-0 flex flex-col gap-0.5 px-3">
          {user && (
            <div className="relative" ref={menuUsuarioRef}>
              {menuUsuario && (
                <div className={`absolute bottom-full mb-2 z-50 bg-surface rounded-xl shadow-float border border-line
                  overflow-hidden py-1 left-0 right-0`}>
                  {puedeVer(SETTINGS_ITEM.id) && (
                    <OpcionUsuario
                      icon={SETTINGS_ITEM.icon}
                      label={SETTINGS_ITEM.label}
                      onClick={() => { setMenuUsuario(false); handleSwitchTab(SETTINGS_ITEM.id); }}
                    />
                  )}
                  <OpcionUsuario
                    icon="fa-key"
                    label="Cambiar contraseña"
                    onClick={() => { setMenuUsuario(false); onChangePassword(); onClose(); }}
                  />
                  <div className="h-px bg-line my-1" />
                  <OpcionUsuario icon="fa-right-from-bracket" label="Cerrar sesión" peligro onClick={onLogout} />
                </div>
              )}

              <button
                onClick={() => setMenuUsuario(abierto => !abierto)}
                className={`w-full flex items-center gap-3 rounded-xl text-left transition-colors px-3 py-2.5
                  hover:bg-navline/10 ${menuUsuario ? 'bg-navline/10' : ''}`}
              >
                <i className="fa-solid fa-circle-user text-nav-muted text-lg shrink-0"></i>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-nav-ink truncate">{user.name}</span>
                  <span className="block text-[10px] text-nav-muted uppercase truncate">{roleLabel(user.role)}</span>
                </span>
                <i className={`fa-solid fa-chevron-up text-nav-muted text-xs transition-transform
                  ${menuUsuario ? '' : 'rotate-180'}`}></i>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
