import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { exportToExcel } from '../utils/excelExport.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';

export default function InventarioPage({ activeTab = 'inventory' }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = crear, id = editar
  const [viewMode, setViewMode] = useState(activeTab === 'categories' ? 'categories' : 'products');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todas');

  // Formulario nuevo producto
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('Unidad');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Ferretería general');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('10');
  const [price, setPrice] = useState('');
  const [searchingBarcode, setSearchingBarcode] = useState(false);
  const [errors, setErrors] = useState({});

  const clearError = (field) => setErrors(prev => ({ ...prev, [field]: '' }));

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

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  useEffect(() => {
    setViewMode(activeTab === 'categories' ? 'categories' : 'products');
  }, [activeTab]);

  const categoriesOptions = [
    'Ferretería general',
    'Herramientas',
    'Tornillería y fijaciones',
    'Electricidad',
    'Plomería',
    'Pinturas y acabados',
    'Adhesivos y selladores',
    'Cerrajería',
    'Seguridad',
    'Jardinería',
    'Accesorios y consumibles',
    'General',
  ];

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await api.get('/productos');
      setProducts(data);
    } catch (err) {
      alert('Error cargando inventario: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat =
      filterCategory === 'Todas' || (p.category || 'General') === filterCategory;
    return matchesSearch && matchesCat;
  });

  // Agrupar métricas por categoría
  const categoryStats = categoriesOptions.map(cat => {
    const prods = products.filter(p => (p.category || 'General') === cat);
    const totalStock = prods.reduce((sum, p) => sum + p.stock, 0);
    return {
      name: cat,
      count: prods.length,
      totalStock,
    };
  });

  const handleExportExcel = () => {
    const exportData = products.map(p => ({
      'Código': p.code,
      'Producto': p.name,
      'Categoría': p.category || 'General',
      'Unidad': p.unit,
      'Stock Real': p.stock,
      'Stock Mínimo': p.minStock || 10,
      'Precio (S/)': p.price,
      'Estado Stock': p.stock <= (p.minStock || 10) ? 'STOCK BAJO' : 'OK'
    }));
    exportToExcel(exportData, 'Inventario_Productos');
  };

  const resetForm = () => {
    setCode('');
    setName('');
    setCategory('Ferretería general');
    setStock('');
    setMinStock('10');
    setPrice('');
    setUnit('Unidad');
    setErrors({});
  };

  const openCreateModal = (presetCategory) => {
    resetForm();
    setEditingId(null);
    if (presetCategory) setCategory(presetCategory);
    setShowModal(true);
  };

  const openEditModal = (p) => {
    setEditingId(p.id);
    setErrors({});
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
    setEditingId(null);
    setErrors({});
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

  const handleSaveProduct = async () => {
    if (!validateProduct()) return;

    try {
      setLoading(true);
      if (editingId) {
        await api.put(`/productos/${editingId}`, {
          code: code.trim(),
          name: name.trim(),
          unit,
          category,
          minStock: parseInt(minStock) || 10,
          price: parseFloat(price),
        });
      } else {
        await api.post('/productos', {
          code: code.trim(),
          name: name.trim(),
          unit,
          category,
          stock: parseInt(stock),
          minStock: parseInt(minStock) || 10,
          price: parseFloat(price),
        });
      }
      closeModal();
      resetForm();
      await loadProducts();
      alert(editingId ? 'Producto actualizado correctamente.' : 'Producto registrado exitosamente.');
    } catch (err) {
      alert('Error guardando producto: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        {/* Header con Sub-pestañas */}
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => setViewMode('products')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
                  viewMode === 'products'
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <i className="fa-solid fa-box"></i> Lista de Productos
              </button>
              <button
                onClick={() => setViewMode('categories')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
                  viewMode === 'categories'
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <i className="fa-solid fa-tags"></i> Categorías ({categoriesOptions.length})
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {viewMode === 'products'
                ? 'Gestión de inventario con alertas de stock mínimo y exportación a Excel.'
                : 'Resumen y organización de productos por familias y categorías de ferretería.'}
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto justify-end">
            <button
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-file-excel"></i> Exportar Excel
            </button>
            <button
              onClick={() => openCreateModal()}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-plus"></i> Agregar Producto
            </button>
          </div>
        </div>

        {/* Vista 1: Lista de Productos */}
        {viewMode === 'products' && (
          <>
            {/* Filtros de Productos */}
            <div className="p-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative flex-1 w-full">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400 text-sm"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por código o nombre de producto..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:border-orange-500 text-sm"
                />
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Filtrar por Categoría:</label>
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  className="border border-gray-200 p-2 rounded-lg text-sm outline-none focus:border-orange-500 bg-white text-slate-700 font-medium"
                >
                  <option value="Todas">Todas las Categorías</option>
                  {categoriesOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabla de Productos */}
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-sm">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3">Unidad</th>
                    <th className="px-4 py-3">Stock Real</th>
                    <th className="px-4 py-3 text-center">Estado Alerta</th>
                    <th className="px-4 py-3">Precio</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center py-8 text-slate-400 font-medium">
                        No se encontraron productos en el inventario.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map(p => {
                      const isLowStock = p.stock <= (p.minStock || 10);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.code}</td>
                          <td className="px-4 py-3 font-bold text-slate-800">{p.name}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 font-medium">
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                              {p.category || 'General'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{p.unit}</td>
                          <td className={`px-4 py-3 font-bold ${isLowStock ? 'text-red-600' : 'text-slate-800'}`}>
                            {p.stock}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isLowStock ? (
                              <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold flex items-center justify-center gap-1 w-max mx-auto">
                                <i className="fa-solid fa-triangle-exclamation"></i> Stock Bajo (Mín: {p.minStock || 10})
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold">
                                Normal
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800">S/ {p.price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => openEditModal(p)}
                              className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2.5 py-1 rounded shadow-sm"
                              title="Editar producto"
                            >
                              <i className="fa-solid fa-pen-to-square mr-1"></i> Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Vista 2: Matriz / Gestión de Categorías */}
        {viewMode === 'categories' && (
          <div className="p-6 flex-1 bg-slate-50/50">
            <h4 className="font-bold text-slate-700 text-md mb-4 flex items-center gap-2">
              <i className="fa-solid fa-layer-group text-orange-500"></i> Familias y Categorías de Ferretería
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {categoryStats.map(stat => (
                <div
                  key={stat.name}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-sm">
                        <i className="fa-solid fa-tag"></i>
                      </span>
                      <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                        {stat.count} productos
                      </span>
                    </div>
                    <h5 className="font-bold text-slate-800 text-base">{stat.name}</h5>
                    <p className="text-xs text-slate-500 mt-1">
                      Stock Total Acumulado: <strong className="text-slate-700">{stat.totalStock} unidades</strong>
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                    <button
                      onClick={() => {
                        setFilterCategory(stat.name);
                        setViewMode('products');
                      }}
                      className="flex-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <i className="fa-solid fa-eye"></i> Ver Productos
                    </button>
                    <button
                      onClick={() => openCreateModal(stat.name)}
                      className="text-xs font-bold bg-orange-50 hover:bg-orange-100 text-orange-600 px-2.5 py-1.5 rounded-lg transition-colors"
                      title="Agregar producto a esta categoría"
                    >
                      <i className="fa-solid fa-plus"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal Nuevo Producto */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">
                <i className={`fa-solid ${editingId ? 'fa-pen-to-square' : 'fa-box-open'} mr-2`}></i>
                {editingId ? 'Editar Producto' : 'Nuevo Producto'}
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
                      onChange={e => { setCode(e.target.value); clearError('code'); }}
                      onKeyDown={e => e.key === 'Enter' && handleSearchBarcode()}
                      placeholder="Escanea aquí..."
                      className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.code)}`}
                    />
                    <button
                      onClick={handleSearchBarcode}
                      disabled={searchingBarcode || !!editingId}
                      className="bg-slate-200 text-slate-600 px-3 rounded hover:bg-slate-300 text-xs disabled:opacity-50"
                    >
                      <i className="fa-solid fa-magnifying-glass"></i>
                    </button>
                  </div>
                  <FieldError msg={errors.code} />
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
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Nombre del Producto</label>
                <input
                  type="text"
                  maxLength={120}
                  value={name}
                  onChange={e => { setName(e.target.value); clearError('name'); }}
                  placeholder={searchingBarcode ? "Buscando en internet..." : ""}
                  className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.name)}`}
                />
                <FieldError msg={errors.name} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Categoría</label>
                <select
                  value={category}
                  onChange={e => { setCategory(e.target.value); clearError('category'); }}
                  className={`w-full border p-2 rounded outline-none bg-white text-sm ${borderClass(errors.category)}`}
                >
                  {categoriesOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <FieldError msg={errors.category} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    {editingId ? 'Stock Actual' : 'Stock Inicial'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={stock}
                    disabled={!!editingId}
                    onChange={e => { setStock(e.target.value); clearError('stock'); }}
                    className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.stock)} ${editingId ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                  />
                  {editingId
                    ? <p className="text-[11px] text-slate-400 mt-1">Ajusta el stock desde el módulo Kardex.</p>
                    : <FieldError msg={errors.stock} />}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Stock Mínimo</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={minStock}
                    onChange={e => { setMinStock(e.target.value); clearError('minStock'); }}
                    className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.minStock)}`}
                  />
                  <FieldError msg={errors.minStock} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Precio (S/)</label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={price}
                    onChange={e => { setPrice(e.target.value); clearError('price'); }}
                    className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.price)}`}
                  />
                  <FieldError msg={errors.price} />
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 font-bold text-slate-600 bg-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSaveProduct} disabled={loading} className="px-4 py-2 font-bold text-white bg-orange-600 rounded-lg text-sm">
                {editingId ? 'Guardar Cambios' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
