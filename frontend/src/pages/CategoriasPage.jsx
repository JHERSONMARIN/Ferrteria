import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import { useToast } from '../components/ui/index.js';

// Paleta de colores temáticos para categorías
const COLOR_CLASSES = {
  orange: { bg: 'bg-brand-soft', text: 'text-brand', border: 'border-brand/30', badge: 'bg-brand-soft text-brand-text' },
  blue: { bg: 'bg-info-soft', text: 'text-info', border: 'border-info/30', badge: 'bg-info-soft text-info' },
  emerald: { bg: 'bg-success-soft', text: 'text-success', border: 'border-success/30', badge: 'bg-success-soft text-success' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700' },
  purple: { bg: 'bg-info-soft', text: 'text-info', border: 'border-info/30', badge: 'bg-info-soft text-info' },
  amber: { bg: 'bg-warning-soft', text: 'text-warning', border: 'border-warning/30', badge: 'bg-warning-soft text-warning' },
  red: { bg: 'bg-danger-soft', text: 'text-danger', border: 'border-danger/30', badge: 'bg-danger-soft text-danger' },
  indigo: { bg: 'bg-info-soft', text: 'text-info', border: 'border-info/30', badge: 'bg-info-soft text-info' },
  slate: { bg: 'bg-surface-muted', text: 'text-ink-soft', border: 'border-line', badge: 'bg-surface-muted text-ink' },
  yellow: { bg: 'bg-warning-soft', text: 'text-warning', border: 'border-warning/30', badge: 'bg-warning-soft text-warning' },
  gray: { bg: 'bg-surface-muted', text: 'text-ink-soft', border: 'border-line', badge: 'bg-surface-muted text-ink' },
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
  const aviso = useToast();
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
      aviso.error('Error cargando categorías: ' + err.message);
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
      aviso.exito(editingCategory ? 'Categoría actualizada exitosamente.' : 'Categoría creada exitosamente.');
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
          aviso.exito('Debe seleccionar una categoría de destino para reasignar los productos.');
          return;
        }
        queryParam = `?targetCategoryId=${reassignCategoryId}`;
      }

      await api.delete(`/categorias/${deleteCategoryTarget.id}${queryParam}`);
      closeDeleteModal();
      await loadCategories();
      aviso.exito('Categoría eliminada exitosamente.');
    } catch (err) {
      aviso.error('Error al eliminar categoría: ' + err.message);
    } finally {
      setDeletingCategory(false);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        {/* Encabezado Principal */}
        <div className="p-4 border-b border-line flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-muted">
          <div>
            <p className="text-sm font-bold text-ink">{categories.length} categoría{categories.length === 1 ? '' : 's'}</p>
            <p className="text-xs text-muted">
              Cómo se agrupan los productos, con su capital invertido y su rotación.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end items-center">
            {onNavigateToProducts && (
              <button
                onClick={onNavigateToProducts}
                className="bg-surface border border-line hover:bg-surface-muted text-ink-soft px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
              >
                <i className="fa-solid fa-boxes-stacked text-brand"></i> Ver Catálogo Completo
              </button>
            )}
            <button
              onClick={openCreateModal}
              className="bg-brand hover:bg-brand-strong text-brand-contrast px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-plus"></i> Nueva Categoría
            </button>
          </div>
        </div>

        {/* Panel de Filtros y Resumen Financiero */}
        <div className="flex-1 bg-surface-muted/50 flex flex-col gap-5">
          <div className="bg-surface p-4 border-b border-line flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 w-full">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-muted text-sm"></i>
              <input
                type="text"
                placeholder="Buscar categoría por nombre o descripción..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-surface-muted border border-line rounded-lg text-sm outline-none focus:border-brand transition-colors"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-ink-soft">
              <div className="flex items-center gap-2 bg-surface-muted px-3 py-2 rounded-lg">
                <i className="fa-solid fa-boxes-stacked text-brand"></i>
                <span>Total Productos: <strong className="text-ink font-bold">{totalProducts}</strong></span>
              </div>
              <div className="flex items-center gap-2 bg-success-soft text-success px-3 py-2 rounded-lg border border-success/20">
                <i className="fa-solid fa-coins text-success"></i>
                <span>Inversión Total: <strong className="text-success font-bold">S/ {totalValuation.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong></span>
              </div>
              {totalLowStock > 0 && (
                <div className="flex items-center gap-2 bg-danger-soft text-danger px-3 py-2 rounded-lg border border-danger/20">
                  <i className="fa-solid fa-triangle-exclamation text-danger"></i>
                  <span>Stock Crítico: <strong>{totalLowStock}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Grid de Tarjetas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {loading && categories.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted">
                <i className="fa-solid fa-spinner fa-spin mr-2"></i> Cargando Categorías...
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="col-span-full text-center py-12 bg-surface rounded-xl border border-line text-muted">
                <i className="fa-solid fa-tags text-4xl mb-2 text-muted"></i>
                <p>No se encontraron categorías con el término ingresado.</p>
              </div>
            ) : (
              filteredCategories.map(cat => {
                const style = COLOR_CLASSES[cat.color] || COLOR_CLASSES.orange;
                return (
                  <div
                    key={cat.id}
                    className="bg-surface border border-line rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
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
                            className="text-muted hover:text-brand p-1.5 rounded hover:bg-surface-muted transition-colors"
                            title="Editar categoría"
                          >
                            <i className="fa-solid fa-pen text-xs"></i>
                          </button>
                          <button
                            onClick={() => openDeleteModal(cat)}
                            className="text-muted hover:text-danger p-1.5 rounded hover:bg-surface-muted transition-colors"
                            title="Eliminar categoría"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      </div>

                      <h5 className="font-bold text-ink text-base leading-tight">{cat.name}</h5>
                      {cat.description && (
                        <p className="text-xs text-muted mt-0.5 line-clamp-1">{cat.description}</p>
                      )}

                      {/* Métricas */}
                      <div className="mt-3 pt-3 border-t border-line flex flex-col gap-1.5 text-xs text-muted">
                        <div className="flex justify-between items-center">
                          <span>Productos:</span>
                          <span className="font-bold text-ink-soft bg-surface-muted px-2 py-0.5 rounded-full text-[11px]">
                            {cat.productCount} {cat.productCount === 1 ? 'ítem' : 'ítems'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Stock físico:</span>
                          <strong className="text-ink-soft">{cat.totalStock} unidades</strong>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Inversión en almacén:</span>
                          <strong className="text-success font-bold">
                            S/ {cat.inventoryValue.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>
                        {cat.lowStockCount > 0 && (
                          <div className="mt-1 bg-danger-soft text-danger px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 border border-danger/20">
                            <i className="fa-solid fa-triangle-exclamation text-xs"></i>
                            {cat.lowStockCount} {cat.lowStockCount === 1 ? 'ítem en stock bajo' : 'ítems en stock bajo'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Acción: Ver Catálogo */}
                    <div className="mt-4 pt-3 border-t border-line">
                      <button
                        onClick={() => onSelectCategory && onSelectCategory(cat.name)}
                        className="w-full text-xs font-bold bg-surface-muted hover:bg-surface-muted text-ink-soft py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
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
        <div className="fixed inset-0 bg-nav/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-nav text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <i className="fa-solid fa-tags text-brand"></i>
                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
              </h3>
              <button onClick={closeCategoryModal} className="text-muted hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleSaveCategory}>
              <div className="p-6 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-ink-soft mb-1 block">
                    Nombre de la Categoría <span className="text-danger">*</span>
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
                    className={`w-full border p-2.5 rounded-lg outline-none text-sm transition-all focus:border-brand ${borderClass(categoryError)}`}
                  />
                  <FieldError msg={categoryError} />
                </div>

                <div>
                  <label className="text-xs font-bold text-ink-soft mb-1 block">
                    Descripción corta (opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={categoryDesc}
                    onChange={e => setCategoryDesc(e.target.value)}
                    placeholder="Ej. Tuberías, codos, llaves y sellos de paso"
                    className="w-full border border-line p-2.5 rounded-lg outline-none text-sm focus:border-brand"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-ink-soft mb-1.5 block">
                    Icono Representativo
                  </label>
                  <div className="grid grid-cols-8 gap-2 p-2 bg-surface-muted border border-line rounded-lg max-h-32 overflow-y-auto">
                    {AVAILABLE_ICONS.map(icon => (
                      <button
                        type="button"
                        key={icon}
                        onClick={() => setCategoryIcon(icon)}
                        className={`h-9 rounded-lg flex items-center justify-center transition-all ${
                          categoryIcon === icon
                            ? 'bg-brand text-brand-contrast shadow-sm scale-105'
                            : 'bg-surface text-ink-soft border border-line hover:bg-surface-muted'
                        }`}
                        title={icon}
                      >
                        <i className={`fa-solid ${icon}`}></i>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-ink-soft mb-1.5 block">
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
                              ? `${colorStyle.badge} ring-2 ring-brand font-extrabold shadow-sm`
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

              <div className="p-4 bg-surface-muted border-t border-line flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCategoryModal}
                  className="px-4 py-2 font-bold text-ink-soft bg-surface-muted hover:bg-line rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-brand-contrast bg-brand hover:bg-brand-strong rounded-lg text-sm shadow-sm transition-colors flex items-center gap-2"
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
        <div className="fixed inset-0 bg-nav/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-danger text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation"></i>
                Eliminar Categoría
              </h3>
              <button onClick={closeDeleteModal} className="text-danger-soft hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 text-ink-soft text-sm">
              <p>
                ¿Está seguro de que desea eliminar la categoría{' '}
                <strong className="text-ink">{deleteCategoryTarget.name}</strong>?
              </p>

              {deleteCategoryTarget.productCount > 0 ? (
                <div className="bg-warning-soft border border-warning/30 p-3 rounded-lg text-warning text-xs flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-bold">
                    <i className="fa-solid fa-circle-exclamation text-warning text-sm"></i>
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
                      className="w-full bg-surface border border-warning/40 p-2 rounded outline-none font-medium text-ink"
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
                <p className="text-xs text-muted">
                  Esta categoría no contiene productos asignados. Se eliminará de forma inmediata.
                </p>
              )}
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
                disabled={deletingCategory}
                onClick={handleConfirmDelete}
                className="px-4 py-2 font-bold text-white bg-danger hover:brightness-95 rounded-lg text-sm shadow-sm transition-colors flex items-center gap-2"
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
