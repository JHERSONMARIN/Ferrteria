// La aplicación: inicio de sesión, cambio obligatorio de clave y, con sesión, el menú y la pantalla de la
// dirección actual (/vender, /caja…). Cada pantalla se descarga recién cuando se abre por primera vez.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from './Sidebar.tsx';
import Header from './Header.tsx';
import TicketPrint from '../shared/print/TicketPrint.tsx';
import type { TicketData } from '../shared/utils/tickets.ts';
import ChangePasswordForm from './ChangePasswordForm.tsx';
import BuscadorGlobal from './BuscadorGlobal.tsx';
import { ToastProvider, ConfirmProvider, useToast, useConfirm, SkeletonCards } from '../shared/ui/index.ts';
import { dispatchRoleModule } from '../shared/constants/dispatch.ts';
import { MODULE_OPTIONS } from '../shared/constants/modules.ts';
import { applyTheme } from '../shared/utils/theme.ts';
import { api } from '../api/client.ts';
import { queryKeys } from '../api/queryClient.ts';
import type { AppInfo, BusinessSettings, SettingsResponse } from '../api/types.ts';
import LoginScreen from './LoginScreen.tsx';
import { SCREENS, firstScreen, isScreenId, screenFromPath, type ScreenId } from './screens.ts';
import { useSession } from './useSession.ts';

// Las pantallas se cargan por separado: entrar al sistema no descarga todo el programa de una vez.
const page = (load: () => Promise<{ default: ComponentType<any> }>) => lazy(load);
const PAGES = {
  pos: page(() => import('../pages/PosPage.jsx')),
  caja: page(() => import('../pages/CajaPage.jsx')),
  inventory: page(() => import('../pages/InventarioPage.jsx')),
  categories: page(() => import('../pages/CategoriasPage.jsx')),
  cotizaciones: page(() => import('../pages/CotizacionesPage.jsx')),
  kardex: page(() => import('../pages/KardexPage.jsx')),
  compras: page(() => import('../pages/ComprasPage.jsx')),
  deliveries: page(() => import('../pages/EntregasPage.jsx')),
  'client-dir': page(() => import('../pages/ClientesPage.jsx')),
  customers: page(() => import('../pages/CreditosPage.jsx')),
  personal: page(() => import('../pages/PersonalPage.jsx')),
  dashboard: page(() => import('../pages/DashboardPage.jsx')),
  settings: page(() => import('../pages/SettingsPage.jsx')),
  audit: page(() => import('../pages/AuditPage.jsx')),
  transfers: page(() => import('../pages/TransfersPage.jsx')),
  cobros: page(() => import('../pages/CashierQueuePage.jsx')),
  despacho: page(() => import('../pages/DispatchQueuePage.jsx')),
} satisfies Record<ScreenId, unknown>;

const COUNTS_INTERVAL_MS = 20000;

// Los avisos flotantes y las confirmaciones están disponibles en todo el sistema (adiós a alert y confirm).
export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Aplicacion />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Aplicacion() {
  const aviso = useToast();
  const confirmar = useConfirm();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const onSessionExpired = useCallback(
    () => aviso.aviso('Su sesión terminó o su usuario fue modificado. Inicie sesión nuevamente.', 8000),
    [aviso],
  );
  const session = useSession(onSessionExpired);
  const currentUser = session.user;
  const signedIn = Boolean(currentUser && !currentUser.mustChangePassword);

  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  // Modo enfoque: al vender, el menú se oculta y el catálogo gana el ancho de la pantalla.
  const [foco, setFoco] = useState(false);

  // Datos públicos para el inicio de sesión: marca de la empresa, accesos de prueba y versión.
  const appInfo = useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: () => api.get<AppInfo>('/app-info'),
    staleTime: Infinity,
  }).data;

  // Con clave temporal la API rechaza todo salvo el cambio de clave: se carga después.
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.get<SettingsResponse>('/settings'),
    enabled: signedIn,
  });
  // Las sucursales solo se muestran si hay más de una; un error aquí no bloquea la aplicación.
  const branchCount = useQuery({
    queryKey: queryKeys.branches,
    queryFn: () => api.get<unknown[]>('/sucursales'),
    enabled: signedIn,
  }).data?.length ?? 1;

  const settings = settingsQuery.data?.settings ?? null;
  const licensedModules = settingsQuery.data?.licensedModules ?? null;
  // Funciones del plan contratado (null = sin planes, todo habilitado) y estado de la licencia.
  const licensedFeatures = settingsQuery.data?.licensedFeatures ?? null;
  const license = settingsQuery.data?.license ?? null;
  const settingsStatus = settingsQuery.isPending ? 'loading' : settingsQuery.isError ? 'error' : 'ready';

  const updateSettings = (saved: BusinessSettings) =>
    queryClient.setQueryData<SettingsResponse>(queryKeys.settings, old => (old ? { ...old, settings: saved } : old));

  // Estilo de la empresa: en el inicio de sesión viene de /app-info y, ya dentro, de la configuración.
  useEffect(() => {
    applyTheme(settings?.primaryColor ?? appInfo?.business?.primaryColor, settings?.navColor ?? appInfo?.business?.navColor);
  }, [settings?.primaryColor, settings?.navColor, appInfo?.business?.primaryColor, appInfo?.business?.navColor]);

  // Módulos visibles: los asignados al usuario que además estén activos y contratados. Mientras carga no
  // se muestra ninguno; si la carga falla se usan los del usuario para no dejarlo sin acceso.
  const effectiveModules = useMemo(() => {
    const userModules: string[] = currentUser?.role === 'ADMINISTRADOR'
      ? MODULE_OPTIONS.map(m => m.value)
      : currentUser?.modules ?? [];
    if (settingsStatus === 'loading') return [];
    if (!settings) return userModules;
    return userModules.filter(m => settings.enabledModules.includes(m) && (!licensedModules || licensedModules.includes(m)));
  }, [currentUser, settings, licensedModules, settingsStatus]);

  const isAdmin = currentUser?.role === 'ADMINISTRADOR';
  const hasFeature = useCallback((feature: string) => !licensedFeatures || licensedFeatures.includes(feature), [licensedFeatures]);
  // El modo de trabajo es de la sucursal del usuario.
  const saleFlowMode = currentUser?.branch?.saleFlowMode || 'DIRECT';
  // El envío a domicilio se ofrece si la empresa usa (y tiene contratado) Entregas y la sucursal los tiene activados.
  const deliveriesEnabled = Boolean(settings?.enabledModules?.includes('deliveries'))
    && (!licensedModules || licensedModules.includes('deliveries'))
    && currentUser?.branch?.deliveriesEnabled !== false;
  // "Por despachar" existe por etapas y, en cualquier modo, para los envíos a domicilio. La atiende quien la
  // sucursal eligió (vendedor, cajero o almacén), el administrador o quien tenga Despacho.
  const dispatchNeeded = saleFlowMode === 'STAGED' || deliveriesEnabled;
  const roleModule = dispatchRoleModule(currentUser?.branch);
  const canDispatchHere = isAdmin || effectiveModules.includes('despacho') || (roleModule !== undefined && effectiveModules.includes(roleModule));

  const navigableTabs = useMemo(() => {
    const tabs = effectiveModules.filter(m => m !== 'despacho');
    if (dispatchNeeded && canDispatchHere) tabs.push('despacho');
    if (saleFlowMode !== 'DIRECT' && effectiveModules.includes('caja')) tabs.push('cobros');
    // Transferencias: solo con más de una sucursal, para quien maneja inventario o kardex.
    if (branchCount > 1 && (effectiveModules.includes('inventory') || effectiveModules.includes('kardex'))) tabs.push('transfers');
    if (isAdmin && hasFeature('audit')) tabs.push('audit');
    if (isAdmin) tabs.push('settings');
    return tabs.filter(isScreenId);
  }, [effectiveModules, isAdmin, saleFlowMode, branchCount, hasFeature, dispatchNeeded, canDispatchHere]);

  // Pendientes que se muestran en el menú: así se sabe si hay trabajo sin entrar a la pantalla.
  const verCobros = navigableTabs.includes('cobros');
  const verDespacho = navigableTabs.includes('despacho');
  const counts = useQuery({
    queryKey: [...queryKeys.queueCounts, currentUser?.id, verCobros, verDespacho],
    queryFn: async () => {
      const [cobros, despacho] = await Promise.all([
        verCobros ? api.get<unknown[]>('/pedidos?status=PENDING_PAYMENT').catch(() => null) : null,
        verDespacho ? api.get<unknown[]>('/pedidos?status=PAID').catch(() => null) : null,
      ]);
      return { cobros: cobros?.length ?? 0, despacho: despacho?.length ?? 0 };
    },
    enabled: signedIn && (verCobros || verDespacho),
    refetchInterval: COUNTS_INTERVAL_MS,
  }).data ?? {};

  // La pantalla es la de la dirección. Una dirección a la que el usuario no tiene acceso (o "/") lleva a la
  // primera que sí tiene. Categorías se abre también desde Productos.
  const activeTab = screenFromPath(location.pathname);
  useEffect(() => {
    if (!signedIn || settingsStatus === 'loading' || navigableTabs.length === 0) return;
    const allowed = activeTab !== null
      && (navigableTabs.includes(activeTab) || (activeTab === 'categories' && navigableTabs.includes('inventory')));
    const first = firstScreen(navigableTabs);
    if (!allowed && first) navigate(SCREENS[first].path, { replace: true });
  }, [signedIn, activeTab, navigableTabs, settingsStatus, navigate]);

  const goTo = (tabId: ScreenId, params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    navigate(`${SCREENS[tabId].path}${query}`);
  };

  // Ctrl+K abre el buscador general desde cualquier pantalla.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscadorAbierto(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Desde el buscador: se abre la pantalla con el texto ya escrito en su búsqueda (?q=).
  const irDesdeBuscador = (tabId: ScreenId, texto = '') => goTo(tabId, texto ? { q: texto } : undefined);

  const handleResetDemo = async () => {
    const seguro = await confirmar({
      title: 'Reiniciar la demostración',
      description: 'Se cerrará la sesión y se limpiarán los datos guardados en este navegador.',
      confirmText: 'Reiniciar',
    });
    if (seguro) session.signOut();
  };

  // Al entrar siempre se abre la pantalla principal del usuario (Vender, si la tiene).
  const onSignedIn = (user: Parameters<typeof session.signIn>[0]) => {
    session.signIn(user);
    const first = firstScreen(user.modules.filter(isScreenId));
    navigate(first ? SCREENS[first].path : '/', { replace: true });
  };

  if (!currentUser) {
    return (
      <>
        <TicketPrint data={ticketData} business={settings} />
        <LoginScreen appInfo={appInfo} onSignedIn={onSignedIn} />
      </>
    );
  }

  if (currentUser.mustChangePassword) {
    // Clave temporal: hay que cambiarla antes de usar el sistema.
    return (
      <div className="fixed inset-0 bg-panel z-[100] flex items-center justify-center p-4 overflow-y-auto">
        <ChangePasswordForm mandatory onDone={session.passwordChanged} onLogout={session.signOut} />
      </div>
    );
  }

  const screen = activeTab ? SCREENS[activeTab] : SCREENS.pos;
  const busquedaInicial = searchParams.get('q') ?? '';
  const pantallaProps = { currentUser };
  const enPos = activeTab === 'pos';

  return (
    <>
      {/* Ticket de 80 mm, oculto hasta imprimir */}
      <TicketPrint data={ticketData} business={settings} />
      <div className="print:hidden h-screen flex overflow-hidden">
        {showChangePassword && (
          <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
            <ChangePasswordForm
              onDone={() => { setShowChangePassword(false); session.passwordChanged(); aviso.exito('Contraseña actualizada.'); }}
              onCancel={() => setShowChangePassword(false)}
            />
          </div>
        )}
        <BuscadorGlobal
          open={buscadorAbierto}
          onClose={() => setBuscadorAbierto(false)}
          pantallas={navigableTabs.map(id => ({ id, label: SCREENS[id].title, icon: SCREENS[id].icon }))}
          onIr={irDesdeBuscador}
        />

        <Sidebar
          activeTab={activeTab}
          onSwitchTab={id => goTo(id)}
          user={currentUser}
          modules={navigableTabs}
          businessName={settings?.tradeName || settings?.legalName}
          businessLogo={settings?.logo || null}
          appVersion={appInfo?.version ?? null}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onLogout={session.signOut}
          onChangePassword={() => setShowChangePassword(true)}
          counts={counts}
          oculto={foco && enPos}
        />

        <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
          <Header
            pageTitle={screen.title}
            pageHint={screen.hint}
            user={currentUser}
            showBranch={branchCount > 1}
            onResetDemo={appInfo?.demoMode ? handleResetDemo : undefined}
            onToggleSidebar={() => setSidebarOpen(o => !o)}
            onBuscar={() => setBuscadorAbierto(true)}
            foco={foco && enPos}
            onToggleFoco={enPos ? () => setFoco(f => !f) : undefined}
          />

          {license?.expiresAt && (license.expired || (license.daysLeft ?? 99) <= 15) && (
            <div className={`px-4 py-2 text-sm border-b ${license.expired ? 'bg-danger-soft border-danger/30 text-danger' : 'bg-warning-soft border-warning/30 text-warning'}`}>
              <i className="fa-solid fa-triangle-exclamation mr-2"></i>
              {license.expired
                ? `La licencia venció el ${license.expiresAt}: el sistema quedó solo para consulta. Comuníquese con VALETEC para renovarla.`
                : `La licencia vence el ${license.expiresAt} (en ${license.daysLeft} día(s)). Comuníquese con VALETEC para renovarla.`}
            </div>
          )}

          <div className="flex-1 overflow-hidden relative w-full h-full bg-page">
            {settingsStatus === 'loading' || !activeTab ? (
              <div className="h-full p-4"><SkeletonCards count={8} /></div>
            ) : (
              <Suspense fallback={<div className="h-full p-4"><SkeletonCards count={8} /></div>}>
                {/* key: la búsqueda de la dirección (?q=, ?categoria=) se toma al abrir la pantalla. */}
                <Screen
                  key={`${activeTab}${location.search}`}
                  tab={activeTab}
                  props={{
                    ...pantallaProps,
                    // Vender y Por cobrar
                    onTriggerPrint: setTicketData,
                    saleFlowMode,
                    deliveriesEnabled,
                    maxDiscountPercent: Number(settings?.maxDiscountPercent ?? 0),
                    // Productos, Clientes y Categorías
                    initialSearch: busquedaInicial,
                    initialCategory: searchParams.get('categoria') ?? 'Todas',
                    onNavigateToCategories: () => goTo('categories'),
                    onSelectCategory: (categoria: string) => goTo('inventory', { categoria }),
                    onNavigateToProducts: () => goTo('inventory'),
                    // Reportes y Configuración
                    periodReports: hasFeature('period_reports'),
                    onSaved: updateSettings,
                    hasFeature,
                    licensedFeatures,
                    license,
                  }}
                  isAdmin={isAdmin}
                />
              </Suspense>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

// Configuración y Auditoría son solo del administrador, aunque alguien escriba su dirección.
function Screen({ tab, props, isAdmin }: { tab: ScreenId; props: Record<string, unknown>; isAdmin: boolean }) {
  if ((tab === 'settings' || tab === 'audit') && !isAdmin) return null;
  const Page = PAGES[tab];
  return <Page {...props} />;
}
