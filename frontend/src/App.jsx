import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import TicketPrint from './components/TicketPrint.jsx';
import PosPage from './pages/PosPage.jsx';
import InventarioPage from './pages/InventarioPage.jsx';
import CategoriasPage from './pages/CategoriasPage.jsx';
import KardexPage from './pages/KardexPage.jsx';
import EntregasPage from './pages/EntregasPage.jsx';
import ClientesPage from './pages/ClientesPage.jsx';
import CreditosPage from './pages/CreditosPage.jsx';
import PersonalPage from './pages/PersonalPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CajaPage from './pages/CajaPage.jsx';
import ComprasPage from './pages/ComprasPage.jsx';
import FieldError from './components/FieldError.jsx';
import { api } from './api.js';

const DEMO_TEST_USERS = [
  {
    role: 'ADMINISTRADOR',
    label: 'Administrador',
    user: 'admin',
    pass: '1234',
    name: 'Pedro Admin',
    icon: 'fa-user-shield',
    color: 'text-purple-600',
    bg: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
    tag: 'Acceso Total',
  },
  {
    role: 'VENDEDOR',
    label: 'Vendedor',
    user: 'vendedor1',
    pass: '1234',
    name: 'Juan Pérez',
    icon: 'fa-cash-register',
    color: 'text-orange-600',
    bg: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
    tag: 'POS y Ventas',
  },
  {
    role: 'CAJERO',
    label: 'Cajero',
    user: 'cajero1',
    pass: '1234',
    name: 'María Cajera',
    icon: 'fa-vault',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
    tag: 'Caja y Cobro',
  },
  {
    role: 'REPARTIDOR',
    label: 'Repartidor',
    user: 'repartidor1',
    pass: '1234',
    name: 'Carlos Ruiz',
    icon: 'fa-truck-fast',
    color: 'text-blue-600',
    bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
    tag: 'Entregas / Flete',
  },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('ferre_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('1234');
  const [loginError, setLoginError] = useState('');
  const [loginFieldErrors, setLoginFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('pos');
  const [ticketData, setTicketData] = useState(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('Todas');

  // Heartbeat cada 8s para sincronizar roles y estado activo del usuario
  useEffect(() => {
    if (!currentUser || !currentUser.id) return;

    const heartbeatInterval = setInterval(async () => {
      try {
        const res = await api.get(`/usuarios/check/${currentUser.id}`);
        const serverUser = res?.user || res;

        if (!res?.active || (serverUser && !serverUser.active)) {
          alert('Tu usuario ha sido desactivado o tus permisos han sido modificados.');
          handleLogout();
          return;
        }

        const newModules = serverUser?.modules ?? res?.modules;
        const newRole = serverUser?.role ?? res?.role;
        const newName = serverUser?.name ?? res?.name;

        // Solo actualizar si recibimos datos válidos y no destructivos
        if (newModules !== undefined && newRole !== undefined && newName !== undefined) {
          const hasChanged = JSON.stringify(newModules) !== JSON.stringify(currentUser.modules) ||
                             newRole !== currentUser.role ||
                             newName !== currentUser.name;
          if (hasChanged) {
            const updated = { ...currentUser, modules: newModules, role: newRole, name: newName };
            setCurrentUser(updated);
            localStorage.setItem('ferre_user', JSON.stringify(updated));
          }
        }
      } catch (err) {
        // En caso de caída de backend temporal, no desloguear agresivamente
      }
    }, 8000);

    return () => clearInterval(heartbeatInterval);
  }, [currentUser]);

  // Si el usuario cambia de tab a uno al que no tiene acceso, redirigirlo al primero accesible
  useEffect(() => {
    if (currentUser && currentUser.modules && currentUser.modules.length > 0) {
      const isAllowed = currentUser.modules.includes(activeTab) || (activeTab === 'categories' && currentUser.modules.includes('inventory'));
      if (!isAllowed) {
        setActiveTab(currentUser.modules[0]);
      }
    }
  }, [currentUser, activeTab]);

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
    setCurrentUser(null);
    localStorage.removeItem('ferre_user');
    setLoginUser('');
    setLoginPass('');
  };

  const handleResetDemo = () => {
    if (window.confirm('¿Desea reiniciar la sesión y limpiar datos locales del cliente?')) {
      handleLogout();
    }
  };

  const handleSwitchTab = (tabId) => {
    if (tabId === 'inventory') {
      setSelectedCategoryFilter('Todas');
    }
    setActiveTab(tabId);
  };

  const pageTitles = {
    'pos': 'Punto de Venta',
    'caja': 'Arqueo y Control de Caja Chica',
    'inventory': 'Almacén - Productos',
    'categories': 'Almacén - Categorías de Productos',
    'kardex': 'Kardex / Movimientos de Almacén',
    'compras': 'Compras a Proveedores',
    'deliveries': 'Entregas',
    'client-dir': 'Directorio de Clientes',
    'customers': 'Módulo de Créditos',
    'personal': 'Módulo de Personal',
    'dashboard': 'Finanzas / Reportes',
  };

  return (
    <>
      {/* Componente Oculto de Impresión para Ticket de 80mm */}
      <TicketPrint data={ticketData} />

      {/* Pantalla de Login si no hay usuario autenticado */}
      {!currentUser ? (
        <div id="login-screen" className="fixed inset-0 bg-slate-900 z-[100] flex items-center justify-center p-4 transition-all overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col my-auto border border-slate-700/50">
            <div className="p-5 bg-slate-950 text-white text-center border-b border-orange-500">
              <i className="fa-solid fa-screwdriver-wrench text-orange-500 text-3xl mb-2"></i>
              <h2 className="text-xl font-bold tracking-wide">
                FerreSys <span className="text-xs text-orange-500 align-top">v4.8</span>
              </h2>
              <p className="text-slate-400 text-xs mt-0.5">Inicio de Sesión</p>
            </div>

            <form onSubmit={handleLogin} className="p-5 flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Usuario</label>
                <input
                  type="text"
                  value={loginUser}
                  onChange={e => { setLoginUser(e.target.value); setLoginFieldErrors(p => ({ ...p, user: '' })); }}
                  className={`w-full border p-2 rounded outline-none text-sm font-medium ${loginFieldErrors.user ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-orange-500'}`}
                />
                <FieldError msg={loginFieldErrors.user} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Contraseña</label>
                <input
                  type="password"
                  value={loginPass}
                  onChange={e => { setLoginPass(e.target.value); setLoginFieldErrors(p => ({ ...p, pass: '' })); }}
                  className={`w-full border p-2 rounded outline-none text-sm font-medium ${loginFieldErrors.pass ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-orange-500'}`}
                />
                <FieldError msg={loginFieldErrors.pass} />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-lg shadow-md transition-colors text-sm flex items-center justify-center gap-2 mt-1"
              >
                {loading && <i className="fa-solid fa-spinner fa-spin text-xs"></i>}
                {loading ? 'Ingresando...' : 'Ingresar al Sistema'}
              </button>
              {loginError && (
                <p className="text-red-500 text-xs font-bold text-center mt-1">{loginError}</p>
              )}
            </form>

            {/* Panel de Usuarios de Prueba (Demo Rápido) */}
            <div className="bg-slate-50 border-t border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-flask text-orange-500"></i> Usuarios de Prueba
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Click para entrar directo</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_TEST_USERS.map((demo) => (
                  <button
                    key={demo.user}
                    type="button"
                    disabled={loading}
                    onClick={() => handleLogin(null, demo.user, demo.pass)}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all shadow-xs group cursor-pointer ${demo.bg}`}
                    title={`Ingresar como ${demo.label}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-white shadow-xs flex items-center justify-center shrink-0 border border-slate-100">
                      <i className={`fa-solid ${demo.icon} ${demo.color} text-sm`}></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 truncate group-hover:text-orange-600 transition-colors">
                        {demo.label}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate font-mono">
                        @{demo.user}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Layout Principal Full-Stack React */
        <div className="print:hidden h-screen flex overflow-hidden">
          <Sidebar
            activeTab={activeTab}
            onSwitchTab={handleSwitchTab}
            user={currentUser}
          />

          <main className="flex-1 flex flex-col h-screen overflow-hidden">
            <Header
              pageTitle={pageTitles[activeTab] || 'Punto de Venta'}
              user={currentUser}
              onLogout={handleLogout}
              onResetDemo={handleResetDemo}
            />

            <div className="flex-1 overflow-hidden relative w-full h-full bg-gray-50">
              {activeTab === 'pos' && (
                <PosPage
                  currentUser={currentUser}
                  onTriggerPrint={setTicketData}
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
              {activeTab === 'kardex' && <KardexPage currentUser={currentUser} />}
              {activeTab === 'compras' && <ComprasPage />}
              {activeTab === 'deliveries' && (
                <EntregasPage onTriggerPrint={setTicketData} />
              )}
              {activeTab === 'client-dir' && <ClientesPage />}
              {activeTab === 'customers' && <CreditosPage />}
              {activeTab === 'personal' && <PersonalPage currentUser={currentUser} />}
              {activeTab === 'dashboard' && <DashboardPage />}
            </div>
          </main>
        </div>
      )}
    </>
  );
}
