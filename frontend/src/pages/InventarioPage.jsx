import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';
import { exportToExcel } from '../utils/excelExport.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';

export default function InventarioPage({ initialCategory = 'Todas', onNavigateToCategories }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modales de producto
  const [showModal, setShowModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);

  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState(initialCategory || 'Todas');

  // Campos formulario producto
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('Unidad');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Ferretería general');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('10');
  const [price, setPrice] = useState('');
  const [searchingBarcode, setSearchingBarcode] = useState(false);
  const [productErrors, setProductErrors] = useState({});

  useEffect(() => {
    if (initialCategory) {
      setFilterCategory(initialCategory);
    }
  }, [initialCategory]);

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await api.get('/productos');
      setProducts(data || []);
    } catch (err) {
      console.error('Error cargando productos:', err);
      alert('Error cargando inventario: ' + err.message);
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
    else if (!Number.isInteger(stockNum)) e.stock = 'El stock debe ser un número entero.';
    else if (stockNum < 0) e.stock = 'El stock no puede ser negativo.';

    const minNum = Number(minStock);
    if (minStock === '' || isNaN(minNum)) e.minStock = 'Ingrese el stock mínimo.';
    else if (!Number.isInteger(minNum)) e.minStock = 'Debe ser un número entero.';
    else if (minNum < 0) e.minStock = 'No puede ser negativo.';

    const priceNum = parseFloat(price);
    if (price === '' || isNaN(priceNum)) e.price = 'Ingrese el precio.';
    else if (priceNum <= 0) e.price = 'El precio debe ser mayor a 0.';
    else if (priceNum > 1000000) e.price = 'El precio es demasiado alto.';

    setProductErrors(e);
    return Object.keys(e).length === 0;
  };

  const resetForm = () => {
    setCode('');
    setName('');
    setCategory(categoryOptions[0] || 'General');
    setStock('');
    setMinStock('10');
    setPrice('');
    setUnit('Unidad');
    setProductErrors({});
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
    setCategory(p.category || 'General');
    setStock(String(p.stock));
    setMinStock(String(p.minStock ?? 10));
    setPrice(String(p.price));
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
          category,
          minStock: parseInt(minStock, 10) || 10,
          price: parseFloat(price),
        });
      } else {
        await api.post('/productos', {
          code: code.trim(),
          name: name.trim(),
          unit,
          category,
          stock: parseInt(stock, 10),
          minStock: parseInt(minStock, 10) || 10,
          price: parseFloat(price),
        });
      }
      closeModal();
      await loadProducts();
      await loadCategories();
      alert(editingProductId ? 'Producto actualizado correctamente.' : 'Producto registrado exitosamente.');
    } catch (err) {
      alert('Error guardando producto: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchBarcode = async () => {
    if (!code.trim()) return;
    try {
      setSearchingBarcode(true);
      const res = await api.get(`/productos/barcode/${code.trim()}`);
      if (res.foundInDb) {
        alert('Este producto ya existe en el inventario.');
        setName(res.product.name);
        setUnit(res.product.unit);
        setPrice(res.product.price);
        if (res.product.category) setCategory(res.product.category);
      } else if (res.name) {
        setName(res.name);
      }
    } catch (err) {
      alert('No se encontró el nombre del producto de forma automática. Ingrese el nombre manualmente.');
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        {/* Header de la Página */}
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <i className="fa-solid fa-box"></i> Almacén
              </span>
              <h3 className="font-bold text-slate-800 text-lg">Catálogo de Productos ({products.length})</h3>
            </div>
            <p className="text-xs text-slate-500">
              Control de existencias físicas, alertas de reposición de stock mínimo y exportación valorizada.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end items-center">
            {onNavigateToCategories && (
              <button
                onClick={onNavigateToCategories}
                className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
              >
                <i className="fa-solid fa-tags text-orange-600"></i> Gestionar Categorías
              </button>
            )}
            <button
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-file-excel"></i> Exportar Excel
            </button>
            <button
              onClick={openCreateModal}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-plus"></i> Agregar Producto
            </button>
          </div>
        </div>

        {/* Barra de Búsqueda y Filtros */}
        <div className="p-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400 text-sm"></i>
            <input
              type="text"
              placeholder="Buscar producto por nombre o código de barras..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto items-center">
            <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Categoría:</label>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 py-2 px-3 rounded-lg text-sm outline-none focus:border-orange-500 w-full md:w-56 font-medium"
            >
              <option value="Todas">Todas las categorías</option>
              {categoryOptions.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Resumen Superior de Filtro */}
        <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 flex flex-wrap justify-between items-center text-xs text-slate-500 gap-2">
          <div className="flex items-center gap-2">
            <span>Mostrando: <strong className="text-slate-800">{filteredProducts.length}</strong> de {products.length} productos</span>
            {filterCategory !== 'Todas' && (
              <button
                onClick={() => setFilterCategory('Todas')}
                className="text-orange-600 hover:underline font-semibold ml-2"
              >
                (Quitar filtro de categoría)
              </button>
            )}
          </div>
          <div>
            <span>Valorización mostrada: <strong className="text-emerald-700 font-bold">S/ {totalValuation.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong></span>
          </div>
        </div>

        {/* Tabla de Productos */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-center">Unidad</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Mínimo</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-8 text-slate-400">
                    <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando catálogo...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-8 text-slate-400">
                    No se encontraron productos en esta categoría o búsqueda.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const isLowStock = p.stock <= (p.minStock ?? 10);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{p.code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
                      <td className="px-4 py-3">
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs">
                          {p.category || 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500">{p.unit}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-700">{p.stock}</td>
                      <td className="px-4 py-3 text-right text-xs text-slate-400">{p.minStock ?? 10}</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-600">
                        S/ {parseFloat(p.price).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isLowStock ? (
                          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold flex items-center justify-center gap-1">
                            <i className="fa-solid fa-triangle-exclamation"></i> Bajo
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                            OK
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openEditModal(p)}
                          className="text-slate-500 hover:text-orange-600 p-1.5 rounded hover:bg-orange-50 transition-colors"
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
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">
                <i className={`fa-solid ${editingProductId ? 'fa-pen-to-square' : 'fa-box-open'} mr-2`}></i>
                {editingProductId ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              <button onClick={closeModal} className="text-slate-300 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Código (Escanear)</label>
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
                      onClick={handleSearchBarcode}
                      disabled={searchingBarcode || !!editingProductId}
                      className="bg-slate-200 text-slate-600 px-3 rounded hover:bg-slate-300 text-xs disabled:opacity-50"
                      title="Buscar código en internet"
                    >
                      <i className="fa-solid fa-magnifying-glass"></i>
                    </button>
                  </div>
                  <FieldError msg={productErrors.code} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Unidad</label>
                  <select
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 bg-white text-sm"
                  >
                    <option value="Unidad">Unidad</option>
                    <option value="Bolsa">Bolsa</option>
                    <option value="Metro">Metro</option>
                    <option value="Kilo">Kilo</option>
                    <option value="Galón">Galón</option>
                    <option value="Caja">Caja</option>
                    <option value="Paquete">Paquete</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Nombre del Producto</label>
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
                <label className="text-xs font-bold text-slate-500 mb-1 block">Categoría de Almacén</label>
                <select
                  value={category}
                  onChange={e => { setCategory(e.target.value); clearProductError('category'); }}
                  className={`w-full border p-2 rounded outline-none bg-white text-sm ${borderClass(productErrors.category)}`}
                >
                  {categoryOptions.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <FieldError msg={productErrors.category} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Stock {editingProductId ? 'Actual' : 'Inicial'}</label>
                  <input
                    type="number"
                    min="0"
                    disabled={!!editingProductId}
                    value={stock}
                    onChange={e => { setStock(e.target.value); clearProductError('stock'); }}
                    className={`w-full border p-2 rounded outline-none text-sm ${editingProductId ? 'bg-gray-100 cursor-not-allowed' : ''} ${borderClass(productErrors.stock)}`}
                  />
                  <FieldError msg={productErrors.stock} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Stock Mínimo</label>
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
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Precio (S/)</label>
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
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 font-bold text-slate-600 bg-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSaveProduct} disabled={loading} className="px-4 py-2 font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg text-sm shadow-sm transition-colors">
                {editingProductId ? 'Guardar Cambios' : 'Guardar Producto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
