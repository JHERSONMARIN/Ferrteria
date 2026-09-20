import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';
import { exportToExcel } from '../utils/excelExport.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import { quantityProblem, roundQuantity, formatQuantity } from '../utils/quantities.js';
import { useToast } from '../components/ui/index.js';

const COMMON_REASONS = {
  ENTRADA: [
    'Ajuste por Conteo Físico (Sobrante)',
    'Ingreso Extraordinario / Muestra',
    'Devolución de Cliente',
    'Otro motivo de ingreso',
  ],
  SALIDA: [
    'Ajuste por Conteo Físico (Faltante)',
    'Merma por Rotura o Deterioro',
    'Producto Vencido / No Apto',
    'Consumo o Uso Interno de Ferretería',
    'Devolución a Proveedor',
    'Otro motivo de salida',
  ],
};

export default function KardexPage({ currentUser }) {
  const aviso = useToast();
  const [kardexRecords, setKardexRecords] = useState([]);
  const [summary, setSummary] = useState({
    totalIn: 0,
    totalOut: 0,
    netBalance: 0,
    movementCount: 0,
  });
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [period, setPeriod] = useState('month'); // 'today' | 'week' | 'month' | 'all' | 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [filterType, setFilterType] = useState('TODOS'); // 'TODOS' | 'ENTRADA' | 'SALIDA'
  const [filterBranch, setFilterBranch] = useState('');
  const [branches, setBranches] = useState([]);
  // Con una sola sucursal no se muestra nada de sucursales.
  const multiBranch = branches.length > 1;

  // Modal Form
  const [showModal, setShowModal] = useState(false);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [type, setType] = useState('ENTRADA');
  const [reasonPreset, setReasonPreset] = useState(COMMON_REASONS.ENTRADA[0]);
  const [refDetail, setRefDetail] = useState('');
  const [qty, setQty] = useState('1');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    loadProducts();
    api.get('/sucursales').then(setBranches).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    loadKardex();
  }, [period, startDate, endDate, filterCode, filterType, filterBranch]);

  const loadProducts = async () => {
    try {
      const data = await api.get('/productos');
      setProducts(data || []);
    } catch (err) {
      console.error('Error cargando productos en Kardex:', err);
    }
  };

  const loadKardex = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('period', period);

      if (period === 'custom') {
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
      }

      if (filterCode) params.append('productCode', filterCode);
      if (filterType !== 'TODOS') params.append('type', filterType);
      if (filterBranch) params.append('branchId', filterBranch);

      const res = await api.get(`/kardex?${params.toString()}`);
      if (res && res.records) {
        setKardexRecords(res.records);
        setSummary(res.summary || { totalIn: 0, totalOut: 0, netBalance: 0, movementCount: 0 });
      } else if (Array.isArray(res)) {
        setKardexRecords(res);
      }
    } catch (err) {
      console.error('Error cargando Kardex:', err);
      aviso.error('Error cargando movimientos de Kardex: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearError = (field) => setErrors((prev) => ({ ...prev, [field]: '' }));

  const validateMovement = () => {
    const e = {};
    if (!selectedProdId) e.producto = 'Seleccione un producto.';

    const qtyNum = Number(qty);
    const prod = products.find((p) => String(p.id) === String(selectedProdId));
    const available = prod ? roundQuantity(prod.stock - (prod.reserved || 0)) : 0;
    if (qty === '' || isNaN(qtyNum)) e.qty = 'Ingrese la cantidad.';
    else if (prod && quantityProblem(qtyNum, prod.allowsFractions)) e.qty = `La cantidad ${quantityProblem(qtyNum, prod.allowsFractions)}.`;
    else if (type === 'SALIDA' && prod && qtyNum > available) {
      e.qty = `Stock insuficiente. Disponible: ${formatQuantity(available)}${prod.reserved > 0 ? ' (el resto está reservado para pedidos)' : ''}.`;
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleOpenManualModal = () => {
    if (products.length > 0) {
      setSelectedProdId(String(products[0].id));
    }
    setType('ENTRADA');
    setReasonPreset(COMMON_REASONS.ENTRADA[0]);
    setRefDetail('');
    setQty('1');
    setErrors({});
    setShowModal(true);
  };

  const handleTypeChange = (newType) => {
    setType(newType);
    setReasonPreset(COMMON_REASONS[newType][0]);
    clearError('qty');
  };

  const handleSaveMovement = async () => {
    if (!validateMovement()) return;

    try {
      setLoading(true);
      const fullRef = refDetail.trim()
        ? `${reasonPreset} - ${refDetail.trim()}`
        : reasonPreset;

      await api.post('/kardex', {
        productoId: selectedProdId,
        type,
        qty: Number(qty),
        ref: fullRef,
        usuarioId: currentUser?.id,
      });

      setShowModal(false);
      await loadKardex();
      await loadProducts();
      aviso.exito('Movimiento registrado correctamente.');
    } catch (err) {
      aviso.error('Error al registrar movimiento: ' + err.message);
    } finally {
      setLoading(false);
    }
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
              onClick={handleOpenManualModal}
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
              {[
                { id: 'today', label: 'Hoy' },
                { id: 'week', label: 'Esta Semana' },
                { id: 'month', label: 'Este Mes' },
                { id: 'all', label: 'Todo el Historial' },
                { id: 'custom', label: 'Personalizado' },
              ].map((btn) => (
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
                onChange={(e) => setFilterType(e.target.value)}
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
          <div className="flex items-center gap-2 pt-2 border-t border-line/60">
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

        {/* Tabla de Movimientos */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-muted text-muted text-xs uppercase sticky top-0 z-10 shadow-sm">
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
                  <td colSpan="8" className="px-4 py-8 text-center text-muted">
                    <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando movimientos de Kardex...
                  </td>
                </tr>
              ) : kardexRecords.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-muted">
                    No se encontraron movimientos registrados en este periodo o filtro.
                  </td>
                </tr>
              ) : (
                kardexRecords.map((k) => {
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
      </div>

      {/* Modal Ajuste Manual de Kardex */}
      {showModal && (
        <div className="fixed inset-0 bg-nav/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-nav text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <i className="fa-solid fa-boxes-packing text-brand"></i>
                Nuevo Movimiento de Kardex
              </h3>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {/* Producto */}
              <div>
                <label className="text-xs font-bold text-ink-soft mb-1 block">
                  Producto a Ajustar <span className="text-danger">*</span>
                </label>
                <select
                  value={selectedProdId}
                  onChange={(e) => {
                    setSelectedProdId(e.target.value);
                    clearError('producto');
                    clearError('qty');
                  }}
                  className={`w-full border p-2.5 rounded-lg outline-none bg-surface text-sm ${borderClass(
                    errors.producto
                  )}`}
                >
                  <option value="">-- Seleccionar producto --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stock Actual: {p.stock} {p.unit})
                    </option>
                  ))}
                </select>
                <FieldError msg={errors.producto} />
              </div>

              {/* Tipo y Cantidad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-ink-soft mb-1 block">Tipo de Flujo</label>
                  <select
                    value={type}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full border border-line p-2.5 rounded-lg outline-none focus:border-brand bg-surface text-sm font-semibold"
                  >
                    <option value="ENTRADA">🟢 Ingreso (+)</option>
                    <option value="SALIDA">🔴 Salida / Baja (-)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-ink-soft mb-1 block">
                    Cantidad <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={qty}
                    onChange={(e) => {
                      setQty(e.target.value);
                      clearError('qty');
                    }}
                    className={`w-full border p-2.5 rounded-lg outline-none text-sm font-bold ${borderClass(
                      errors.qty
                    )}`}
                  />
                  <FieldError msg={errors.qty} />
                </div>
              </div>

              {/* Motivo Predefinido */}
              <div>
                <label className="text-xs font-bold text-ink-soft mb-1 block">Motivo de la Operación</label>
                <select
                  value={reasonPreset}
                  onChange={(e) => setReasonPreset(e.target.value)}
                  className="w-full border border-line p-2.5 rounded-lg outline-none focus:border-brand bg-surface text-sm"
                >
                  {(COMMON_REASONS[type] || []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Detalle Opcional */}
              <div>
                <label className="text-xs font-bold text-ink-soft mb-1 block">
                  Documento de Referencia / Detalle Adicional
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={refDetail}
                  onChange={(e) => setRefDetail(e.target.value)}
                  placeholder="Ej. Acta de merma #402 / Conteo físico mensual"
                  className="w-full border border-line p-2.5 rounded-lg outline-none text-sm focus:border-brand"
                />
              </div>
            </div>

            <div className="p-4 bg-surface-muted border-t flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 font-bold text-ink-soft bg-surface-muted hover:bg-line rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveMovement}
                disabled={loading}
                className="px-4 py-2 font-bold text-brand-contrast bg-brand hover:bg-brand-strong rounded-lg text-sm shadow-sm transition-colors flex items-center gap-2"
              >
                <i className="fa-solid fa-check"></i>
                {loading ? 'Procesando...' : 'Registrar Movimiento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
