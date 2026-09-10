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
    if (!currentUser) return;

    const heartbeatInterval = setInterval(async () => {
      try {
        const res = await api.get(`/usuarios/check/${currentUser.id}`);
        if (!res.active) {
          alert('Tu usuario ha sido desactivado o tus permisos han sido modificados.');
          handleLogout();
        } else {
          // Actualizar datos de usuario por si sus módulos asignados cambiaron
          const updatedUser = res.user;
          setCurrentUser(updatedUser);
          localStorage.setItem('ferre_user', JSON.stringify(updatedUser));
        }
      } catch (err) {
        console.warn('Error en Heartbeat:', err.message);
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

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoginError('');

    const fieldErrors = {};
    if (!loginUser.trim()) {
      fieldErrors.user = 'Ingrese su usuario.';
    } else if (loginUser.trim().length < 3) {
      fieldErrors.user = 'El usuario debe tener al menos 3 caracteres.';
    }
    if (!loginPass.trim()) {
      fieldErrors.pass = 'Ingrese su contraseña.';
    } else if (loginPass.length < 4) {
      fieldErrors.pass = 'La contraseña debe tener al menos 4 caracteres.';
    }
    setLoginFieldErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    try {
      setLoading(true);
      const res = await api.post('/auth/login', {
        user: loginUser.trim(),
        pass: loginPass.trim()
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
        <div id="login-screen" className="fixed inset-0 bg-slate-900 z-[100] flex items-center justify-center transition-all">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-6 bg-slate-950 text-white text-center border-b border-orange-500">
              <i className="fa-solid fa-screwdriver-wrench text-orange-500 text-4xl mb-3"></i>
              <h2 className="text-2xl font-bold tracking-wide">
                FerreSys <span className="text-sm text-orange-500 align-top">v4.8</span>
              </h2>
              <p className="text-slate-400 text-xs mt-1">Inicio de Sesión</p>
            </div>
            <form onSubmit={handleLogin} className="p-6 flex flex-col gap-4">
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
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors mt-2 text-sm"
              >
                {loading ? 'Ingresando...' : 'Ingresar al Sistema'}
              </button>
              {loginError && (
                <p className="text-red-500 text-xs font-bold text-center mt-1">{loginError}</p>
              )}
            </form>
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
              {activeTab === 'personal' && <PersonalPage />}
              {activeTab === 'dashboard' && <DashboardPage />}
            </div>
          </main>
        </div>
      )}
    </>
  );
}
