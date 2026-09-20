import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import TicketPrint from './components/TicketPrint.jsx';
import PosPage from './pages/PosPage.jsx';
import InventarioPage from './pages/InventarioPage.jsx';
import CategoriasPage from './pages/CategoriasPage.jsx';
import CotizacionesPage from './pages/CotizacionesPage.jsx';
import KardexPage from './pages/KardexPage.jsx';
import EntregasPage from './pages/EntregasPage.jsx';
import ClientesPage from './pages/ClientesPage.jsx';
import CreditosPage from './pages/CreditosPage.jsx';
import PersonalPage from './pages/PersonalPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CajaPage from './pages/CajaPage.jsx';
import ComprasPage from './pages/ComprasPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import TransfersPage from './pages/TransfersPage.jsx';
import { dispatchRoleModule } from './constants/dispatch.js';
import CashierQueuePage from './pages/CashierQueuePage.jsx';
import DispatchQueuePage from './pages/DispatchQueuePage.jsx';
import FieldError from './components/FieldError.jsx';
import ChangePasswordForm from './components/ChangePasswordForm.jsx';
import { api } from './api.js';
import { MODULE_OPTIONS } from './constants/modules.js';
import { applyTheme } from './utils/theme.js';
import { ToastProvider, ConfirmProvider, useToast, useConfirm, SkeletonCards } from './components/ui/index.js';

const DEMO_TEST_USERS = [
  { role: 'ADMINISTRADOR', label: 'Administrador', user: 'admin', pass: '1234', icon: 'fa-user-shield' },
  { role: 'VENDEDOR', label: 'Vendedor', user: 'vendedor1', pass: '1234', icon: 'fa-cash-register' },
  { role: 'CAJERO', label: 'Cajero', user: 'cajero1', pass: '1234', icon: 'fa-vault' },
  { role: 'REPARTIDOR', label: 'Repartidor', user: 'repartidor1', pass: '1234', icon: 'fa-truck-fast' },
];

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

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('ferre_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  // Accesos rápidos de prueba definidos en el .env de la empresa (QUICK_LOGIN).
  const [quickUsers, setQuickUsers] = useState([]);
  // Marca de la empresa en la pantalla de inicio (viene sin sesión iniciada).
  const [loginBrand, setLoginBrand] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [loginFieldErrors, setLoginFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('pos');
  const [ticketData, setTicketData] = useState(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('Todas');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const handlePasswordChanged = () => {
    setShowChangePassword(false);
    setCurrentUser(prev => {
      const updated = { ...prev, mustChangePassword: false };
      localStorage.setItem('ferre_user', JSON.stringify(updated));
      return updated;
    });
  };
  const [settings, setSettings] = useState(null);
  const [branchCount, setBranchCount] = useState(1);
  const [licensedModules, setLicensedModules] = useState(null);
  // Funciones del plan contratado (null = sin planes, todo habilitado) y estado de la licencia.
  const [licensedFeatures, setLicensedFeatures] = useState(null);
  const [license, setLicense] = useState(null);
  const [settingsStatus, setSettingsStatus] = useState('loading');

  // Los usuarios de prueba solo se ofrecen en la instancia de demostración.
  useEffect(() => {
    api.get('/app-info')
      .then(info => { setDemoMode(Boolean(info?.demoMode)); setQuickUsers(info?.quickLogin || []); setLoginBrand(info?.business || null); })
      .catch(() => setDemoMode(false));
  }, []);

  // Color de la empresa: en el inicio de sesión viene de /app-info y, ya dentro, de la configuración.
  useEffect(() => {
    applyTheme(settings?.primaryColor ?? loginBrand?.primaryColor);
  }, [settings?.primaryColor, loginBrand?.primaryColor]);

  // Módulos visibles: los asignados al usuario que además estén activos en la empresa.
  // Mientras carga no se muestra ninguno (evita enseñar módulos desactivados); si la carga
  // falla se usan los del usuario para no dejarlo sin acceso.
  const effectiveModules = useMemo(() => {
    // El administrador tiene todos los módulos que la empresa tenga activos y contratados.
    const userModules = currentUser?.role === 'ADMINISTRADOR'
      ? MODULE_OPTIONS.map(m => m.value)
      : currentUser?.modules || [];
    if (settingsStatus === 'loading') return [];
    if (!settings) return userModules;
    return userModules.filter(m =>
      settings.enabledModules.includes(m) && (!licensedModules || licensedModules.includes(m))
    );
  }, [currentUser, settings, licensedModules, settingsStatus]);

  const isAdmin = currentUser?.role === 'ADMINISTRADOR';
  // Sin lista de funciones (instalaciones sin plan) se habilita todo.
  const hasFeature = (feature) => !licensedFeatures || licensedFeatures.includes(feature);

  // La configuración no es un módulo desactivable: la ve siempre el administrador.
  // El modo de trabajo es de la sucursal del usuario.
  const saleFlowMode = currentUser?.branch?.saleFlowMode || 'DIRECT';
  // El envío a domicilio se ofrece si la empresa usa (y tiene contratado) el módulo de entregas y la
  // sucursal del usuario tiene activados los envíos.
  const deliveriesEnabled = Boolean(settings?.enabledModules?.includes('deliveries'))
    && (!licensedModules || licensedModules.includes('deliveries'))
    && currentUser?.branch?.deliveriesEnabled !== false;

  // "Por despachar" existe por etapas (todo lo cobrado) y, en cualquier modo, para los envíos a domicilio.
  // La atiende quien la sucursal eligió (vendedor, cajero o almacén), el administrador o quien tenga Despacho.
  const dispatchNeeded = saleFlowMode === 'STAGED' || deliveriesEnabled;
  const canDispatchHere = isAdmin || effectiveModules.includes('despacho')
    || effectiveModules.includes(dispatchRoleModule(currentUser?.branch));

  // Pantallas que dependen del modo de trabajo: "Por cobrar" (con pedidos) y "Por despachar".
  const navigableTabs = useMemo(() => {
    const tabs = effectiveModules.filter(m => m !== 'despacho');
    if (dispatchNeeded && canDispatchHere) tabs.push('despacho');
    if (saleFlowMode !== 'DIRECT' && effectiveModules.includes('caja')) tabs.push('cobros');
    // Transferencias: solo con más de una sucursal, para quien maneja inventario o kardex.
    if (branchCount > 1 && (effectiveModules.includes('inventory') || effectiveModules.includes('kardex'))) tabs.push('transfers');
    if (isAdmin && hasFeature('audit')) tabs.push('audit');
    if (isAdmin) tabs.push('settings');
    return tabs;
  }, [effectiveModules, isAdmin, saleFlowMode, branchCount, licensedFeatures, dispatchNeeded, canDispatchHere]);

  // Pendientes que se muestran en el menú: así se sabe si hay trabajo sin entrar a la pantalla.
  const [counts, setCounts] = useState({});
  const verCobros = navigableTabs.includes('cobros');
  const verDespacho = navigableTabs.includes('despacho');

  useEffect(() => {
    if (!currentUser?.id || (!verCobros && !verDespacho)) return setCounts({});
    let vigente = true;
    const contar = async () => {
      const [cobros, despacho] = await Promise.all([
        verCobros ? api.get('/pedidos?status=PENDING_PAYMENT').catch(() => null) : null,
        verDespacho ? api.get('/pedidos?status=PAID').catch(() => null) : null,
      ]);
      if (!vigente) return;
      setCounts(prev => ({
        cobros: cobros ? cobros.length : prev.cobros,
        despacho: despacho ? despacho.length : prev.despacho,
      }));
    };
    contar();
    const reloj = setInterval(contar, 20000);
    return () => { vigente = false; clearInterval(reloj); };
  }, [currentUser?.id, verCobros, verDespacho]);

  const loadSettings = async () => {
    // Las sucursales solo se muestran si hay más de una; un error aquí no bloquea la aplicación.
    api.get('/sucursales').then(list => setBranchCount(list.length)).catch(() => setBranchCount(1));
    try {
      const res = await api.get('/settings');
      setSettings(res.settings);
      setLicensedModules(res.licensedModules || null);
      setLicensedFeatures(res.licensedFeatures || null);
      setLicense(res.license || null);
      setSettingsStatus('ready');
    } catch (err) {
      console.error('Error cargando la configuración de la empresa:', err);
      setSettingsStatus('error');
    }
  };

  useEffect(() => {
    // Con clave temporal la API rechaza todo salvo el cambio de clave: se carga después.
    if (currentUser?.id && !currentUser.mustChangePassword) loadSettings();
  }, [currentUser?.id, currentUser?.mustChangePassword]);

  // Aplica al estado local los datos del usuario que devuelve el servidor.
  const syncUser = (serverUser) => {
    setCurrentUser(prev => {
      if (!prev) return prev;
      const hasChanged = JSON.stringify(serverUser.modules) !== JSON.stringify(prev.modules) ||
                         serverUser.role !== prev.role || serverUser.name !== prev.name ||
                         Boolean(serverUser.mustChangePassword) !== Boolean(prev.mustChangePassword) ||
                         JSON.stringify(serverUser.branch) !== JSON.stringify(prev.branch);
      if (!hasChanged) return prev;
      const updated = {
        ...prev,
        modules: serverUser.modules,
        role: serverUser.role,
        name: serverUser.name,
        mustChangePassword: Boolean(serverUser.mustChangePassword),
        branchId: serverUser.branchId,
        branch: serverUser.branch,
      };
      localStorage.setItem('ferre_user', JSON.stringify(updated));
      return updated;
    });
  };

  // Latido cada 8s: confirma que la sesión sigue válida y sincroniza rol y módulos.
  // Si la sesión venció o el usuario fue desactivado, api.js emite "sesion-expirada".
  useEffect(() => {
    if (!currentUser?.id) return;

    const checkSession = () => api.get('/auth/me').then(res => syncUser(res.user)).catch(() => {});
    checkSession();
    const heartbeatInterval = setInterval(checkSession, 8000);
    // Al cambiar el modo de una sucursal en Configuración se refresca al momento.
    window.addEventListener('refrescar-sesion', checkSession);
    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('refrescar-sesion', checkSession);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const onSessionExpired = () => {
      if (localStorage.getItem('ferre_user')) {
        localStorage.removeItem('ferre_user');
        aviso.aviso('Su sesión terminó o su usuario fue modificado. Inicie sesión nuevamente.', 8000);
      }
      setCurrentUser(null);
    };
    window.addEventListener('sesion-expirada', onSessionExpired);
    return () => window.removeEventListener('sesion-expirada', onSessionExpired);
  }, []);

  // Si el usuario cambia de tab a uno al que no tiene acceso, redirigirlo al primero accesible
  useEffect(() => {
    if (currentUser && navigableTabs.length > 0) {
      const isAllowed = navigableTabs.includes(activeTab) || (activeTab === 'categories' && navigableTabs.includes('inventory'));
      if (!isAllowed) {
        setActiveTab(navigableTabs[0]);
      }
    }
  }, [currentUser, activeTab, navigableTabs]);

  const handleLogin = async (e, customUser, customPass) => {
    if (e && e.preventDefault) e.preventDefault();
    setLoginError('');

    const targetUser = customUser !== undefined ? customUser : loginUser;
    const targetPass = customPass !== undefined ? customPass : loginPass;

    if (customUser !== undefined) setLoginUser(customUser);
    if (customPass !== undefined) setLoginPass(customPass);

    const fieldErrors = {};
    if (!targetUser.trim()) {
      fieldErrors.user = 'Ingrese su usuario.';
    } else if (targetUser.trim().length < 3) {
      fieldErrors.user = 'El usuario debe tener al menos 3 caracteres.';
    }
    if (!targetPass.trim()) {
      fieldErrors.pass = 'Ingrese su contraseña.';
    } else if (targetPass.length < 4) {
      fieldErrors.pass = 'La contraseña debe tener al menos 4 caracteres.';
    }
    setLoginFieldErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    try {
      setLoading(true);
      const res = await api.post('/auth/login', {
        user: targetUser.trim(),
        pass: targetPass.trim()
      });

      if (res.success && res.user) {
        setCurrentUser(res.user);
        localStorage.setItem('ferre_user', JSON.stringify(res.user));
        if (res.user.modules && res.user.modules.length > 0) {
          setActiveTab(res.user.modules[0]);
        }
      }
    } catch (err) {
      setLoginError(err.message || 'Credenciales incorrectas o usuario inactivo.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.post('/auth/logout', {}).catch(() => {});
    setCurrentUser(null);
    localStorage.removeItem('ferre_user');
    setLoginUser('');
    setLoginPass('');
  };

  const handleResetDemo = async () => {
    const seguro = await confirmar({
      title: 'Reiniciar la demostración',
      description: 'Se cerrará la sesión y se limpiarán los datos guardados en este navegador.',
      confirmText: 'Reiniciar',
    });
    if (seguro) handleLogout();
  };

  const handleSwitchTab = (tabId) => {
    if (tabId === 'inventory') {
      setSelectedCategoryFilter('Todas');
    }
    setActiveTab(tabId);
  };

  // Los títulos son los mismos nombres del menú: la pantalla no vuelve a escribirlos adentro.
  const pageTitles = {
    'pos': ['Vender', 'Arme la venta, cobre e imprima el comprobante.'],
    'caja': ['Caja', 'Apertura, movimientos y arqueo del turno.'],
    'inventory': ['Productos', 'Stock, precios y datos de cada producto.'],
    'categories': ['Categorías', 'Cómo se agrupan los productos en el catálogo.'],
    'cotizaciones': ['Cotizaciones', 'Proformas enviadas y su seguimiento.'],
    'kardex': ['Movimientos', 'Entradas y salidas de almacén, producto por producto.'],
    'compras': ['Compras', 'Órdenes a proveedores e ingreso de mercadería.'],
    'deliveries': ['Entregas', 'Pedidos con envío a domicilio.'],
    'client-dir': ['Clientes', 'Directorio de clientes del negocio.'],
    'customers': ['Créditos', 'Deudas, pagos y clientes con fiado.'],
    'personal': ['Personal', 'Usuarios, accesos y permisos.'],
    'dashboard': ['Reportes', 'Ventas, ganancias y estado del negocio.'],
    'settings': ['Configuración', 'Datos de la empresa, módulos y sucursales.'],
    'audit': ['Auditoría', 'Quién hizo cada cambio y cuándo.'],
    'transfers': ['Transferencias', 'Envío de mercadería entre sucursales.'],
    'cobros': ['Por cobrar', 'Pedidos esperando pago en caja.'],
    'despacho': ['Por despachar', 'Pedidos pagados listos para entregar.'],
  };
  const [pageTitle, pageHint] = pageTitles[activeTab] || pageTitles['pos'];

  return (
    <>
      {/* Componente Oculto de Impresión para Ticket de 80mm */}
      <TicketPrint data={ticketData} business={settings} />

      {/* Pantalla de Login si no hay usuario autenticado */}
      {!currentUser ? (
        <div id="login-screen" className="fixed inset-0 bg-nav z-[100] flex items-center justify-center p-4 transition-all overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-float w-full max-w-md overflow-hidden flex flex-col my-auto">
            <div className="p-5 bg-nav-strong text-white text-center border-b-2 border-brand">
              {loginBrand?.logo
                ? <img src={loginBrand.logo} alt="" className="h-14 mx-auto mb-2 object-contain" />
                : <i className="fa-solid fa-screwdriver-wrench text-brand text-3xl mb-2"></i>}
              <h2 className="text-xl font-bold tracking-wide">
                {loginBrand?.name || <>FerreSys <span className="text-xs text-brand align-top">v4.8</span></>}
              </h2>
              <p className="text-nav-muted text-xs mt-0.5">Inicio de sesión</p>
            </div>

            <form onSubmit={handleLogin} className="p-5 flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-ink-soft mb-1 block">Usuario</label>
                <input
                  type="text"
                  value={loginUser}
                  onChange={e => { setLoginUser(e.target.value); setLoginFieldErrors(p => ({ ...p, user: '' })); }}
                  className={`w-full border p-2.5 rounded-xl outline-none text-sm font-medium focus:ring-2 focus:ring-brand/20 ${loginFieldErrors.user ? 'border-danger' : 'border-line focus:border-brand'}`}
                />
                <FieldError msg={loginFieldErrors.user} />
              </div>
              <div>
                <label className="text-xs font-bold text-ink-soft mb-1 block">Contraseña</label>
                <input
                  type="password"
                  value={loginPass}
                  onChange={e => { setLoginPass(e.target.value); setLoginFieldErrors(p => ({ ...p, pass: '' })); }}
                  className={`w-full border p-2.5 rounded-xl outline-none text-sm font-medium focus:ring-2 focus:ring-brand/20 ${loginFieldErrors.pass ? 'border-danger' : 'border-line focus:border-brand'}`}
                />
                <FieldError msg={loginFieldErrors.pass} />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand hover:bg-brand-strong text-brand-contrast font-bold py-2.5 rounded-xl shadow-card transition-colors text-sm flex items-center justify-center gap-2 mt-1"
              >
                {loading && <i className="fa-solid fa-spinner fa-spin text-xs"></i>}
                {loading ? 'Ingresando...' : 'Ingresar al Sistema'}
              </button>
              {loginError && (
                <p className="text-danger text-xs font-bold text-center mt-1">{loginError}</p>
              )}
            </form>

            {/* Panel de Usuarios de Prueba (Demo Rápido) */}
            {(demoMode || quickUsers.length > 0) && (
            <div className="bg-surface-muted border-t border-line p-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold text-ink-soft uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-flask text-brand"></i> Usuarios de prueba
                </span>
                <span className="text-[10px] text-muted font-medium">Toque para entrar directo</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(quickUsers.length > 0 ? quickUsers.map(u => ({
                  user: u.user, pass: u.pass, label: u.label, icon: 'fa-user',
                })) : DEMO_TEST_USERS).map((demo) => (
                  <button
                    key={demo.user}
                    type="button"
                    disabled={loading}
                    onClick={() => handleLogin(null, demo.user, demo.pass)}
                    className="flex items-center gap-2.5 p-2 rounded-xl border border-line bg-surface hover:border-brand hover:bg-brand-soft text-left transition-colors group"
                    title={`Ingresar como ${demo.label}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center shrink-0">
                      <i className={`fa-solid ${demo.icon} text-muted text-sm group-hover:text-brand`}></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-ink truncate">{demo.label}</div>
                      <div className="text-[10px] text-muted truncate font-mono">@{demo.user}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>
        </div>
      ) : currentUser.mustChangePassword ? (
        /* Clave temporal: hay que cambiarla antes de usar el sistema */
        <div className="fixed inset-0 bg-nav z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <ChangePasswordForm mandatory onDone={handlePasswordChanged} onLogout={handleLogout} />
        </div>
      ) : (
        /* Layout Principal Full-Stack React */
        <div className="print:hidden h-screen flex overflow-hidden">
          {showChangePassword && (
            <div className="fixed inset-0 bg-nav/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
              <ChangePasswordForm
                onDone={() => { handlePasswordChanged(); aviso.exito('Contraseña actualizada.'); }}
                onCancel={() => setShowChangePassword(false)}
              />
            </div>
          )}
          <Sidebar
            activeTab={activeTab}
            onSwitchTab={handleSwitchTab}
            user={currentUser}
            modules={navigableTabs}
            businessName={settings?.tradeName || settings?.legalName}
            businessLogo={settings?.logo || null}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onLogout={handleLogout}
            onChangePassword={() => setShowChangePassword(true)}
            counts={counts}
          />

          <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
            <Header
              pageTitle={pageTitle}
              pageHint={pageHint}
              user={currentUser}
              showBranch={branchCount > 1}
              onResetDemo={demoMode ? handleResetDemo : undefined}
              onToggleSidebar={() => setSidebarOpen(o => !o)}
            />

            {license?.expiresAt && (license.expired || license.daysLeft <= 15) && (
              <div className={`px-4 py-2 text-sm border-b ${license.expired ? 'bg-danger-soft border-danger/30 text-danger' : 'bg-warning-soft border-warning/30 text-warning'}`}>
                <i className="fa-solid fa-triangle-exclamation mr-2"></i>
                {license.expired
                  ? `La licencia venció el ${license.expiresAt}: el sistema quedó solo para consulta. Comuníquese con VALETEC para renovarla.`
                  : `La licencia vence el ${license.expiresAt} (en ${license.daysLeft} día(s)). Comuníquese con VALETEC para renovarla.`}
              </div>
            )}

            <div className="flex-1 overflow-hidden relative w-full h-full bg-page">
              {settingsStatus === 'loading' ? (
                <div className="h-full p-4"><SkeletonCards count={8} /></div>
              ) : (<>
              {activeTab === 'pos' && (
                <PosPage
                  currentUser={currentUser}
                  onTriggerPrint={setTicketData}
                  saleFlowMode={saleFlowMode}
                  deliveriesEnabled={deliveriesEnabled}
                  maxDiscountPercent={Number(settings?.maxDiscountPercent ?? 0)}
                />
              )}
              {activeTab === 'caja' && <CajaPage currentUser={currentUser} />}
              {activeTab === 'inventory' && (
                <InventarioPage
                  currentUser={currentUser}
                  initialCategory={selectedCategoryFilter}
                  onNavigateToCategories={() => setActiveTab('categories')}
                />
              )}
              {activeTab === 'categories' && (
                <CategoriasPage
                  onSelectCategory={(catName) => {
                    setSelectedCategoryFilter(catName);
                    setActiveTab('inventory');
                  }}
                  onNavigateToProducts={() => {
                    setSelectedCategoryFilter('Todas');
                    setActiveTab('inventory');
                  }}
                />
              )}
              {activeTab === 'cotizaciones' && <CotizacionesPage />}
              {activeTab === 'kardex' && <KardexPage currentUser={currentUser} />}
              {activeTab === 'compras' && <ComprasPage />}
              {activeTab === 'deliveries' && (
                <EntregasPage currentUser={currentUser} />
              )}
              {activeTab === 'client-dir' && <ClientesPage />}
              {activeTab === 'customers' && <CreditosPage />}
              {activeTab === 'personal' && <PersonalPage currentUser={currentUser} />}
              {activeTab === 'dashboard' && <DashboardPage periodReports={hasFeature('period_reports')} />}
              {activeTab === 'settings' && isAdmin && <SettingsPage currentUser={currentUser} onSaved={setSettings} hasFeature={hasFeature} licensedFeatures={licensedFeatures} license={license} />}
              {activeTab === 'audit' && isAdmin && <AuditPage />}
              {activeTab === 'transfers' && <TransfersPage currentUser={currentUser} />}
              {activeTab === 'cobros' && (
                <CashierQueuePage
                  currentUser={currentUser}
                  onTriggerPrint={setTicketData}
                  saleFlowMode={saleFlowMode}
                  deliveriesEnabled={deliveriesEnabled}
                />
              )}
              {activeTab === 'despacho' && <DispatchQueuePage />}
              </>)}
            </div>
          </main>
        </div>
      )}
    </>
  );
}
