import React, { useState, useEffect } from 'react';
import { roleLabel } from '../constants/roles.js';
import { api } from '../api.js';
import SalesReports from '../components/SalesReports.jsx';
import { useToast } from '../components/ui/index.js';

export default function DashboardPage({ periodReports = true }) {
  const aviso = useToast();
  const [stats, setStats] = useState({
    ingresosCaja: 0,
    deudaCreditos: 0,
    salesCount: 0,
    totalProductsCount: 0,
    totalInventoryValue: 0,
    lowStockCount: 0,
    vendedores: [],
    recentSales: [],
  });
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('summary');

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      setLoading(true);
      const data = await api.get('/dashboard/stats');
      setStats(data);
    } catch (err) {
      aviso.error('Error cargando estadísticas del Dashboard: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-xs text-muted">
            Ingresos en caja, cuentas por cobrar, capital en inventario y rotación del negocio.
          </p>
        </div>
        {view === 'summary' && <button
          onClick={loadDashboardStats}
          disabled={loading}
          className="bg-surface border border-line hover:bg-surface-muted text-ink-soft text-xs font-bold py-2 px-3 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
        >
          <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`}></i>
          Actualizar
        </button>}
      </div>

      <div className="flex gap-1 mb-5 border-b border-line" role="tablist">
        {[['summary', 'Resumen general', 'fa-gauge'], ...(periodReports ? [['reports', 'Reportes por período', 'fa-chart-column']] : [])].map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${view === id ? 'border-brand text-brand-text' : 'border-transparent text-muted hover:text-ink-soft'}`}
          >
            <i className={`fa-solid ${icon} mr-1.5`}></i>{label}
          </button>
        ))}
      </div>

      {view === 'reports' && periodReports ? <SalesReports /> : <>

      {/* Métricas Principales (Finanzas + Inventario) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* Ingresos en Caja */}
        <div className="bg-surface p-5 rounded-xl shadow-sm border border-line border-l-4 border-l-emerald-500 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Ingresos en Caja (Efectivo/Digital)</p>
            <span className="w-8 h-8 rounded-lg bg-success-soft text-success flex items-center justify-center text-sm font-bold">
              <i className="fa-solid fa-cash-register"></i>
            </span>
          </div>
          <h3 className="text-2xl font-black text-ink mt-2">
            S/ {(stats.ingresosCaja || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-muted mt-1">Ventas cerradas y cobradas</p>
        </div>

        {/* Créditos por Cobrar */}
        <div className="bg-surface p-5 rounded-xl shadow-sm border border-line border-l-4 border-l-orange-500 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Créditos / Fiados Pendientes</p>
            <span className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center text-sm font-bold">
              <i className="fa-solid fa-hand-holding-dollar"></i>
            </span>
          </div>
          <h3 className="text-2xl font-black text-ink mt-2">
            S/ {(stats.deudaCreditos || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-muted mt-1">Deuda activa de clientes</p>
        </div>

        {/* Capital en Almacén */}
        <div className="bg-surface p-5 rounded-xl shadow-sm border border-line border-l-4 border-l-indigo-500 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Capital en Almacén (Stock)</p>
            <span className="w-8 h-8 rounded-lg bg-info-soft text-info flex items-center justify-center text-sm font-bold">
              <i className="fa-solid fa-coins"></i>
            </span>
          </div>
          <h3 className="text-2xl font-black text-info mt-2">
            S/ {(stats.totalInventoryValue || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-muted mt-1">Inversión inmovilizada valorizada</p>
        </div>

        {/* Ventas Realizadas */}
        <div className="bg-surface p-5 rounded-xl shadow-sm border border-line border-l-4 border-l-blue-500 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Comprobantes Emitidos</p>
            <span className="w-8 h-8 rounded-lg bg-info-soft text-info flex items-center justify-center text-sm font-bold">
              <i className="fa-solid fa-receipt"></i>
            </span>
          </div>
          <h3 className="text-2xl font-black text-ink mt-2">
            {stats.salesCount || 0}
          </h3>
          <p className="text-[11px] text-muted mt-1">Boletas, facturas y notas de venta</p>
        </div>

        {/* Alerta de Stock Crítico */}
        <div className={`p-5 rounded-xl shadow-sm border border-line border-l-4 flex flex-col justify-between ${
          stats.lowStockCount > 0
            ? 'bg-danger-soft/50 border-l-red-500'
            : 'bg-surface border-l-emerald-500'
        }`}>
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Alerta de Reposición</p>
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
              stats.lowStockCount > 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
            }`}>
              <i className={`fa-solid ${stats.lowStockCount > 0 ? 'fa-triangle-exclamation' : 'fa-check'}`}></i>
            </span>
          </div>
          <h3 className={`text-2xl font-black mt-2 ${stats.lowStockCount > 0 ? 'text-danger' : 'text-ink'}`}>
            {stats.lowStockCount || 0} {stats.lowStockCount === 1 ? 'producto' : 'productos'}
          </h3>
          <p className="text-[11px] text-muted mt-1">
            {stats.lowStockCount > 0 ? 'En nivel de stock mínimo o agotado' : 'Inventario en niveles óptimos'}
          </p>
        </div>

        {/* Catálogo de Productos */}
        <div className="bg-surface p-5 rounded-xl shadow-sm border border-line border-l-4 border-l-slate-600 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Catálogo de Almacén</p>
            <span className="w-8 h-8 rounded-lg bg-surface-muted text-ink-soft flex items-center justify-center text-sm font-bold">
              <i className="fa-solid fa-boxes-stacked"></i>
            </span>
          </div>
          <h3 className="text-2xl font-black text-ink mt-2">
            {stats.totalProductsCount || 0} ítems
          </h3>
          <p className="text-[11px] text-muted mt-1">Líneas registradas y activas</p>
        </div>
      </div>

      {/* Listas: rendimiento del personal y últimas ventas, lado a lado en pantallas anchas.
          Son listas (no tablas) para que se lean bien también en el celular, sin scroll interno. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <section className="bg-surface rounded-xl shadow-sm border border-line overflow-hidden">
          <header className="px-4 py-3 border-b border-line flex justify-between items-center gap-2">
            <h3 className="font-bold text-ink text-sm"><i className="fa-solid fa-users mr-2 text-muted"></i>Rendimiento del personal</h3>
            <span className="text-[11px] text-muted">Acumulado</span>
          </header>
          {stats.vendedores.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Todavía no hay ventas registradas.</p>
          ) : (
            <ul className="divide-y divide-line">
              {[...stats.vendedores].sort((a, b) => (b.totalVendido || 0) - (a.totalVendido || 0)).map((v) => {
                const top = Math.max(...stats.vendedores.map(x => x.totalVendido || 0), 1);
                const share = Math.round(((v.totalVendido || 0) / top) * 100);
                return (
                  <li key={v.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink truncate">{v.name}</p>
                        <p className="text-[11px] text-muted">
                          {roleLabel(v.role)} · {v.ventasCount} venta{v.ventasCount === 1 ? '' : 's'}
                          {(v.entregasAsignadas > 0 || v.entregasCompletadas > 0) && (
                            <> · {v.entregasCompletadas}/{v.entregasAsignadas} envíos entregados</>
                          )}
                        </p>
                      </div>
                      <span className="text-sm font-black text-ink tabular-nums whitespace-nowrap">
                        S/ {(v.totalVendido || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="bg-surface rounded-xl shadow-sm border border-line overflow-hidden">
          <header className="px-4 py-3 border-b border-line flex justify-between items-center gap-2">
            <h3 className="font-bold text-ink text-sm"><i className="fa-solid fa-receipt mr-2 text-muted"></i>Últimas ventas</h3>
            <span className="text-[11px] text-muted">Las 10 más recientes</span>
          </header>
          {stats.recentSales.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Todavía no hay ventas registradas.</p>
          ) : (
            <ul className="divide-y divide-line">
              {stats.recentSales.map((s, idx) => (
                <li key={idx} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-[11px] font-bold bg-surface-muted text-ink-soft px-2 py-1 rounded shrink-0">{s.doc}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{s.customer}</p>
                    <p className="text-[11px] text-muted truncate">{s.seller} · {s.method}</p>
                  </div>
                  <span className="text-sm font-black text-ink tabular-nums whitespace-nowrap">
                    S/ {(s.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      </>}
    </div>
  );
}
