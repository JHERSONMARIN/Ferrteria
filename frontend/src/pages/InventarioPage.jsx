import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';
import { exportToExcel } from '../utils/excelExport.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import { quantityProblem, formatQuantity, FRACTIONAL_UNITS } from '../utils/quantities.js';
import { useToast, EmptyState, SkeletonTable } from '../components/ui/index.js';
import BarcodeScannerModal from '../components/BarcodeScannerModal.jsx';
import SaleUnitsEditor, { toSaleUnitRow, toSaleUnitPayload, validateSaleUnits } from '../components/SaleUnitsEditor.jsx';

export default function InventarioPage({ initialCategory = 'Todas', initialSearch = '', onNavigateToCategories, currentUser }) {
  const aviso = useToast();
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  // Con una sola sucursal no se muestra nada de sucursales.
  const multiBranch = branches.length > 1;
  const branchName = (id) => branches.find(b => b.id === id)?.name ?? `Sucursal ${id}`;
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modales de producto
  const [showModal, setShowModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);

  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [filterCategory, setFilterCategory] = useState(initialCategory || 'Todas');

  // Campos formulario producto
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('Unidad');
  const [allowsFractions, setAllowsFractions] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Ferretería general');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('10');
  const [price, setPrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [searchingBarcode, setSearchingBarcode] = useState(false);
  const [productErrors, setProductErrors] = useState({});
  const [saleUnits, setSaleUnits] = useState([]);
  const [saleUnitErrors, setSaleUnitErrors] = useState({});
  // Escáner abierto: guarda a qué campo va el código leído.
  const [scanTarget, setScanTarget] = useState(null);

  useEffect(() => {
    if (initialSearch) setSearchQuery(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (initialCategory) {
      setFilterCategory(initialCategory);
    }
  }, [initialCategory]);

  useEffect(() => {
    loadProducts();
    loadCategories();
    api.get('/sucursales').then(setBranches).catch(() => setBranches([]));
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await api.get('/productos');
      setProducts(data || []);
    } catch (err) {
      console.error('Error cargando productos:', err);
      aviso.error('Error cargando inventario: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await api.get('/categorias');
      setCategories(data || []);
    } catch (err) {
      console.error('Error cargando categorías:', err);
    }
  };

  // Nombres únicos de categorías
  const categoryOptions = useMemo(() => {
    const fromApi = categories.map(c => c.name);
    const fromProducts = products.map(p => p.category).filter(Boolean);
    return Array.from(new Set([...fromApi, ...fromProducts, 'General']));
  }, [categories, products]);

  // Filtrado de productos
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat =
        filterCategory === 'Todas' || (p.category || 'General') === filterCategory;
      return matchesSearch && matchesCat;
    });
  }, [products, searchQuery, filterCategory]);

  // Métricas rápidas
  const totalValuation = useMemo(() => {
    return filteredProducts.reduce((acc, p) => acc + ((p.stock || 0) * (p.price || 0)), 0);
  }, [filteredProducts]);

  const clearProductError = (field) => setProductErrors(prev => ({ ...prev, [field]: '' }));

  const validateProduct = () => {
    const e = {};
    if (!code.trim()) e.code = 'El código es obligatorio.';
    else if (code.trim().length < 2) e.code = 'El código debe tener al menos 2 caracteres.';

    if (!name.trim()) e.name = 'El nombre del producto es obligatorio.';
    else if (name.trim().length < 2) e.name = 'El nombre debe tener al menos 2 caracteres.';

    if (!category) e.category = 'Seleccione una categoría.';

    const stockNum = Number(stock);
    if (stock === '' || isNaN(stockNum)) e.stock = 'Ingrese el stock inicial.';
    else if (stockNum < 0) e.stock = 'El stock no puede ser negativo.';
    else if (stockNum > 0 && quantityProblem(stockNum, allowsFractions)) e.stock = `El stock ${quantityProblem(stockNum, allowsFractions)}.`;

    const minNum = Number(minStock);
    if (minStock === '' || isNaN(minNum)) e.minStock = 'Ingrese el stock mínimo.';
    else if (minNum < 0) e.minStock = 'No puede ser negativo.';
    else if (minNum > 0 && quantityProblem(minNum, allowsFractions)) e.minStock = `El mínimo ${quantityProblem(minNum, allowsFractions)}.`;

    const priceNum = parseFloat(price);
    if (price === '' || isNaN(priceNum)) e.price = 'Ingrese el precio.';
    else if (priceNum <= 0) e.price = 'El precio debe ser mayor a 0.';
    else if (priceNum > 1000000) e.price = 'El precio es demasiado alto.';

    const wholesaleNum = parseFloat(wholesalePrice);
    if (wholesalePrice !== '' && (isNaN(wholesaleNum) || wholesaleNum <= 0)) e.wholesalePrice = 'Debe ser mayor a 0 (o dejarlo vacío).';

    const unitErrors = validateSaleUnits(saleUnits, unit, code);
    setSaleUnitErrors(unitErrors);
    setProductErrors(e);
    return Object.keys(e).length === 0 && Object.keys(unitErrors).length === 0;
  };

  const resetForm = () => {
    setCode('');
    setName('');
    setCategory(categoryOptions[0] || 'General');
    setStock('');
    setMinStock('10');
    setPrice('');
    setWholesalePrice('');
    setUnit('Unidad');
    setAllowsFractions(false);
    setProductErrors({});
    setSaleUnits([]);
    setSaleUnitErrors({});
    setEditingProductId(null);
  };

  const openCreateModal = () => {
    resetForm();
    if (filterCategory !== 'Todas') {
      setCategory(filterCategory);
    }
    setShowModal(true);
  };

  const openEditModal = (p) => {
    setEditingProductId(p.id);
    setProductErrors({});
    setCode(p.code);
    setName(p.name);
    setUnit(p.unit || 'Unidad');
    setAllowsFractions(Boolean(p.allowsFractions));
    setCategory(p.category || 'General');
    setStock(String(p.stock));
    setMinStock(String(p.minStock ?? 10));
    setPrice(String(p.price));
    setWholesalePrice(p.wholesalePrice != null ? String(p.wholesalePrice) : '');
    setSaleUnits((p.saleUnits || []).map(toSaleUnitRow));
    setSaleUnitErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSaveProduct = async () => {
    if (!validateProduct()) return;

    try {
      setLoading(true);
      if (editingProductId) {
        await api.put(`/productos/${editingProductId}`, {
          code: code.trim(),
          name: name.trim(),
          unit,
          allowsFractions,
          category,
          minStock: Number(minStock),
          price: parseFloat(price),
          wholesalePrice: wholesalePrice === '' ? null : parseFloat(wholesalePrice),
          saleUnits: saleUnits.map(toSaleUnitPayload),
        });
      } else {
        await api.post('/productos', {
          code: code.trim(),
          name: name.trim(),
          unit,
          allowsFractions,
          category,
          stock: Number(stock),
          minStock: Number(minStock),
          price: parseFloat(price),
          wholesalePrice: wholesalePrice === '' ? null : parseFloat(wholesalePrice),
          saleUnits: saleUnits.map(toSaleUnitPayload),
          usuarioId: currentUser?.id,
        });
      }
      closeModal();
      await loadProducts();
      await loadCategories();
      aviso.exito(editingProductId ? 'Producto actualizado correctamente.' : 'Producto registrado exitosamente.');
    } catch (err) {
      aviso.error('Error guardando producto: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchBarcode = async (scanned) => {
    const barcode = (typeof scanned === 'string' ? scanned : code).trim();
    if (!barcode) return;
    try {
      setSearchingBarcode(true);
      const res = await api.get(`/productos/barcode/${encodeURIComponent(barcode)}`);
      if (res.foundInDb) {
        aviso.exito('Este producto ya existe en el inventario.');
        setName(res.product.name);
        setUnit(res.product.unit);
        setPrice(res.product.price);
        if (res.product.category) setCategory(res.product.category);
      } else if (res.name) {
        setName(res.name);
      }
    } catch (err) {
      aviso.error('No se encontró el nombre del producto de forma automática. Ingrese el nombre manualmente.');
    } finally {
      setSearchingBarcode(false);
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredProducts.map(p => ({
      'Código': p.code,
      'Producto': p.name,
      'Categoría': p.category || 'General',
      'Unidad': p.unit,
      'Stock Real': p.stock,
      'Stock Mínimo': p.minStock || 10,
      'Precio (S/)': p.price,
      'Valor Total (S/)': Number(((p.stock || 0) * (p.price || 0)).toFixed(2)),
      'Estado Stock': p.stock <= (p.minStock || 10) ? 'STOCK BAJO' : 'OK'
    }));
    exportToExcel(exportData, 'Inventario_Productos');
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        {/* Header de la Página */}
        <div className="p-4 border-b border-line flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-muted">
          <div>
            <p className="text-sm font-bold text-ink">{products.length} producto{products.length === 1 ? '' : 's'} en el catálogo</p>
            <p className="text-xs text-muted">
              Existencias, alertas de stock mínimo y valorización del almacén.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end items-center">
            {onNavigateToCategories && (
              <button
                onClick={onNavigateToCategories}
                className="bg-surface border border-line hover:bg-surface-muted text-ink-soft px-3 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <i className="fa-solid fa-tags"></i> Categorías
              </button>
            )}
            <button
              onClick={handleExportExcel}
              className="bg-surface border border-line hover:bg-surface-muted text-ink-soft px-3 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-file-excel"></i> Exportar
            </button>
            <button
              onClick={openCreateModal}
              className="bg-brand hover:bg-brand-strong text-brand-contrast px-4 py-2 rounded-xl text-sm font-semibold shadow-card transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-plus"></i> Agregar producto
            </button>
          </div>
        </div>

        {/* Barra de Búsqueda y Filtros */}
        <div className="p-4 border-b border-line bg-surface flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-muted text-sm"></i>
            <input
              type="text"
              placeholder="Buscar producto por nombre o código de barras..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface-muted border border-line rounded-lg text-sm outline-none focus:border-brand transition-colors"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto items-center">
            <label className="text-xs font-bold text-muted whitespace-nowrap">Categoría:</label>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="bg-surface-muted border border-line text-ink-soft py-2 px-3 rounded-lg text-sm outline-none focus:border-brand w-full md:w-56 font-medium"
            >
              <option value="Todas">Todas las categorías</option>
              {categoryOptions.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Resumen Superior de Filtro */}
        <div className="px-4 py-2 bg-surface-muted/70 border-b border-line flex flex-wrap justify-between items-center text-xs text-muted gap-2">
          <div className="flex items-center gap-2">
            <span>Mostrando: <strong className="text-ink">{filteredProducts.length}</strong> de {products.length} productos</span>
            {filterCategory !== 'Todas' && (
              <button
                onClick={() => setFilterCategory('Todas')}
                className="text-brand hover:underline font-semibold ml-2"
              >
                (Quitar filtro de categoría)
              </button>
            )}
          </div>
          <div>
            <span>Valorización mostrada: <strong className="text-success font-bold">S/ {totalValuation.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong></span>
          </div>
        </div>

        {/* Tabla de Productos */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-muted text-muted text-xs uppercase sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-center">Unidad</th>
                <th className="px-4 py-3 text-right">{multiBranch ? 'Stock (mi sucursal)' : 'Stock'}</th>
                <th className="px-4 py-3 text-right">Mínimo</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-line">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-0"><SkeletonTable rows={8} columns={5} /></td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-0">
                    {products.length === 0 ? (
                      <EmptyState
                        icon="fa-box"
                        title="Todavía no hay productos"
                        description="Cargue su catálogo para empezar a vender y a controlar el stock."
                        action={<button onClick={openCreateModal} className="bg-brand hover:bg-brand-strong text-brand-contrast px-4 py-2 rounded-xl text-sm font-semibold">Agregar el primero</button>}
                      />
                    ) : (
                      <EmptyState
                        icon="fa-magnifying-glass"
                        title="Ningún producto coincide"
                        description="Pruebe con otro texto o quite el filtro de categoría."
                      />
                    )}
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const isLowStock = p.stock <= (p.minStock ?? 10);
                  return (
                    <tr key={p.id} className="hover:bg-surface-muted transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-ink-soft">{p.code}</td>
                      <td className="px-4 py-3 font-semibold text-ink">{p.name}</td>
                      <td className="px-4 py-3">
                        <span className="bg-surface-muted text-ink-soft px-2 py-0.5 rounded text-xs">
                          {p.category || 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-muted">
                        {p.unit}
                        {p.saleUnits?.length > 0 && (
                          <span
                            className="block text-[10px] text-brand-text font-semibold cursor-help"
                            title={p.saleUnits.map(u => `${u.name} (${formatQuantity(u.factor)} ${p.unit.toLowerCase()}): S/ ${u.price.toFixed(2)}`).join('\n')}
                          >
                            +{p.saleUnits.length} presentación{p.saleUnits.length === 1 ? '' : 'es'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-ink-soft">
                        {formatQuantity(p.stock)}
                        {multiBranch && (
                          <span
                            className="block text-[10px] font-normal text-muted cursor-help"
                            title={(p.branches || []).map(b => `${branchName(b.branchId)}: ${formatQuantity(b.stock)}`).join('\n')}
                          >
                            Empresa: {formatQuantity(p.totalStock ?? p.stock)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted">{formatQuantity(p.minStock ?? 10)}</td>
                      <td className="px-4 py-3 text-right font-bold text-ink tabular-nums">
                        S/ {parseFloat(p.price).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isLowStock ? (
                          <span className="bg-danger-soft text-danger px-2 py-0.5 rounded-full text-xs font-bold flex items-center justify-center gap-1">
                            <i className="fa-solid fa-triangle-exclamation"></i> Bajo
                          </span>
                        ) : (
                          <span className="bg-success-soft text-success px-2 py-0.5 rounded-full text-xs font-semibold">
                            OK
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openEditModal(p)}
                          className="text-muted hover:text-brand p-1.5 rounded hover:bg-brand-soft transition-colors"
                          title="Editar producto"
                        >
                          <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo / Editar Producto */}
      {showModal && (
        <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 bg-panel text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg">
                <i className={`fa-solid ${editingProductId ? 'fa-pen-to-square' : 'fa-box-open'} mr-2`}></i>
                {editingProductId ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              <button onClick={closeModal} className="text-muted hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted mb-1 block">Código (Escanear)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={40}
                      value={code}
                      onChange={e => { setCode(e.target.value); clearProductError('code'); }}
                      onKeyDown={e => e.key === 'Enter' && handleSearchBarcode()}
                      placeholder="Escanea aquí..."
                      className={`w-full border p-2 rounded outline-none text-sm ${borderClass(productErrors.code)}`}
                    />
                    <button
                      type="button"
                      onClick={() => setScanTarget(() => (scanned) => {
                        setCode(scanned);
                        clearProductError('code');
                        if (!editingProductId) handleSearchBarcode(scanned);
                      })}
                      className="bg-brand-soft text-brand-text px-3 rounded hover:brightness-95 text-xs"
                      title="Escanear el código de barras con la cámara o el lector"
                    >
                      <i className="fa-solid fa-barcode"></i>
                    </button>
                    <button
                      onClick={handleSearchBarcode}
                      disabled={searchingBarcode || !!editingProductId}
                      className="bg-surface-muted text-ink-soft px-3 rounded hover:bg-line text-xs disabled:opacity-50"
                      title="Buscar código en internet"
                    >
                      <i className="fa-solid fa-magnifying-glass"></i>
                    </button>
                  </div>
                  <FieldError msg={productErrors.code} />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted mb-1 block">Unidad</label>
                  <select
                    value={unit}
                    onChange={e => {
                      setUnit(e.target.value);
                      if (FRACTIONAL_UNITS.includes(e.target.value)) setAllowsFractions(true);
                    }}
                    className="w-full border border-line p-2 rounded outline-none focus:border-brand bg-surface text-sm"
                  >
                    <option value="Unidad">Unidad</option>
                    <option value="Bolsa">Bolsa</option>
                    <option value="Metro">Metro</option>
                    <option value="Kilo">Kilo</option>
                    <option value="Galón">Galón</option>
                    <option value="Litro">Litro</option>
                    <option value="Caja">Caja</option>
                    <option value="Paquete">Paquete</option>
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer bg-surface-muted border border-line rounded-lg px-3 py-2">
                <input
                  type="checkbox"
                  checked={allowsFractions}
                  onChange={e => { setAllowsFractions(e.target.checked); clearProductError('stock'); clearProductError('minStock'); }}
                  className="accent-orange-600 w-4 h-4 mt-0.5"
                />
                <span>
                  <span className="font-semibold">Se vende fraccionado</span>
                  <span className="block text-xs text-muted">Permite vender cantidades con decimales, por ejemplo 2.5 metros o 0.750 kilos.</span>
                </span>
              </label>

              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Nombre del Producto</label>
                <input
                  type="text"
                  maxLength={120}
                  value={name}
                  onChange={e => { setName(e.target.value); clearProductError('name'); }}
                  placeholder={searchingBarcode ? "Buscando en internet..." : "Ej. Cemento Sol 42.5kg"}
                  className={`w-full border p-2 rounded outline-none text-sm ${borderClass(productErrors.name)}`}
                />
                <FieldError msg={productErrors.name} />
              </div>

              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Categoría de Almacén</label>
                <select
                  value={category}
                  onChange={e => { setCategory(e.target.value); clearProductError('category'); }}
                  className={`w-full border p-2 rounded outline-none bg-surface text-sm ${borderClass(productErrors.category)}`}
                >
                  {categoryOptions.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <FieldError msg={productErrors.category} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-bold text-muted mb-1 block">Stock {editingProductId ? 'Actual' : 'Inicial'}</label>
                  <input
                    type="number"
                    min="0"
                    disabled={!!editingProductId}
                    value={stock}
                    onChange={e => { setStock(e.target.value); clearProductError('stock'); }}
                    className={`w-full border p-2 rounded outline-none text-sm ${editingProductId ? 'bg-surface-muted cursor-not-allowed' : ''} ${borderClass(productErrors.stock)}`}
                  />
                  <FieldError msg={productErrors.stock} />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted mb-1 block">Stock Mínimo</label>
                  <input
                    type="number"
                    min="0"
                    value={minStock}
                    onChange={e => { setMinStock(e.target.value); clearProductError('minStock'); }}
                    className={`w-full border p-2 rounded outline-none text-sm ${borderClass(productErrors.minStock)}`}
                  />
                  <FieldError msg={productErrors.minStock} />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted mb-1 block">Precio (S/)</label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={price}
                    onChange={e => { setPrice(e.target.value); clearProductError('price'); }}
                    className={`w-full border p-2 rounded outline-none text-sm ${borderClass(productErrors.price)}`}
                  />
                  <FieldError msg={productErrors.price} />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted mb-1 block">Precio mayorista (opcional)</label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={wholesalePrice}
                    onChange={e => { setWholesalePrice(e.target.value); clearProductError('wholesalePrice'); }}
                    placeholder="Igual al normal"
                    className={`w-full border p-2 rounded outline-none text-sm ${borderClass(productErrors.wholesalePrice)}`}
                  />
                  <FieldError msg={productErrors.wholesalePrice} />
                </div>
              </div>

              <SaleUnitsEditor
                rows={saleUnits}
                onChange={rows => { setSaleUnits(rows); setSaleUnitErrors({}); }}
                baseUnit={unit}
                basePrice={price}
                errors={saleUnitErrors}
                onScan={apply => setScanTarget(() => apply)}
              />
            </div>
            <div className="p-4 bg-surface-muted border-t flex justify-end gap-3 shrink-0">
              <button onClick={closeModal} className="px-4 py-2 font-bold text-ink-soft bg-surface-muted rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSaveProduct} disabled={loading} className="px-4 py-2 font-bold text-brand-contrast bg-brand hover:bg-brand-strong rounded-lg text-sm shadow-sm transition-colors">
                {editingProductId ? 'Guardar Cambios' : 'Guardar Producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BarcodeScannerModal
        open={Boolean(scanTarget)}
        onClose={() => setScanTarget(null)}
        onDetected={code => scanTarget?.(code)}
      />
    </div>
  );
}
