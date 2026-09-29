// Movimientos (kardex): entradas y salidas de cada producto, con filtros por período, tipo y sucursal.
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { KardexResponse, MovementType } from '@ferresys/contracts/inventory';
import type { Product } from '@ferresys/contracts/catalog';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { useBranches, useProducts } from '../../api/queries.ts';
import { exportToExcel } from '../../shared/utils/excelExport.ts';
import { useToast, EmptyState, SkeletonTable, Pagination, usePagination } from '../../shared/ui/index.ts';
import MovementFormModal from './components/MovementFormModal.tsx';

type Period = 'today' | 'week' | 'month' | 'custom';
type TypeFilter = 'TODOS' | MovementType;

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta Semana' },
  { id: 'month', label: 'Este Mes' },
  { id: 'custom', label: 'Personalizado' },
];

const NO_PRODUCTS: Product[] = [];
const EMPTY_SUMMARY = { totalIn: 0, totalOut: 0, netBalance: 0, movementCount: 0 };

export default function MovimientosPage() {
  const aviso = useToast();
  const queryClient = useQueryClient();
  const products = useProducts().data ?? NO_PRODUCTS;
  const branches = useBranches().data ?? [];
  // Con una sola sucursal no se muestra nada de sucursales.
  const multiBranch = branches.length > 1;

  // Filtros
  const [period, setPeriod] = useState<Period>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [filterType, setFilterType] = useState<TypeFilter>('TODOS');
  const [filterBranch, setFilterBranch] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Los filtros son parte de la clave: cambiar uno pide los movimientos de nuevo.
  const params = new URLSearchParams({ period });
  if (period === 'custom') {
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
  }
  if (filterCode) params.append('productCode', filterCode);
  if (filterType !== 'TODOS') params.append('type', filterType);
  if (filterBranch) params.append('branchId', filterBranch);
  const kardexQuery = useQuery({
    queryKey: [...queryKeys.kardex, params.toString()],
    queryFn: () => api.get<KardexResponse>(`/kardex?${params.toString()}`),
    placeholderData: previous => previous,
  });
  const kardexRecords = kardexQuery.data?.records ?? [];
  const summary = kardexQuery.data?.summary ?? EMPTY_SUMMARY;
  const loading = kardexQuery.isFetching;

  useEffect(() => {
    if (kardexQuery.error) aviso.error(`Error cargando movimientos de Kardex: ${kardexQuery.error.message}`);
  }, [kardexQuery.error, aviso]);

  const pagination = usePagination(kardexRecords);

  const handleSaved = async () => {
    setShowModal(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.kardex }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products }),
    ]);
    aviso.exito('Movimiento registrado correctamente.');
  };

  const handleExportExcel = () => {
    const exportData = kardexRecords.map((k) => ({
      'Fecha / Hora': k.date,
      'Código': k.code,
      'Producto': k.name,
      'Unidad': k.unit || 'Unidad',
      'Tipo': k.type,
      'Cantidad': k.type === 'ENTRADA' ? `+${k.qty}` : `-${k.qty}`,
      'Stock Resultante': k.stockAfter,
      'Personal a Cargo': `${k.user || 'Sistema'}${k.userRole ? ` (${k.userRole})` : ''}`,
      'Detalle / Referencia': k.ref,
    }));
    exportToExcel(exportData, `Kardex_${period}_${new Date().toISOString().slice(0, 10)}`);
  };

  const selectedProductData = useMemo(() => {
    if (!filterCode) return null;
    return products.find((p) => p.code === filterCode) || null;
  }, [filterCode, products]);

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        {/* Encabezado Principal */}
        <div className="p-4 border-b border-line flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-muted">
          <div>
            <p className="text-xs text-muted">
              Entradas, salidas por ventas, compras y ajustes de existencias, producto por producto.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end items-center">
            <button
              onClick={handleExportExcel}
              className="bg-surface border border-line hover:bg-surface-muted text-ink-soft px-3 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-file-excel"></i> Exportar
            </button>

            <button
              onClick={() => setShowModal(true)}
              className="bg-brand hover:bg-brand-strong text-brand-contrast px-4 py-2 rounded-xl text-sm font-semibold shadow-card transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-plus"></i> Registrar movimiento
            </button>
          </div>
        </div>

        {/* Panel de Resumen Contextual Reactivo */}
        <div className="p-4 bg-surface border-b border-line">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Entradas */}
            <div className="bg-success-soft/70 border border-success/20 p-3 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-success">Entradas</p>
                <h4 className="text-xl font-black text-success mt-0.5">+{summary.totalIn}</h4>
                <p className="text-[10px] text-success">Unidades ingresadas</p>
              </div>
              <span className="w-10 h-10 rounded-xl bg-success-soft text-success flex items-center justify-center text-base">
                <i className="fa-solid fa-arrow-down-long"></i>
              </span>
            </div>

            {/* Salidas */}
            <div className="bg-danger-soft/70 border border-danger/20 p-3 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-danger">Salidas</p>
                <h4 className="text-xl font-black text-danger mt-0.5">-{summary.totalOut}</h4>
                <p className="text-[10px] text-danger">Ventas / mermas / bajas</p>
              </div>
              <span className="w-10 h-10 rounded-xl bg-danger-soft text-danger flex items-center justify-center text-base">
                <i className="fa-solid fa-arrow-up-long"></i>
              </span>
            </div>

            {/* Balance Neto */}
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              summary.netBalance >= 0
                ? 'bg-info-soft/70 border-info/20 text-info'
                : 'bg-warning-soft/70 border-warning/20 text-warning'
            }`}>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Variación Neta</p>
                <h4 className="text-xl font-black mt-0.5">
                  {summary.netBalance >= 0 ? `+${summary.netBalance}` : summary.netBalance}
                </h4>
                <p className="text-[10px] text-muted">Diferencia del periodo</p>
              </div>
              <span className="w-10 h-10 rounded-xl bg-surface/80 flex items-center justify-center text-base shadow-sm">
                <i className="fa-solid fa-scale-balanced"></i>
              </span>
            </div>

            {/* Total Transacciones */}
            <div className="bg-surface-muted border border-line p-3 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Movimientos</p>
                <h4 className="text-xl font-black text-ink mt-0.5">{summary.movementCount}</h4>
                <p className="text-[10px] text-muted">
                  {selectedProductData ? `${selectedProductData.name.slice(0, 18)}...` : 'En todo el catálogo'}
                </p>
              </div>
              <span className="w-10 h-10 rounded-xl bg-surface-muted text-ink-soft flex items-center justify-center text-base">
                <i className="fa-solid fa-list-check"></i>
              </span>
            </div>
          </div>
        </div>

        {/* Barra de Filtros Temporales y de Producto */}
        <div className="p-4 border-b border-line bg-surface-muted/60 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Botones de Periodo Rápido */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-muted mr-1 flex items-center gap-1">
                <i className="fa-regular fa-calendar"></i> Periodo:
              </span>
              {PERIODS.map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setPeriod(btn.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    period === btn.id
                      ? 'bg-brand text-brand-contrast shadow-sm'
                      : 'bg-surface text-ink-soft border border-line hover:bg-surface-muted'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Filtro por Tipo de Movimiento */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-muted">Tipo:</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as TypeFilter)}
                className="border border-line bg-surface text-xs font-semibold py-1.5 px-3 rounded-lg outline-none focus:border-brand"
              >
                <option value="TODOS">Todos los tipos</option>
                <option value="ENTRADA">Solo Entradas (+)</option>
                <option value="SALIDA">Solo Salidas (-)</option>
              </select>
            </div>
          </div>

          {/* Rango de Fechas Personalizado si se selecciona 'custom' */}
          {period === 'custom' && (
            <div className="flex items-center gap-2 pt-2 border-t border-line/60 flex-wrap text-xs">
              <span className="font-bold text-muted">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-line bg-surface p-1.5 rounded-lg outline-none focus:border-brand"
              />
              <span className="font-bold text-muted ml-2">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-line bg-surface p-1.5 rounded-lg outline-none focus:border-brand"
              />
            </div>
          )}

          {/* Selector de Producto */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line/60">
            <label className="text-xs font-bold text-muted whitespace-nowrap">
              <i className="fa-solid fa-box mr-1"></i> Filtrar Producto:
            </label>
            <select
              value={filterCode}
              onChange={(e) => setFilterCode(e.target.value)}
              className="border border-line bg-surface p-2 rounded-lg outline-none focus:border-brand text-xs font-medium w-full md:w-96"
            >
              <option value="">-- Todos los Productos del Almacén --</option>
              {products.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.name} [{p.code}] - Stock actual: {p.stock} {p.unit}
                </option>
              ))}
            </select>
            {filterCode && (
              <button
                onClick={() => setFilterCode('')}
                className="text-xs text-brand hover:underline font-semibold"
              >
                (Limpiar filtro de producto)
              </button>
            )}
            {multiBranch && (
              <select
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
                aria-label="Sucursal"
                className="border border-line bg-surface p-2 rounded-lg outline-none focus:border-brand text-xs font-medium"
              >
                <option value="">Todas las sucursales</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Movimientos: tarjetas en pantallas chicas, tabla desde md. Máximo 10 por página. */}
        {!loading && kardexRecords.length > 0 && (
          <ul className="md:hidden divide-y divide-line">
            {pagination.pageItems.map((k) => {
              const isEntrada = k.type === 'ENTRADA';
              return (
                <li key={k.id} className="px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink text-sm leading-snug">{k.name}</p>
                      <p className="text-[11px] text-muted font-mono">{k.code} · {k.date}</p>
                    </div>
                    <span className={`shrink-0 text-right font-black ${isEntrada ? 'text-success' : 'text-danger'}`}>
                      {isEntrada ? '+' : '-'}{k.qty} <span className="text-[10px] font-normal text-muted">{k.unit || 'un.'}</span>
                      <span className="block text-[10px] font-semibold text-muted">Queda {k.stockAfter}</span>
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft">{k.ref}</p>
                  <p className="text-[11px] text-muted">
                    <i className="fa-solid fa-user-check mr-1"></i>{k.user || 'Sistema'}
                    {multiBranch && k.branch && <> · <i className="fa-solid fa-store mr-1"></i>{k.branch.name}</>}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <div className={`overflow-x-auto ${!loading && kardexRecords.length > 0 ? 'hidden md:block' : ''}`}>
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-muted text-muted text-xs uppercase shadow-sm">
              <tr>
                <th className="px-4 py-3">Fecha / Hora</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-center">Tipo</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Stock Resultante</th>
                <th className="px-4 py-3">Personal a Cargo</th>
                <th className="px-4 py-3">Detalle / Referencia</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-line">
              {loading && kardexRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-0"><SkeletonTable rows={8} columns={5} /></td>
                </tr>
              ) : kardexRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-0">
                    <EmptyState
                      icon="fa-receipt"
                      title="Sin movimientos en este período"
                      description="Cambie las fechas o el filtro para ver otras entradas y salidas."
                    />
                  </td>
                </tr>
              ) : (
                pagination.pageItems.map((k) => {
                  const isEntrada = k.type === 'ENTRADA';
                  return (
                    <tr key={k.id} className="hover:bg-surface-muted transition-colors">
                      <td className="px-4 py-3 text-xs text-muted font-medium whitespace-nowrap">{k.date}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-ink-soft">{k.code}</td>
                      <td className="px-4 py-3 font-semibold text-ink">{k.name}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`${
                            isEntrada ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                          } px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1`}
                        >
                          <i className={`fa-solid ${isEntrada ? 'fa-arrow-down' : 'fa-arrow-up'} text-[8px]`}></i>
                          {k.type}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-black ${
                          isEntrada ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {isEntrada ? '+' : '-'}{k.qty} <span className="text-[10px] font-normal text-muted">{k.unit || 'un.'}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-ink">
                        {k.stockAfter}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="font-bold text-ink-soft flex items-center gap-1.5">
                          <i className="fa-solid fa-user-check text-muted text-[10px]"></i>
                          {k.user || 'Sistema'}
                        </div>
                        {k.userRole && (
                          <span className="text-[10px] text-muted font-medium">({k.userRole})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-soft">
                        {k.ref}
                        {multiBranch && k.branch && (
                          <span className="block text-[10px] text-muted"><i className="fa-solid fa-store mr-1"></i>{k.branch.name}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pagination} />
      </div>

      {showModal && (
        <MovementFormModal products={products} onClose={() => setShowModal(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
