// Compras: el historial de compras a proveedores y cómo varió el costo de cada producto.
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Purchase, Supplier } from '@ferresys/contracts/purchasing';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { useProducts } from '../../api/queries.ts';
import { useToast, Pagination, usePagination } from '../../shared/ui/index.ts';
import SupplierFormModal from './components/SupplierFormModal.tsx';
import PurchaseFormModal from './components/PurchaseFormModal.tsx';
import PurchaseDetailModal from './components/PurchaseDetailModal.tsx';

interface CostPurchase {
  date: string;
  numDoc: string;
  provider: string;
  quantity: number;
  unitCost: number;
}

export default function ComprasPage() {
  const aviso = useToast();
  const queryClient = useQueryClient();
  const comprasQuery = useQuery({ queryKey: queryKeys.purchases, queryFn: () => api.get<Purchase[]>('/compras') });
  const proveedoresQuery = useQuery({ queryKey: queryKeys.suppliers, queryFn: () => api.get<Supplier[]>('/proveedores') });
  const productosQuery = useProducts();
  const compras = comprasQuery.data ?? [];
  const proveedores = proveedoresQuery.data ?? [];
  const productos = productosQuery.data ?? [];
  const [viewMode, setViewMode] = useState<'historial' | 'costos'>('historial');

  // Modales
  const [showCompraModal, setShowCompraModal] = useState(false);
  const [showProveedorModal, setShowProveedorModal] = useState(false);
  const [selectedCompra, setSelectedCompra] = useState<Purchase | null>(null);

  // Histórico de variación de costos: buscador + producto seleccionado (panel derecho)
  const [costSearch, setCostSearch] = useState('');
  const [selectedCostCode, setSelectedCostCode] = useState<string | null>(null);

  const loadError = comprasQuery.error ?? proveedoresQuery.error ?? productosQuery.error;
  useEffect(() => {
    if (loadError) aviso.error(`Error cargando datos de compras: ${loadError.message}`);
  }, [loadError, aviso]);

  const handleSupplierSaved = async () => {
    setShowProveedorModal(false);
    await queryClient.invalidateQueries({ queryKey: queryKeys.suppliers });
    aviso.exito('Proveedor guardado con éxito.');
  };

  // La compra ingresa stock: cambian el catálogo y el kardex.
  const handlePurchaseSaved = async () => {
    setShowCompraModal(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.purchases }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products }),
      queryClient.invalidateQueries({ queryKey: queryKeys.kardex }),
    ]);
    aviso.exito('¡Compra registrada exitosamente! El stock del inventario y el Kardex han sido actualizados.');
  };

  // Histórico de Variación de Costos: agrupa las compras por producto en orden
  // cronológico y calcula la variación del costo unitario frente a la compra anterior.
  const comprasAsc = [...compras].sort((a, b) => a.id - b.id);
  const costVariationMap = new Map<string, { code: string; name: string; purchases: CostPurchase[] }>();
  comprasAsc.forEach(c => {
    c.detalles.forEach(d => {
      const key = d.producto.code;
      const group = costVariationMap.get(key) ?? { code: key, name: d.producto.name, purchases: [] };
      costVariationMap.set(key, group);
      group.purchases.push({
        date: c.date,
        numDoc: c.numDoc,
        provider: c.provider,
        quantity: d.quantity,
        unitCost: d.unitPrice,
      });
    });
  });

  const costVariation = Array.from(costVariationMap.values()).map(g => {
    const purchases = g.purchases.map((p, i) => {
      const prev = i > 0 ? g.purchases[i - 1]?.unitCost ?? null : null;
      const delta = prev !== null ? p.unitCost - prev : null;
      const pct = prev && delta !== null ? (delta / prev) * 100 : null;
      return { ...p, delta, pct };
    });
    const costs = purchases.map(p => p.unitCost);
    const firstCost = costs[0] ?? 0;
    const lastCost = costs[costs.length - 1] ?? 0;
    const totalDelta = lastCost - firstCost;
    const totalPct = firstCost ? (totalDelta / firstCost) * 100 : null;
    return {
      ...g,
      purchases,
      firstCost,
      lastCost,
      minCost: Math.min(...costs),
      maxCost: Math.max(...costs),
      totalDelta,
      totalPct,
      timesPurchased: purchases.length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const costVariationFiltered = costVariation.filter(p => {
    const q = costSearch.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
  });

  const selectedCostProduct = costVariation.find(p => p.code === selectedCostCode) || null;

  // Máximo 10 por página; en pantallas chicas se ve la página completa sin scroll interno.
  const pg = usePagination(compras);

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-xs text-muted">Facturas y guías de proveedores: ingresan stock y actualizan el costo de cada producto.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowProveedorModal(true)} className="bg-surface border border-line hover:bg-surface-muted text-ink-soft px-3 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2">
            <i className="fa-solid fa-truck-field"></i> Nuevo proveedor
          </button>
          <button onClick={() => setShowCompraModal(true)} className="bg-brand hover:bg-brand-strong text-brand-contrast px-4 py-2 rounded-xl text-sm font-semibold shadow-card transition-colors flex items-center gap-2">
            <i className="fa-solid fa-cart-flatbed"></i> Registrar compra
          </button>
        </div>
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-line bg-surface-muted flex justify-between items-center">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('historial')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'historial' ? 'bg-panel text-white shadow' : 'bg-surface text-ink-soft border'}`}
            >
              <i className="fa-solid fa-receipt mr-1.5"></i> Historial de Compras
            </button>
            <button
              onClick={() => setViewMode('costos')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'costos' ? 'bg-panel text-white shadow' : 'bg-surface text-ink-soft border'}`}
            >
              <i className="fa-solid fa-chart-line mr-1.5"></i> Histórico de Variación de Costos
            </button>
          </div>
        </div>

        {viewMode === 'historial' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-muted text-muted text-xs uppercase shadow-sm">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">N° Doc / Factura</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Items Comprados</th>
                  <th className="px-4 py-3 text-right">Monto Total</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-line">
                {compras.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted">
                      No hay compras de mercadería registradas.
                    </td>
                  </tr>
                ) : (
                  pg.pageItems.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCompra(c)}
                      className="hover:bg-brand-soft border-b border-line cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-xs text-muted">{c.date}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold">{c.numDoc}</td>
                      <td className="px-4 py-3 font-bold text-ink-soft">
                        {c.provider} <span className="text-xs text-muted font-normal">({c.providerRuc})</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-soft">
                        {c.detalles.map(d => `${d.quantity}x ${d.producto.name}`).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-ink">
                        S/ {c.total.toFixed(2)}
                        <i className="fa-solid fa-chevron-right text-muted ml-2"></i>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination {...pg} />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row h-[calc(100dvh-13rem)] lg:h-[calc(100vh-15rem)] min-h-[360px] lg:min-h-[400px] overflow-hidden">
            {/* Columna izquierda: buscador + lista compacta */}
            <div className={`flex-col min-h-0 lg:flex-1 lg:border-r border-line ${selectedCostProduct ? 'hidden lg:flex' : 'flex'}`}>
              <div className="p-3 border-b border-line bg-surface shrink-0">
                <div className="relative w-full lg:max-w-sm">
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs"></i>
                  <input
                    type="text"
                    value={costSearch}
                    onChange={e => setCostSearch(e.target.value)}
                    placeholder="Buscar producto por nombre o código..."
                    className="w-full border border-line bg-surface pl-9 pr-3 py-2 rounded-lg outline-none focus:border-brand text-sm"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {costVariationFiltered.length === 0 ? (
                  <div className="px-4 py-10 text-center text-muted">
                    <i className="fa-solid fa-chart-line text-2xl mb-2 block"></i>
                    {costVariation.length === 0
                      ? 'Aún no hay compras registradas para analizar la variación de costos.'
                      : 'Ningún producto coincide con la búsqueda.'}
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-surface-muted text-muted text-xs uppercase sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-3 sm:px-4 py-3">Producto</th>
                        <th className="px-4 py-3 text-center hidden sm:table-cell">Compras</th>
                        <th className="px-3 sm:px-4 py-3 text-right">Costo Actual</th>
                        <th className="px-3 sm:px-4 py-3 text-right">Variación Total</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-line">
                      {costVariationFiltered.map(prod => {
                        const up = prod.totalDelta > 0.0001;
                        const down = prod.totalDelta < -0.0001;
                        const trendColor = up ? 'text-danger' : down ? 'text-success' : 'text-muted';
                        const trendIcon = up ? 'fa-arrow-trend-up' : down ? 'fa-arrow-trend-down' : 'fa-minus';
                        const isSelected = selectedCostCode === prod.code;

                        return (
                          <tr
                            key={prod.code}
                            onClick={() => setSelectedCostCode(prod.code)}
                            className={`cursor-pointer transition-colors ${isSelected ? 'bg-brand-soft' : 'hover:bg-surface-muted'}`}
                          >
                            <td className={`px-3 sm:px-4 py-3 border-l-4 ${isSelected ? 'border-brand' : 'border-transparent'}`}>
                              <div className="font-bold text-ink leading-tight">{prod.name}</div>
                              <span className="font-mono text-xs text-muted">{prod.code}</span>
                              <span className="sm:hidden text-[11px] text-muted"> · {prod.timesPurchased} compras</span>
                            </td>
                            <td className="px-4 py-3 text-center text-ink-soft font-semibold hidden sm:table-cell">{prod.timesPurchased}</td>
                            <td className="px-3 sm:px-4 py-3 text-right font-black text-ink whitespace-nowrap">S/ {prod.lastCost.toFixed(2)}</td>
                            <td className={`px-3 sm:px-4 py-3 text-right font-bold whitespace-nowrap ${trendColor}`}>
                              <i className={`fa-solid ${trendIcon} mr-1`}></i>
                              {prod.totalDelta >= 0 ? '+' : '−'}S/ {Math.abs(prod.totalDelta).toFixed(2)}
                              {prod.totalPct !== null && (
                                <span className="text-xs hidden sm:inline"> ({prod.totalPct >= 0 ? '+' : '−'}{Math.abs(prod.totalPct).toFixed(1)}%)</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Panel derecho: detalle del producto seleccionado */}
            <div className={`flex-col min-h-0 w-full lg:w-[420px] shrink-0 bg-surface-muted border-t lg:border-t-0 lg:border-l border-line ${selectedCostProduct ? 'flex' : 'hidden lg:flex'}`}>
              {!selectedCostProduct ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted p-6 text-center">
                  <i className="fa-solid fa-arrow-pointer text-2xl mb-2"></i>
                  <p className="text-sm">Selecciona un producto para ver su historial de compras.</p>
                </div>
              ) : (() => {
                const prod = selectedCostProduct;
                const up = prod.totalDelta > 0.0001;
                const down = prod.totalDelta < -0.0001;
                const trendColor = up ? 'text-danger' : down ? 'text-success' : 'text-muted';
                const trendBg = up ? 'bg-danger-soft border-danger/30' : down ? 'bg-success-soft border-success/30' : 'bg-surface-muted border-line';
                const trendIcon = up ? 'fa-arrow-trend-up' : down ? 'fa-arrow-trend-down' : 'fa-minus';
                return (
                  <>
                    <div className="p-4 border-b border-line bg-surface shrink-0">
                      <div className="flex items-start gap-2 rounded-lg">
                        <span className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0 mt-0.5">
                          <i className="fa-solid fa-tag text-xs"></i>
                        </span>
                        <div>
                          <h4 className="font-bold text-ink leading-tight">{prod.name}</h4>
                          <span className="font-mono text-xs text-muted">{prod.code}</span>
                        </div>

                        <button
                          onClick={() => setSelectedCostCode(null)}
                          className="ml-auto text-muted hover:text-brand shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center"
                          title="Cerrar detalle"
                        >
                          <i className="fa-solid fa-xmark text-lg"></i>
                        </button>
                      </div>
                      <div className="p-1 border-b border-line bg-surface shrink-0"></div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-surface-muted rounded-lg border border-line p-2">
                          <p className="text-muted font-bold uppercase text-[10px]">Costo Actual</p>
                          <p className="font-black text-ink text-sm">S/ {prod.lastCost.toFixed(2)}</p>
                        </div>
                        <div className={`rounded-lg border p-2 ${trendBg}`}>
                          <p className="text-muted font-bold uppercase text-[10px]">Variación Total</p>
                          <p className={`font-black text-sm ${trendColor}`}>
                            <i className={`fa-solid ${trendIcon} mr-1`}></i>
                            {prod.totalDelta >= 0 ? '+' : '−'}S/ {Math.abs(prod.totalDelta).toFixed(2)}
                            {prod.totalPct !== null && ` (${prod.totalPct >= 0 ? '+' : '−'}${Math.abs(prod.totalPct).toFixed(1)}%)`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                        <span>1ra: <strong className="text-ink-soft">S/ {prod.firstCost.toFixed(2)}</strong></span>
                        <span>Mín: <strong className="text-ink-soft">S/ {prod.minCost.toFixed(2)}</strong></span>
                        <span>Máx: <strong className="text-ink-soft">S/ {prod.maxCost.toFixed(2)}</strong></span>
                        <span>{prod.timesPurchased} compras</span>
                      </div>
                    </div>

                    {/* Lista de compras */}
                    <div className="flex-1 overflow-y-auto min-h-0 p-3">
                      <div className="flex flex-col gap-2">
                        {[...prod.purchases].reverse().map((p, i) => {
                          const pu = p.delta !== null && p.delta > 0.0001;
                          const pd = p.delta !== null && p.delta < -0.0001;
                          const cellColor = pu ? 'text-danger' : pd ? 'text-success' : 'text-muted';
                          const icon = pu ? 'fa-caret-up' : pd ? 'fa-caret-down' : 'fa-minus';
                          return (
                            <div key={i} className="bg-surface rounded-lg border border-line p-3">
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-muted">{p.date}</span>
                                <span className="font-black text-ink">S/ {p.unitCost.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center mt-1">
                                <span className="font-mono text-xs text-ink-soft">{p.numDoc}</span>
                                <span className={`text-xs font-bold ${cellColor}`}>
                                  {p.delta === null ? (
                                    <span className="text-muted">— base</span>
                                  ) : (
                                    <>
                                      <i className={`fa-solid ${icon} mr-1`}></i>
                                      {p.delta >= 0 ? '+' : '−'}S/ {Math.abs(p.delta).toFixed(2)}
                                      {p.pct !== null && ` (${p.pct >= 0 ? '+' : '−'}${Math.abs(p.pct).toFixed(1)}%)`}
                                    </>
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between items-center mt-1 text-xs text-muted">
                                <span>{p.provider}</span>
                                <span>Cant: <strong className="text-ink-soft">{p.quantity}</strong></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {showProveedorModal && (
        <SupplierFormModal onClose={() => setShowProveedorModal(false)} onSaved={handleSupplierSaved} />
      )}

      {showCompraModal && (
        <PurchaseFormModal
          proveedores={proveedores}
          productos={productos}
          onClose={() => setShowCompraModal(false)}
          onSaved={handlePurchaseSaved}
        />
      )}

      {selectedCompra && <PurchaseDetailModal compra={selectedCompra} onClose={() => setSelectedCompra(null)} />}
    </div>
  );
}
