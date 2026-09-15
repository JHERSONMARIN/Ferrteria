import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';

const STATUS_STYLE = {
  PENDIENTE: { label: 'Pendiente', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  CONVERTIDO: { label: 'Convertida', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  CANCELADO: { label: 'Cancelada', badge: 'bg-slate-200 text-slate-600 border-slate-300' },
};

const FILTER_TABS = [
  { id: 'ACTIVAS', label: 'Activas' },
  { id: 'PENDIENTE', label: 'Pendientes' },
  { id: 'CONVERTIDO', label: 'Convertidas' },
  { id: 'CANCELADO', label: 'Canceladas' },
  { id: 'TODAS', label: 'Todas' },
];

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVAS');
  const [sortDir, setSortDir] = useState('desc'); // desc = más recientes primero

  const [detailTarget, setDetailTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadCotizaciones();
  }, []);

  const loadCotizaciones = async () => {
    try {
      setLoading(true);
      const data = await api.get('/cotizaciones');
      setCotizaciones(data || []);
    } catch (err) {
      console.error('Error cargando cotizaciones desde API:', err);
      alert('Error cargando cotizaciones: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredCotizaciones = useMemo(() => {
    let list = cotizaciones;

    if (statusFilter === 'ACTIVAS') {
      list = list.filter(c => c.status !== 'CANCELADO');
    } else if (statusFilter !== 'TODAS') {
      list = list.filter(c => c.status === statusFilter);
    }

    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(c =>
        c.numDoc.toLowerCase().includes(q) ||
        (c.customer && c.customer.toLowerCase().includes(q)) ||
        (c.seller && c.seller.toLowerCase().includes(q))
      );
    }

    const sorted = [...list].sort((a, b) => {
      const diff = new Date(a.date) - new Date(b.date) || a.id - b.id;
      return sortDir === 'asc' ? diff : -diff;
    });

    return sorted;
  }, [cotizaciones, statusFilter, searchQuery, sortDir]);

  const pendingCount = useMemo(
    () => cotizaciones.filter(c => c.status === 'PENDIENTE').length,
    [cotizaciones]
  );

  const openDeleteModal = (cot) => setDeleteTarget(cot);
  const closeDeleteModal = () => setDeleteTarget(null);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await api.delete(`/cotizaciones/${deleteTarget.id}`);
      closeDeleteModal();
      await loadCotizaciones();
      alert('Cotización eliminada exitosamente.');
    } catch (err) {
      alert('Error al eliminar cotización: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        {/* Encabezado Principal */}
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <i className="fa-solid fa-file-invoice"></i> Ventas
              </span>
              <h3 className="font-bold text-slate-800 text-lg">Cotizaciones ({cotizaciones.length})</h3>
              {pendingCount > 0 && (
                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[11px] font-bold border border-amber-200">
                  {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Historial de proformas / cotizaciones generadas desde el Punto de Venta.
            </p>
          </div>
        </div>

        {/* Panel de Filtros */}
        <div className="flex-1 bg-slate-50/50 flex flex-col gap-4">
          <div className="bg-white p-4 border-b border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 w-full">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400 text-sm"></i>
              <input
                type="text"
                placeholder="Buscar por N° documento, cliente o vendedor..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            <button
              onClick={() => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))}
              className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2 shrink-0"
              title="Cambiar orden por fecha"
            >
              <i className={`fa-solid ${sortDir === 'desc' ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide'} text-orange-600`}></i>
              {sortDir === 'desc' ? 'Más recientes' : 'Más antiguas'}
            </button>
          </div>

          <div className="px-4 flex flex-wrap gap-2">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
                  <th className="py-2 px-2">Documento</th>
                  <th className="py-2 px-2">Fecha</th>
                  <th className="py-2 px-2">Cliente</th>
                  <th className="py-2 px-2">Vendedor</th>
                  <th className="py-2 px-2 text-right">Total</th>
                  <th className="py-2 px-2 text-center">Estado</th>
                  <th className="py-2 px-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading && cotizaciones.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando cotizaciones...
                    </td>
                  </tr>
                ) : filteredCotizaciones.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      <i className="fa-solid fa-file-invoice text-4xl mb-2 text-slate-300 block"></i>
                      No se encontraron cotizaciones con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredCotizaciones.map(cot => {
                    const style = STATUS_STYLE[cot.status] || STATUS_STYLE.PENDIENTE;
                    return (
                      <tr key={cot.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-2 font-mono text-xs font-bold text-slate-700">{cot.numDoc}</td>
                        <td className="py-2.5 px-2 text-xs text-slate-600">{cot.date}</td>
                        <td className="py-2.5 px-2 text-slate-700">{cot.customer}</td>
                        <td className="py-2.5 px-2 text-slate-600 text-xs">{cot.seller}</td>
                        <td className="py-2.5 px-2 text-right font-bold text-slate-800">
                          S/ {cot.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${style.badge}`}>
                            {style.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setDetailTarget(cot)}
                              className="text-slate-400 hover:text-orange-600 p-1.5 rounded hover:bg-slate-100 transition-colors"
                              title="Ver detalle"
                            >
                              <i className="fa-solid fa-eye text-xs"></i>
                            </button>
                            {cot.status === 'PENDIENTE' && (
                              <button
                                onClick={() => openDeleteModal(cot)}
                                className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-slate-100 transition-colors"
                                title="Eliminar cotización"
                              >
                                <i className="fa-solid fa-trash-can text-xs"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL: DETALLE DE COTIZACIÓN */}
      {detailTarget && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <i className="fa-solid fa-file-invoice text-orange-400"></i>
                {detailTarget.numDoc}
              </h3>
              <button onClick={() => setDetailTarget(null)} className="text-slate-400 hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-5 flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div><span className="font-bold text-slate-700">Fecha:</span> {detailTarget.date}</div>
                <div><span className="font-bold text-slate-700">Vigencia:</span> {detailTarget.validDays} días</div>
                <div><span className="font-bold text-slate-700">Cliente:</span> {detailTarget.customer}</div>
                <div><span className="font-bold text-slate-700">Vendedor:</span> {detailTarget.seller}</div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden mt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-left">
                      <th className="py-1.5 px-2">Producto</th>
                      <th className="py-1.5 px-2 text-right">Cant.</th>
                      <th className="py-1.5 px-2 text-right">P. Unit.</th>
                      <th className="py-1.5 px-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailTarget.detalles.map((d, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="py-1.5 px-2 text-slate-700">{d.producto?.name}</td>
                        <td className="py-1.5 px-2 text-right">{d.quantity}</td>
                        <td className="py-1.5 px-2 text-right">S/ {d.unitPrice.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-right font-bold">S/ {d.subtotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-800">
                  Total: S/ {detailTarget.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setDetailTarget(null)}
                className="px-4 py-2 font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ELIMINAR COTIZACIÓN */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-red-600 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation"></i>
                Eliminar Cotización
              </h3>
              <button onClick={closeDeleteModal} className="text-red-100 hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-2 text-slate-700 text-sm">
              <p>
                ¿Está seguro de que desea eliminar la cotización{' '}
                <strong className="text-slate-900">{deleteTarget.numDoc}</strong>?
              </p>
              <p className="text-xs text-slate-500">
                Quedará marcada como cancelada y dejará de aparecer en el Punto de Venta. Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="px-4 py-2 font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg text-sm shadow-sm transition-colors flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i> Eliminando...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-trash-can"></i> Confirmar Eliminación
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
