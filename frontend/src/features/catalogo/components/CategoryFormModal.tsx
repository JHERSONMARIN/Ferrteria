// Formulario de una categoría nueva o existente: nombre, descripción, ícono y color.
import { useState, type FormEvent } from 'react';
import type { Category, CreateCategoryRequest, UpdateCategoryRequest } from '@ferresys/contracts/catalog';
import { api } from '../../../api/client.ts';
import FieldError from '../../../shared/ui/FieldError.tsx';
import { borderClass } from '../../../shared/utils/validators.ts';
import { AVAILABLE_COLORS, AVAILABLE_ICONS, colorOf } from '../categoryStyles.ts';

interface Props {
  /** La categoría a editar; null = una nueva. */
  category: Category | null;
  onClose: () => void;
  /** Se guardó: el mensaje para el aviso. */
  onSaved: (message: string) => void;
}

export default function CategoryFormModal({ category: editingCategory, onClose, onSaved }: Props) {
  const [categoryName, setCategoryName] = useState(editingCategory?.name ?? '');
  const [categoryDesc, setCategoryDesc] = useState(editingCategory?.description ?? '');
  const [categoryIcon, setCategoryIcon] = useState(editingCategory?.icon || 'fa-tag');
  const [categoryColor, setCategoryColor] = useState(editingCategory?.color || 'orange');
  const [categoryError, setCategoryError] = useState('');

  const handleSaveCategory = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = categoryName.trim();
    if (!trimmed) {
      setCategoryError('El nombre de la categoría es obligatorio.');
      return;
    }
    if (trimmed.length < 2) {
      setCategoryError('El nombre debe tener al menos 2 caracteres.');
      return;
    }

    const payload = { name: trimmed, description: categoryDesc.trim(), icon: categoryIcon, color: categoryColor };
    try {
      if (editingCategory) await api.put<Category>(`/categorias/${editingCategory.id}`, payload satisfies UpdateCategoryRequest);
      else await api.post<Category>('/categorias', payload satisfies CreateCategoryRequest);
      onSaved(editingCategory ? 'Categoría actualizada exitosamente.' : 'Categoría creada exitosamente.');
    } catch (err) {
      setCategoryError((err as Error).message || 'Error al guardar la categoría.');
    }
  };

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 bg-panel text-white flex justify-between items-center">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <i className="fa-solid fa-tags text-brand"></i>
            {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
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
                  const colorStyle = colorOf(color);
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
              onClick={onClose}
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
  );
}
