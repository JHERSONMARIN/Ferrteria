import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    ingresosCaja: 0,
    deudaCreditos: 0,
    salesCount: 0,
    vendedores: [],
    recentSales: []
  });
  const [loading, setLoading] = useState(false);

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
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Resumen Financiero y Eficiencia</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-emerald-500">
          <p className="text-sm font-bold text-slate-500 mb-1">Total Ingresos (Caja)</p>
          <h3 className="text-3xl font-black text-slate-800">S/ {stats.ingresosCaja.toFixed(2)}</h3>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-orange-500">
          <p className="text-sm font-bold text-slate-500 mb-1">Créditos por Cobrar (Deuda)</p>
          <h3 className="text-3xl font-black text-slate-800">S/ {stats.deudaCreditos.toFixed(2)}</h3>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-blue-500">
          <p className="text-sm font-bold text-slate-500 mb-1">Total Movimientos</p>
          <h3 className="text-3xl font-black text-slate-800">{stats.salesCount}</h3>
        </div>
      </div>

      {/* Eficiencia de Vendedores */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-100 bg-slate-50">
          <h3 className="font-bold text-slate-800">Eficiencia de Vendedores (Ventas y Entregas Filtradas)</h3>
        </div>
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-sm">
            <tr>
              <th className="px-4 py-3">Vendedor</th>
              <th className="px-4 py-3 text-center">Ventas Realizadas</th>
              <th className="px-4 py-3 text-right">Monto Total Vendido</th>
              <th className="px-4 py-3 text-center">Entregas Asignadas / Realizadas</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-gray-100">
            {stats.vendedores.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-4 py-4 text-center text-slate-400">
                  No hay vendedores registrados.
                </td>
              </tr>
            ) : (
              stats.vendedores.map(v => (
                <tr key={v.id} className="hover:bg-slate-50 border-b border-gray-100">
                  <td className="px-4 py-3 font-bold text-slate-700">
                    {v.name} <span className="text-xs text-slate-400 font-normal">({v.role})</span>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-600">{v.ventasCount}</td>
                  <td className="px-4 py-3 text-right font-black text-slate-800">S/ {v.totalVendido.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-bold">
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-slate-50">
          <h3 className="font-bold text-slate-800">Últimas Transacciones</h3>
        </div>
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-sm">
            <tr>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Vendedor</th>
              <th className="px-4 py-3">Método de Pago</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-gray-100">
            {stats.recentSales.map((s, idx) => (
              <tr key={idx}>
                <td className="px-4 py-3">
                  <span className="text-xs font-bold bg-gray-200 px-2 py-1 rounded">{s.doc}</span>
                </td>
                <td className="px-4 py-3 font-bold text-slate-700">{s.customer}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{s.seller}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{s.method}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-800">S/ {s.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
