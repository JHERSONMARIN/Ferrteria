import React, { useState, useEffect } from 'react';
import { roleLabel } from '../constants/roles.js';
import { api } from '../api.js';
import SalesReports from '../components/SalesReports.jsx';

export default function DashboardPage({ periodReports = true }) {
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
      alert('Error cargando estadísticas del Dashboard: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-ink">Panel de Control y Finanzas</h2>
          <p className="text-xs text-muted mt-0.5">
            Visión estratégica de ingresos en caja, cuentas por cobrar, capital de inventario y rotación comercial.
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

      {/* Eficiencia de Vendedores */}
      <div className="bg-surface rounded-xl shadow-sm border border-line overflow-hidden mb-6">
        <div className="p-4 border-b border-line bg-surface-muted flex justify-between items-center">
          <h3 className="font-bold text-ink text-sm">Eficiencia de Personal (Ventas y Despachos)</h3>
          <span className="text-xs text-muted">Rendimiento acumulado</span>
        </div>
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-muted text-muted text-xs uppercase shadow-sm">
            <tr>
              <th className="px-4 py-3">Personal</th>
              <th className="px-4 py-3 text-center">Ventas Realizadas</th>
              <th className="px-4 py-3 text-right">Monto Total Vendido</th>
              <th className="px-4 py-3 text-center">Entregas Asignadas / Completadas</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-line">
            {stats.vendedores.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-4 py-4 text-center text-muted">
                  No hay vendedores registrados.
                </td>
              </tr>
            ) : (
              stats.vendedores.map((v) => (
                <tr key={v.id} className="hover:bg-surface-muted transition-colors">
                  <td className="px-4 py-3 font-bold text-ink-soft">
                    {v.name} <span className="text-xs text-muted font-normal">({roleLabel(v.role)})</span>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-ink-soft">{v.ventasCount}</td>
                  <td className="px-4 py-3 text-right font-black text-ink">
                    S/ {(v.totalVendido || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-info-soft text-info px-2.5 py-1 rounded-full text-xs font-bold">
                      {v.entregasAsignadas} Asig. / {v.entregasCompletadas} Entregadas
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Últimas Transacciones */}
      <div className="bg-surface rounded-xl shadow-sm border border-line overflow-hidden">
        <div className="p-4 border-b border-line bg-surface-muted flex justify-between items-center">
          <h3 className="font-bold text-ink text-sm">Últimas 10 Transacciones de Venta</h3>
          <span className="text-xs text-muted">Historial reciente</span>
        </div>
        <div className="overflow-y-auto max-h-[25vh]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-muted text-muted text-xs uppercase sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-line">
              {stats.recentSales.map((s, idx) => (
                <tr key={idx} className="hover:bg-surface-muted transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold bg-surface-muted px-2 py-1 rounded">{s.doc}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink-soft">{s.customer}</td>
                  <td className="px-4 py-3 text-xs text-muted">{s.seller}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="bg-surface-muted px-2 py-1 rounded text-ink-soft font-bold">{s.method}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-black text-brand">
                    S/ {(s.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>}
    </div>
  );
}
