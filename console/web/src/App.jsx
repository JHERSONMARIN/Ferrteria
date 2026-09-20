import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api.js';
import LoginPage from './components/LoginPage.jsx';
import ChangePassword from './components/ChangePassword.jsx';
import CompanyList from './components/CompanyList.jsx';
import CompanyDetail from './components/CompanyDetail.jsx';
import NewCompanyModal from './components/NewCompanyModal.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [plans, setPlans] = useState(null);
  const [themes, setThemes] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/auth/me').then(res => setUser(res.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadCompanies = useCallback(async () => {
    try {
      setRefreshing(true);
      setError('');
      const [list, planData, themeData] = await Promise.all([
        api.get('/empresas?uso=1'),
        plans ? plans : api.get('/planes'),
        themes ? themes : api.get('/estilos'),
      ]);
      setCompanies(list);
      if (!plans) setPlans(planData);
      if (!themes) setThemes(themeData);
    } catch (err) {
      if (err.codigo === 'SESION_INVALIDA') setUser(null);
      else setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [plans, themes]);

  useEffect(() => {
    if (user && !user.mustChangePassword) loadCompanies();
  }, [user, loadCompanies]);

  const logout = async () => {
    await api.post('/auth/logout', {}).catch(() => {});
    setUser(null);
    setCompanies([]);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400"><i className="fa-solid fa-spinner fa-spin mr-2"></i>Cargando…</div>;
  }
  if (!user) return <LoginPage onLogin={setUser} />;
  if (user.mustChangePassword) return <ChangePassword user={user} onLogout={logout} onDone={() => setUser({ ...user, mustChangePassword: false })} />;

  const selectedCompany = companies.find(c => c.slug === selected) ?? null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <h1 className="font-black text-lg flex items-center gap-2">
            <i className="fa-solid fa-shop-lock text-orange-400"></i> Consola VALETEC
            <span className="text-xs font-normal text-slate-400">FerreSys</span>
          </h1>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <button onClick={() => setShowHistory(true)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              <i className="fa-solid fa-clock-rotate-left mr-1.5"></i>Historial
            </button>
            <button onClick={loadCompanies} disabled={refreshing} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50">
              <i className={`fa-solid fa-arrows-rotate mr-1.5 ${refreshing ? 'fa-spin' : ''}`}></i>Actualizar
            </button>
            <span className="text-slate-300 hidden sm:inline">{user.name}</span>
            <button onClick={logout} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700">Salir</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 flex flex-col gap-4">
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <CompanyList
          companies={companies}
          plans={plans}
          onSelect={setSelected}
          onNew={() => setShowNew(true)}
        />
      </main>

      {selectedCompany && (
        <CompanyDetail
          company={selectedCompany}
          plans={plans}
          themes={themes}
          onClose={() => setSelected(null)}
          onChanged={loadCompanies}
        />
      )}
      {showNew && (
        <NewCompanyModal
          plans={plans}
          companies={companies}
          onClose={() => setShowNew(false)}
          onCreated={loadCompanies}
        />
      )}
      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}
    </div>
  );
}
