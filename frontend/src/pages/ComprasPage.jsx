import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import { quantityProblem, roundQuantity } from '../utils/quantities.js';

export default function ComprasPage() {
  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('historial'); // 'historial' | 'costos'

  // Modales
  const [showCompraModal, setShowCompraModal] = useState(false);
  const [showProveedorModal, setShowProveedorModal] = useState(false);
  const [selectedCompra, setSelectedCompra] = useState(null); // Detalle de compra del historial

  // Histórico de variación de costos: buscador + producto seleccionado (panel derecho)
  const [costSearch, setCostSearch] = useState('');
  const [selectedCostCode, setSelectedCostCode] = useState(null);

  const IGV_RATE = 0.18;

  // Form Proveedor
  const [provRuc, setProvRuc] = useState('');
  const [provName, setProvName] = useState('');
  const [provPhone, setProvPhone] = useState('');
  const [provAddress, setProvAddress] = useState('');

  // Form Compra
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [numDoc, setNumDoc] = useState('');
  const [productInput, setProductInput] = useState('');
  const [productQty, setProductQty] = useState('1');
  const [productCost, setProductCost] = useState('');
  const [compraCart, setCompraCart] = useState([]);

  // Errores de validación
  const [provErrors, setProvErrors] = useState({});
  const [compraErrors, setCompraErrors] = useState({});
  const [itemErrors, setItemErrors] = useState({});

  const clearProvError = (f) => setProvErrors(p => ({ ...p, [f]: '' }));
  const clearCompraError = (f) => setCompraErrors(p => ({ ...p, [f]: '' }));
  const clearItemError = (f) => setItemErrors(p => ({ ...p, [f]: '' }));

  const validateProveedor = () => {
    const e = {};
    if (!provRuc.trim()) e.ruc = 'El RUC es obligatorio.';
    else if (!/^\d{11}$/.test(provRuc.trim())) e.ruc = 'El RUC debe tener exactamente 11 dígitos.';

    if (!provName.trim()) e.name = 'La razón social / nombre es obligatoria.';
    else if (provName.trim().length < 3) e.name = 'Debe tener al menos 3 caracteres.';

    if (provPhone.trim() && !/^\+?\d[\d\s-]{5,14}$/.test(provPhone.trim()))
      e.phone = 'Teléfono inválido (6 a 15 dígitos).';

    setProvErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateCompra = () => {
    const e = {};
    if (!selectedProveedorId) e.proveedor = 'Seleccione un proveedor.';
    if (!numDoc.trim()) e.numDoc = 'Ingrese el N° de factura / guía.';
    else if (numDoc.trim().length < 3) e.numDoc = 'El número de documento es demasiado corto.';
    if (compraCart.length === 0) e.cart = 'Agregue al menos un producto a la compra.';
    setCompraErrors(e);
    return Object.keys(e).length === 0;
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [comprasData, provsData, prodsData] = await Promise.all([
        api.get('/compras'),
        api.get('/proveedores'),
        api.get('/productos')
      ]);
      setCompras(comprasData);
      setProveedores(provsData);
      setProductos(prodsData);
    } catch (err) {
      alert('Error cargando datos de compras: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProveedor = async () => {
    if (!validateProveedor()) return;

    try {
      setLoading(true);
      await api.post('/proveedores', {
        ruc: provRuc.trim(),
        name: provName.trim(),
        phone: provPhone.trim(),
        address: provAddress.trim(),
      });

      setShowProveedorModal(false);
      setProvErrors({});
      setProvRuc('');
      setProvName('');
      setProvPhone('');
      setProvAddress('');
      await loadInitialData();
      alert('Proveedor guardado con éxito.');
    } catch (err) {
      alert('Error guardando proveedor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCompraModal = () => {
    if (proveedores.length > 0) {
      setSelectedProveedorId(proveedores[0].id.toString());
    }
    setNumDoc('');
    setProductInput('');
    setProductQty('1');
    setProductCost('');
    setCompraCart([]);
    setProvErrors({});
    setCompraErrors({});
    setItemErrors({});
    setShowCompraModal(true);
  };

  const handleAddCompraItem = () => {
    const e = {};
    const qty = Number(productQty);
    const cost = parseFloat(productCost);

    if (!productInput.trim()) e.product = 'Seleccione un producto.';
    if (productCost === '' || isNaN(cost)) e.cost = 'Ingrese el costo unitario.';
    else if (cost < 0) e.cost = 'El costo no puede ser negativo.';

    const prod = !e.product && (
      productos.find(p => `${p.code} - ${p.name}` === productInput.trim()) ||
      productos.find(p => p.code === productInput.trim() || p.name.toLowerCase().includes(productInput.trim().toLowerCase()))
    );
    if (!e.product && !prod) e.product = 'Producto no encontrado en el catálogo.';

    // Enteros, o hasta 3 decimales si el producto se vende fraccionado (metros, kilos).
    if (productQty === '' || isNaN(qty)) e.qty = 'Ingrese la cantidad.';
    else if (prod && quantityProblem(qty, prod.allowsFractions)) e.qty = `La cantidad ${quantityProblem(qty, prod.allowsFractions)}.`;

    setItemErrors(e);
    if (Object.keys(e).length > 0) return;

    setCompraErrors(p => ({ ...p, cart: '' }));
    setCompraCart(prev => {
      const exist = prev.find(item => item.id === prod.id);
      if (exist) {
        return prev.map(item => item.id === prod.id ? { ...item, qty: roundQuantity(item.qty + qty), cost } : item);
      }
      return [...prev, { id: prod.id, name: prod.name, code: prod.code, qty, cost }];
    });

    setProductInput('');
    setProductQty('1');
    setProductCost('');
  };

  const handleRemoveCompraItem = (id) => {
    setCompraCart(prev => prev.filter(i => i.id !== id));
  };

  const handleSaveCompra = async () => {
    if (!validateCompra()) return;

    try {
      setLoading(true);
      await api.post('/compras', {
        proveedorId: selectedProveedorId,
        numDoc: numDoc.trim(),
        items: compraCart
      });

      setShowCompraModal(false);
      await loadInitialData();
      alert('¡Compra registrada exitosamente! El stock del inventario y el Kardex han sido actualizados.');
    } catch (err) {
      alert('Error registrando compra: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const compraTotal = compraCart.reduce((acc, i) => acc + (i.qty * i.cost), 0);

  // Histórico de Variación de Costos: agrupa las compras por producto en orden
  // cronológico y calcula la variación del costo unitario frente a la compra anterior.
  const comprasAsc = [...compras].sort((a, b) => a.id - b.id);
  const costVariationMap = new Map();
  comprasAsc.forEach(c => {
    c.detalles.forEach(d => {
      const key = d.producto.code;
      if (!costVariationMap.has(key)) {
        costVariationMap.set(key, { code: key, name: d.producto.name, purchases: [] });
      }
      costVariationMap.get(key).purchases.push({
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
      const prev = i > 0 ? g.purchases[i - 1].unitCost : null;
      const delta = prev !== null ? p.unitCost - prev : null;
      const pct = prev ? (delta / prev) * 100 : null;
      return { ...p, delta, pct };
    });
    const costs = purchases.map(p => p.unitCost);
    const firstCost = costs[0];
    const lastCost = costs[costs.length - 1];
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

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-ink">Módulo de Compras a Proveedores</h2>
          <p className="text-xs text-muted">Ingreso de facturas/guías de proveedores, control de stock e histórico de variación de precios de compra.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowProveedorModal(true)}
            className="bg-info hover:brightness-95 text-white font-bold py-2 px-4 rounded-lg shadow text-sm transition-colors"
          >
            <i className="fa-solid fa-truck-field mr-2"></i>Nuevo Proveedor
          </button>
          <button
            onClick={handleOpenCompraModal}
            className="bg-brand hover:bg-brand-strong text-brand-contrast font-bold py-2 px-4 rounded-lg shadow text-sm transition-colors"
          >
            <i className="fa-solid fa-cart-flatbed mr-2"></i>Registrar Compra
          </button>
        </div>
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-line bg-surface-muted flex justify-between items-center">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('historial')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'historial' ? 'bg-nav text-white shadow' : 'bg-surface text-ink-soft border'}`}
            >
              <i className="fa-solid fa-receipt mr-1.5"></i> Historial de Compras
            </button>
            <button
              onClick={() => setViewMode('costos')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'costos' ? 'bg-nav text-white shadow' : 'bg-surface text-ink-soft border'}`}
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
                    <td colSpan="5" className="px-4 py-6 text-center text-muted">
                      No hay compras de mercadería registradas.
                    </td>
                  </tr>
                ) : (
                  compras.map(c => (
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

      {/* Modal Nuevo Proveedor */}
      {showProveedorModal && (
        <div className="fixed inset-0 bg-nav/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-nav text-white flex justify-between items-center">
              <h3 className="font-bold text-lg"><i className="fa-solid fa-truck-field mr-2"></i> Registrar Proveedor</h3>
              <button onClick={() => setShowProveedorModal(false)} className="text-muted hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">RUC del Proveedor</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  value={provRuc}
                  onChange={e => { setProvRuc(e.target.value.replace(/\D/g, '')); clearProvError('ruc'); }}
                  className={`w-full border p-2 rounded outline-none text-sm ${borderClass(provErrors.ruc)}`}
                />
                <FieldError msg={provErrors.ruc} />
              </div>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Razón Social / Nombre</label>
                <input
                  type="text"
                  maxLength={120}
                  value={provName}
                  onChange={e => { setProvName(e.target.value); clearProvError('name'); }}
                  className={`w-full border p-2 rounded outline-none text-sm ${borderClass(provErrors.name)}`}
                />
                <FieldError msg={provErrors.name} />
              </div>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Teléfono</label>
                <input
                  type="text"
                  inputMode="tel"
                  maxLength={15}
                  value={provPhone}
                  onChange={e => { setProvPhone(e.target.value); clearProvError('phone'); }}
                  className={`w-full border p-2 rounded outline-none text-sm ${borderClass(provErrors.phone)}`}
                />
                <FieldError msg={provErrors.phone} />
              </div>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Dirección</label>
                <input
                  type="text"
                  maxLength={200}
                  value={provAddress}
                  onChange={e => setProvAddress(e.target.value)}
                  className="w-full border border-line p-2 rounded outline-none focus:border-brand text-sm"
                />
              </div>
            </div>
            <div className="p-4 bg-surface-muted border-t flex justify-end gap-3">
              <button onClick={() => setShowProveedorModal(false)} className="px-4 py-2 font-bold text-ink-soft bg-surface-muted rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSaveProveedor} disabled={loading} className="px-4 py-2 font-bold text-white bg-info rounded-lg text-sm">Guardar Proveedor</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Compra */}
      {showCompraModal && (
        <div className="fixed inset-0 bg-nav/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-nav text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg"><i className="fa-solid fa-cart-flatbed mr-2"></i> Registrar Entrada de Mercadería</h3>
              <button onClick={() => setShowCompraModal(false)} className="text-muted hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-4 bg-surface-muted border-b border-line grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Proveedor</label>
                <select
                  value={selectedProveedorId}
                  onChange={e => { setSelectedProveedorId(e.target.value); clearCompraError('proveedor'); }}
                  className={`w-full border p-2 rounded outline-none bg-surface text-sm ${borderClass(compraErrors.proveedor)}`}
                >
                  <option value="">-- Seleccionar proveedor --</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (RUC: {p.ruc})</option>
                  ))}
                </select>
                <FieldError msg={compraErrors.proveedor} />
              </div>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">N° Factura / Guía de Remisión</label>
                <input
                  type="text"
                  maxLength={30}
                  value={numDoc}
                  onChange={e => { setNumDoc(e.target.value); clearCompraError('numDoc'); }}
                  placeholder="Ej: F001-000458"
                  className={`w-full border p-2 rounded outline-none text-sm font-medium ${borderClass(compraErrors.numDoc)}`}
                />
                <FieldError msg={compraErrors.numDoc} />
              </div>
            </div>

            <div className="p-4 border-b border-line shrink-0 bg-surface">
              <div className="flex gap-2 items-start">
                <div className="flex-1 relative">
                  <input
                    list="compra-prod-list"
                    value={productInput}
                    onChange={e => { setProductInput(e.target.value); clearItemError('product'); }}
                    placeholder="Buscar producto..."
                    className={`w-full px-3 py-2 border rounded outline-none bg-surface text-sm ${borderClass(itemErrors.product)}`}
                  />
                  <datalist id="compra-prod-list">
                    {productos.map(p => (
                      <option key={p.id} value={`${p.code} - ${p.name}`} />
                    ))}
                  </datalist>
                  <FieldError msg={itemErrors.product} />
                </div>
                <div>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={productQty}
                    onChange={e => { setProductQty(e.target.value); clearItemError('qty'); }}
                    placeholder="Cant."
                    className={`w-20 border p-2 rounded outline-none text-sm ${borderClass(itemErrors.qty)}`}
                  />
                  <FieldError msg={itemErrors.qty} />
                </div>
                <div>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={productCost}
                    onChange={e => { setProductCost(e.target.value); clearItemError('cost'); }}
                    placeholder="Costo S/"
                    className={`w-24 border p-2 rounded outline-none text-sm ${borderClass(itemErrors.cost)}`}
                  />
                  <FieldError msg={itemErrors.cost} />
                </div>
                <button
                  onClick={handleAddCompraItem}
                  className="bg-nav text-white font-bold px-4 py-2 rounded shadow hover:bg-nav-strong text-sm h-[38px]"
                >
                  Agregar
                </button>
              </div>
              <FieldError msg={compraErrors.cart} />
            </div>

            <div className="flex-1 overflow-auto p-4 bg-surface-muted">
              <table className="w-full text-left border-collapse bg-surface shadow-sm rounded-lg overflow-hidden">
                <thead className="bg-surface-muted text-muted text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Cant.</th>
                    <th className="px-3 py-2 text-right">Costo U.</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    <th className="px-3 py-2">Acción</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-line">
                  {compraCart.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                      <td className="px-3 py-2 font-semibold">{item.name}</td>
                      <td className="px-3 py-2 font-bold">{item.qty}</td>
                      <td className="px-3 py-2 text-right">S/ {item.cost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-bold">S/ {(item.qty * item.cost).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => handleRemoveCompraItem(item.id)} className="text-danger hover:text-danger">
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-surface border-t flex justify-between items-center shrink-0">
              <div className="text-ink font-bold text-lg">
                TOTAL COMPRA: <span className="text-2xl font-black text-brand">S/ {compraTotal.toFixed(2)}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCompraModal(false)} className="px-4 py-2 font-bold text-ink-soft bg-surface-muted rounded-lg text-sm">Cancelar</button>
                <button onClick={handleSaveCompra} disabled={loading || compraCart.length === 0} className="px-6 py-2 font-bold text-brand-contrast bg-brand rounded-lg shadow-md text-sm">
                  Registrar Compra
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle de Compra */}
      {selectedCompra && (() => {
        const totalConIgv = selectedCompra.total || 0;
        const baseImponible = totalConIgv / (1 + IGV_RATE);
        const igv = totalConIgv - baseImponible;
        return (
          <div className="fixed inset-0 bg-nav/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
            <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-4 bg-nav text-white flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-bold text-lg"><i className="fa-solid fa-file-invoice-dollar mr-2"></i> Detalle de Compra</h3>
                  <p className="text-muted text-xs mt-0.5">
                    {selectedCompra.numDoc} · {selectedCompra.provider}
                    <span className="text-muted"> ({selectedCompra.providerRuc})</span> · {selectedCompra.date}
                  </p>
                </div>
                <button onClick={() => setSelectedCompra(null)} className="text-muted hover:text-white">
                  <i className="fa-solid fa-xmark text-xl"></i>
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 bg-surface-muted">
                <table className="w-full text-left border-collapse bg-surface shadow-sm rounded-lg overflow-hidden">
                  <thead className="bg-surface-muted text-muted text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">Costo Unit. (S/)</th>
                      <th className="px-3 py-2 text-right">Subtotal (S/)</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-line">
                    {selectedCompra.detalles.map((d, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono text-xs">{d.producto.code}</td>
                        <td className="px-3 py-2 font-semibold text-ink">{d.producto.name}</td>
                        <td className="px-3 py-2 text-right font-bold">{d.quantity}</td>
                        <td className="px-3 py-2 text-right">S/ {d.unitPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-bold text-ink">S/ {d.subtotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-surface border-t shrink-0">
                <div className="ml-auto w-full max-w-xs text-sm">
                  <div className="flex justify-between py-1 text-ink-soft">
                    <span>Op. Gravada:</span>
                    <span className="font-semibold">S/ {baseImponible.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-ink-soft">
                    <span>IGV (18%):</span>
                    <span className="font-semibold">S/ {igv.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t mt-1 text-ink font-black text-lg">
                    <span>Total:</span>
                    <span className="text-brand">S/ {totalConIgv.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
