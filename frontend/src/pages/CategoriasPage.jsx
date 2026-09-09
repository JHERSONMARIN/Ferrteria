import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';

// Paleta de colores temáticos para categorías
const COLOR_CLASSES = {
  orange: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  red: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', badge: 'bg-slate-200 text-slate-800' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-800' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', badge: 'bg-gray-200 text-gray-800' },
};

const AVAILABLE_ICONS = [
  'fa-hammer', 'fa-wrench', 'fa-screwdriver', 'fa-bolt', 'fa-faucet-drip',
  'fa-paint-roller', 'fa-bottle-droplet', 'fa-key', 'fa-shield-halved',
  'fa-seedling', 'fa-boxes-packing', 'fa-tag', 'fa-layer-group', 'fa-toolbox',
  'fa-ruler-combined', 'fa-hard-hat'
];

const AVAILABLE_COLORS = [
  'orange', 'blue', 'emerald', 'cyan', 'purple', 'amber', 'red', 'indigo', 'slate', 'yellow'
];

export default function CategoriasPage({ onSelectCategory, onNavigateToProducts }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modales de categoría
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDesc, setCategoryDesc] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('fa-tag');
  const [categoryColor, setCategoryColor] = useState('orange');
  const [categoryError, setCategoryError] = useState('');

  // Modal eliminar categoría con reasignación
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(null);
  const [reassignCategoryId, setReassignCategoryId] = useState('');
  const [deletingCategory, setDeletingCategory] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await api.get('/categorias');
      setCategories(data || []);
    } catch (err) {
      console.error('Error cargando categorías desde API:', err);
      alert('Error cargando familias y categorías: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar tarjetas en vivo
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  }, [categories, searchQuery]);

  // Métricas consolidadas
  const totalValuation = useMemo(() => {
    return categories.reduce((acc, c) => acc + (c.inventoryValue || 0), 0);
  }, [categories]);

  const totalProducts = useMemo(() => {
    return categories.reduce((acc, c) => acc + (c.productCount || 0), 0);
  }, [categories]);

  const totalLowStock = useMemo(() => {
    return categories.reduce((acc, c) => acc + (c.lowStockCount || 0), 0);
  }, [categories]);

  // Modal Crear / Editar
  const openCreateModal = () => {
    setEditingCategory(null);
    setCategoryName('');
    setCategoryDesc('');
    setCategoryIcon('fa-tag');
    setCategoryColor('orange');
    setCategoryError('');
    setShowCategoryModal(true);
  };

  const openEditModal = (cat) => {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setCategoryDesc(cat.description || '');
    setCategoryIcon(cat.icon || 'fa-tag');
    setCategoryColor(cat.color || 'orange');
    setCategoryError('');
    setShowCategoryModal(true);
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategory(null);
    setCategoryName('');
    setCategoryDesc('');
    setCategoryError('');
  };

  const handleSaveCategory = async (e) => {
    if (e) e.preventDefault();
    const trimmed = categoryName.trim();
    if (!trimmed) {
      setCategoryError('El nombre de la categoría es obligatorio.');
      return;
    }
    if (trimmed.length < 2) {
      setCategoryError('El nombre debe tener al menos 2 caracteres.');
      return;
    }

    try {
      if (editingCategory) {
        await api.put(`/categorias/${editingCategory.id}`, {
          name: trimmed,
          description: categoryDesc.trim(),
          icon: categoryIcon,
          color: categoryColor,
        });
      } else {
        await api.post('/categorias', {
          name: trimmed,
          description: categoryDesc.trim(),
          icon: categoryIcon,
          color: categoryColor,
        });
      }
      closeCategoryModal();
      await loadCategories();
      alert(editingCategory ? 'Categoría actualizada exitosamente.' : 'Categoría creada exitosamente.');
    } catch (err) {
      setCategoryError(err.message || 'Error al guardar la categoría.');
    }
  };

  // Modal Eliminar con Reasignación
  const openDeleteModal = (cat) => {
    setDeleteCategoryTarget(cat);
    const otherCats = categories.filter(c => c.id !== cat.id);
    setReassignCategoryId(otherCats.length > 0 ? String(otherCats[0].id) : '');
  };

  const closeDeleteModal = () => {
    setDeleteCategoryTarget(null);
    setReassignCategoryId('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteCategoryTarget) return;

    try {
      setDeletingCategory(true);
      let queryParam = '';
      if (deleteCategoryTarget.productCount > 0) {
        if (!reassignCategoryId) {
          alert('Debe seleccionar una categoría de destino para reasignar los productos.');
          return;
        }
        queryParam = `?targetCategoryId=${reassignCategoryId}`;
      }

      await api.delete(`/categorias/${deleteCategoryTarget.id}${queryParam}`);
      closeDeleteModal();
      await loadCategories();
      alert('Categoría eliminada exitosamente.');
    } catch (err) {
      alert('Error al eliminar categoría: ' + err.message);
    } finally {
      setDeletingCategory(false);
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
                <i className="fa-solid fa-tags"></i> Almacén
              </span>
              <h3 className="font-bold text-slate-800 text-lg">Familias y Categorías ({categories.length})</h3>
            </div>
            <p className="text-xs text-slate-500">
              Organización centralizada de productos por familias comerciales, valorización de capital y control de rotación.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end items-center">
            {onNavigateToProducts && (
              <button
                onClick={onNavigateToProducts}
                className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
              >
                <i className="fa-solid fa-boxes-stacked text-orange-600"></i> Ver Catálogo Completo
              </button>
            )}
            <button
              onClick={openCreateModal}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-plus"></i> Nueva Categoría
            </button>
          </div>
        </div>

        {/* Panel de Filtros y Resumen Financiero */}
        <div className="flex-1 bg-slate-50/50 flex flex-col gap-5">
          <div className="bg-white p-4 border-b border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 w-full">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400 text-sm"></i>
              <input
                type="text"
                placeholder="Buscar familia o categoría por nombre o descripción..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-lg">
                <i className="fa-solid fa-boxes-stacked text-orange-500"></i>
                <span>Total Productos: <strong className="text-slate-900 font-bold">{totalProducts}</strong></span>
              </div>
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-2 rounded-lg border border-emerald-100">
                <i className="fa-solid fa-coins text-emerald-600"></i>
                <span>Inversión Total: <strong className="text-emerald-950 font-bold">S/ {totalValuation.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong></span>
              </div>
              {totalLowStock > 0 && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-100">
                  <i className="fa-solid fa-triangle-exclamation text-red-500"></i>
                  <span>Stock Crítico: <strong>{totalLowStock}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Grid de Tarjetas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {loading && categories.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-400">
                <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando familias y categorías...
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="col-span-full text-center py-12 bg-white rounded-xl border border-gray-200 text-slate-400">
                <i className="fa-solid fa-tags text-4xl mb-2 text-slate-300"></i>
                <p>No se encontraron categorías con el término ingresado.</p>
              </div>
            ) : (
              filteredCategories.map(cat => {
                const style = COLOR_CLASSES[cat.color] || COLOR_CLASSES.orange;
                return (
                  <div
                    key={cat.id}
                    className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Cabecera: Icono y Botones */}
                      <div className="flex justify-between items-start mb-2">
                        <span className={`w-10 h-10 rounded-xl ${style.bg} ${style.text} flex items-center justify-center font-bold text-base shadow-sm border ${style.border}`}>
                          <i className={`fa-solid ${cat.icon || 'fa-tag'}`}></i>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(cat)}
                            className="text-slate-400 hover:text-orange-600 p-1.5 rounded hover:bg-slate-100 transition-colors"
                            title="Editar categoría"
                          >
                            <i className="fa-solid fa-pen text-xs"></i>
                          </button>
                          <button
                            onClick={() => openDeleteModal(cat)}
                            className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-slate-100 transition-colors"
                            title="Eliminar categoría"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      </div>

                      <h5 className="font-bold text-slate-800 text-base leading-tight">{cat.name}</h5>
                      {cat.description && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{cat.description}</p>
                      )}

                      {/* Métricas */}
                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-xs text-slate-500">
                        <div className="flex justify-between items-center">
                          <span>Productos:</span>
                          <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-[11px]">
                            {cat.productCount} {cat.productCount === 1 ? 'ítem' : 'ítems'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Stock físico:</span>
                          <strong className="text-slate-700">{cat.totalStock} unidades</strong>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Inversión en almacén:</span>
                          <strong className="text-emerald-700 font-bold">
                            S/ {cat.inventoryValue.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>
                        {cat.lowStockCount > 0 && (
                          <div className="mt-1 bg-red-50 text-red-600 px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 border border-red-100">
                            <i className="fa-solid fa-triangle-exclamation text-xs"></i>
                            {cat.lowStockCount} {cat.lowStockCount === 1 ? 'ítem en stock bajo' : 'ítems en stock bajo'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Acción: Ver Catálogo */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => onSelectCategory && onSelectCategory(cat.name)}
                        className="w-full text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        <i className="fa-solid fa-eye"></i> Ver Catálogo ({cat.productCount})
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* MODAL: CREAR / EDITAR CATEGORÍA */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <i className="fa-solid fa-tags text-orange-400"></i>
                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
              </h3>
              <button onClick={closeCategoryModal} className="text-slate-400 hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleSaveCategory}>
              <div className="p-6 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">
                    Nombre de la Familia / Categoría <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    autoFocus
                    maxLength={60}
                    value={categoryName}
                    onChange={e => {
                      setCategoryName(e.target.value);
                      if (categoryError) setCategoryError('');
                    }}
                    placeholder="Ej. Grifería y Gasfitería..."
                    className={`w-full border p-2.5 rounded-lg outline-none text-sm transition-all focus:border-orange-500 ${borderClass(categoryError)}`}
                  />
                  <FieldError msg={categoryError} />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">
                    Descripción corta (opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={categoryDesc}
                    onChange={e => setCategoryDesc(e.target.value)}
                    placeholder="Ej. Tuberías, codos, llaves y sellos de paso"
                    className="w-full border border-gray-300 p-2.5 rounded-lg outline-none text-sm focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                    Icono Representativo
                  </label>
                  <div className="grid grid-cols-8 gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg max-h-32 overflow-y-auto">
                    {AVAILABLE_ICONS.map(icon => (
                      <button
                        type="button"
                        key={icon}
                        onClick={() => setCategoryIcon(icon)}
                        className={`h-9 rounded-lg flex items-center justify-center transition-all ${
                          categoryIcon === icon
                            ? 'bg-orange-600 text-white shadow-sm scale-105'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                        title={icon}
                      >
                        <i className={`fa-solid ${icon}`}></i>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                    Color Temático
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_COLORS.map(color => {
                      const colorStyle = COLOR_CLASSES[color] || COLOR_CLASSES.orange;
                      const isSelected = categoryColor === color;
                      return (
                        <button
                          type="button"
                          key={color}
                          onClick={() => setCategoryColor(color)}
                          className={`px-3 py-1 rounded-full text-xs font-bold capitalize transition-all border flex items-center gap-1.5 ${
                            isSelected
                              ? `${colorStyle.badge} ring-2 ring-orange-500 font-extrabold shadow-sm`
                              : `${colorStyle.bg} ${colorStyle.text} ${colorStyle.border} opacity-75 hover:opacity-100`
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${colorStyle.badge}`}></span>
                          {color}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCategoryModal}
                  className="px-4 py-2 font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg text-sm shadow-sm transition-colors flex items-center gap-2"
                >
                  <i className="fa-solid fa-check"></i>
                  {editingCategory ? 'Guardar Cambios' : 'Crear Categoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ELIMINAR CATEGORÍA CON REASIGNACIÓN */}
      {deleteCategoryTarget && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-red-600 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation"></i>
                Eliminar Categoría
              </h3>
              <button onClick={closeDeleteModal} className="text-red-100 hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 text-slate-700 text-sm">
              <p>
                ¿Está seguro de que desea eliminar la categoría{' '}
                <strong className="text-slate-900">{deleteCategoryTarget.name}</strong>?
              </p>

              {deleteCategoryTarget.productCount > 0 ? (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-amber-800 text-xs flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-bold">
                    <i className="fa-solid fa-circle-exclamation text-amber-600 text-sm"></i>
                    Esta categoría contiene {deleteCategoryTarget.productCount} producto(s) asignado(s).
                  </div>
                  <p>
                    Para no perder la organización de los productos, seleccione a qué categoría desea reasignarlos antes de continuar:
                  </p>
                  <div>
                    <label className="font-bold block mb-1">Categoría Destino:</label>
                    <select
                      value={reassignCategoryId}
                      onChange={e => setReassignCategoryId(e.target.value)}
                      className="w-full bg-white border border-amber-300 p-2 rounded outline-none font-medium text-slate-800"
                    >
                      {categories
                        .filter(c => c.id !== deleteCategoryTarget.id)
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.productCount} productos)
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Esta categoría no contiene productos asignados. Se eliminará de forma inmediata.
                </p>
              )}
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
                disabled={deletingCategory}
                onClick={handleConfirmDelete}
                className="px-4 py-2 font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg text-sm shadow-sm transition-colors flex items-center gap-2"
              >
                {deletingCategory ? (
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
