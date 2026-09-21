import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';
import { useToast, EmptyState, SkeletonTable, Pagination, usePagination } from '../components/ui/index.js';

const STATUS_STYLE = {
  PENDIENTE: { label: 'Pendiente', badge: 'bg-warning-soft text-warning border-warning/30' },
  CONVERTIDO: { label: 'Terminada', badge: 'bg-success-soft text-success border-success/30' },
  CANCELADO: { label: 'Cancelada', badge: 'bg-surface-muted text-ink-soft border-line' },
};

// Terminadas son las que ya se vendieron. Modificar una cotización genera otra nueva.
const FILTER_TABS = [
  { id: 'PENDIENTE', label: 'Pendientes' },
  { id: 'CONVERTIDO', label: 'Terminadas' },
  { id: 'CANCELADO', label: 'Canceladas' },
  { id: 'TODAS', label: 'Todas' },
];

export default function CotizacionesPage() {
  const aviso = useToast();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDIENTE');
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
      aviso.error('Error cargando cotizaciones: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredCotizaciones = useMemo(() => {
    let list = cotizaciones;

    if (statusFilter !== 'TODAS') {
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
      aviso.exito('Cotización eliminada exitosamente.');
    } catch (err) {
      aviso.error('Error al eliminar cotización: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Máximo 10 por página; en pantallas chicas se ve la página completa sin scroll interno.
  const pg = usePagination(filteredCotizaciones);

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        {/* Encabezado Principal */}
        <div className="p-4 border-b border-line flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-muted">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-bold text-ink">{cotizaciones.length} cotización{cotizaciones.length === 1 ? '' : 'es'}</p>
              {pendingCount > 0 && (
                <span className="bg-warning-soft text-warning px-2 py-0.5 rounded-full text-[11px] font-bold border border-warning/30">
                  {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="text-xs text-muted">
              Proformas generadas al vender. Se cargan de vuelta desde el Punto de Venta.
            </p>
          </div>
        </div>

        {/* Panel de Filtros */}
        <div className="flex-1 bg-surface-muted/50 flex flex-col gap-4">
          <div className="bg-surface p-4 border-b border-line flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 w-full">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-muted text-sm"></i>
              <input
                type="text"
                placeholder="Buscar por N° documento, cliente o vendedor..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-surface-muted border border-line rounded-lg text-sm outline-none focus:border-brand transition-colors"
              />
            </div>

            <button
              onClick={() => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))}
              className="bg-surface border border-line hover:bg-surface-muted text-ink-soft px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2 shrink-0"
              title="Cambiar orden por fecha"
            >
              <i className={`fa-solid ${sortDir === 'desc' ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide'} text-brand`}></i>
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
                    ? 'bg-brand text-brand-contrast border-brand shadow-sm'
                    : 'bg-surface text-ink-soft border-line hover:bg-surface-muted'
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
                <tr className="text-left text-xs font-bold text-muted uppercase border-b border-line">
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
                    <td colSpan={7} className="p-0"><SkeletonTable rows={6} columns={5} /></td>
                  </tr>
                ) : filteredCotizaciones.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <EmptyState
                        icon="fa-file-invoice"
                        title={cotizaciones.length === 0 ? 'Todavía no hay cotizaciones' : 'Ninguna cotización coincide'}
                        description={cotizaciones.length === 0
                          ? 'Las proformas que guarde desde el Punto de Venta aparecen aquí.'
                          : 'Pruebe con otro texto o cambie los filtros.'}
                      />
                    </td>
                  </tr>
                ) : (
                  pg.pageItems.map(cot => {
                    const style = STATUS_STYLE[cot.status] || STATUS_STYLE.PENDIENTE;
                    return (
                      <tr key={cot.id} className="border-b border-line hover:bg-surface-muted transition-colors">
                        <td className="py-2.5 px-2 font-mono text-xs font-bold text-ink-soft">{cot.numDoc}</td>
                        <td className="py-2.5 px-2 text-xs text-ink-soft">{cot.date}</td>
                        <td className="py-2.5 px-2 text-ink-soft">{cot.customer}</td>
                        <td className="py-2.5 px-2 text-ink-soft text-xs">{cot.seller}</td>
                        <td className="py-2.5 px-2 text-right font-bold text-ink">
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
                              className="text-muted hover:text-brand p-1.5 rounded hover:bg-surface-muted transition-colors"
                              title="Ver detalle"
                            >
                              <i className="fa-solid fa-eye text-xs"></i>
                            </button>
                            {cot.status === 'PENDIENTE' && (
                              <button
                                onClick={() => openDeleteModal(cot)}
                                className="text-muted hover:text-danger p-1.5 rounded hover:bg-surface-muted transition-colors"
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
            <Pagination {...pg} className="px-0" />
          </div>
        </div>
      </div>

      {/* MODAL: DETALLE DE COTIZACIÓN */}
      {detailTarget && (
        <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-4 bg-panel text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <i className="fa-solid fa-file-invoice text-brand"></i>
                {detailTarget.numDoc}
              </h3>
              <button onClick={() => setDetailTarget(null)} className="text-muted hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-5 flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                <div><span className="font-bold text-ink-soft">Fecha:</span> {detailTarget.date}</div>
                <div><span className="font-bold text-ink-soft">Vigencia:</span> {detailTarget.validDays} días</div>
                <div><span className="font-bold text-ink-soft">Cliente:</span> {detailTarget.customer}</div>
                <div><span className="font-bold text-ink-soft">Vendedor:</span> {detailTarget.seller}</div>
              </div>

              <div className="border border-line rounded-lg overflow-hidden mt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-muted text-muted text-left">
                      <th className="py-1.5 px-2">Producto</th>
                      <th className="py-1.5 px-2 text-right">Cant.</th>
                      <th className="py-1.5 px-2 text-right">P. Unit.</th>
                      <th className="py-1.5 px-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailTarget.detalles.map((d, idx) => (
                      <tr key={idx} className="border-t border-line">
                        <td className="py-1.5 px-2 text-ink-soft">{d.producto?.name}{d.unitName && <span className="text-brand-text font-semibold"> · {d.unitName}</span>}</td>
                        <td className="py-1.5 px-2 text-right">{d.quantity}</td>
                        <td className="py-1.5 px-2 text-right">S/ {d.unitPrice.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-right font-bold">S/ {d.subtotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2 border-t border-line">
                <span className="font-bold text-ink">
                  Total: S/ {detailTarget.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="p-4 bg-surface-muted border-t border-line flex justify-end">
              <button
                onClick={() => setDetailTarget(null)}
                className="px-4 py-2 font-bold text-ink-soft bg-surface-muted hover:bg-line rounded-lg text-sm transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ELIMINAR COTIZACIÓN */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-danger text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation"></i>
                Eliminar Cotización
              </h3>
              <button onClick={closeDeleteModal} className="text-danger-soft hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-2 text-ink-soft text-sm">
              <p>
                ¿Está seguro de que desea eliminar la cotización{' '}
                <strong className="text-ink">{deleteTarget.numDoc}</strong>?
              </p>
              <p className="text-xs text-muted">
                Quedará marcada como cancelada y dejará de aparecer en el Punto de Venta. Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="p-4 bg-surface-muted border-t border-line flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="px-4 py-2 font-bold text-ink-soft bg-surface-muted hover:bg-line rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 font-bold text-white bg-danger hover:brightness-95 rounded-lg text-sm shadow-sm transition-colors flex items-center gap-2"
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
