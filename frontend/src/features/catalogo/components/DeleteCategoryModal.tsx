// Eliminar una categoría: si tiene productos, primero se elige a qué categoría pasan.
import { useState } from 'react';
import type { Category, CategoryDeleted } from '@ferresys/contracts/catalog';
import { api } from '../../../api/client.ts';
import { useToast } from '../../../shared/ui/index.ts';

interface Props {
  category: Category;
  categories: readonly Category[];
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteCategoryModal({ category, categories, onClose, onDeleted }: Props) {
  const aviso = useToast();
  const [reassignCategoryId, setReassignCategoryId] = useState(() => {
    const other = categories.find(c => c.id !== category.id);
    return other ? String(other.id) : '';
  });
  const [deletingCategory, setDeletingCategory] = useState(false);

  const handleConfirmDelete = async () => {
    let queryParam = '';
    if (category.productCount > 0) {
      if (!reassignCategoryId) {
        aviso.exito('Debe seleccionar una categoría de destino para reasignar los productos.');
        return;
      }
      queryParam = `?targetCategoryId=${reassignCategoryId}`;
    }
    try {
      setDeletingCategory(true);
      await api.delete<CategoryDeleted>(`/categorias/${category.id}${queryParam}`);
      onDeleted();
    } catch (err) {
      aviso.error(`Error al eliminar categoría: ${(err as Error).message}`);
    } finally {
      setDeletingCategory(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 bg-danger text-white flex justify-between items-center">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <i className="fa-solid fa-triangle-exclamation"></i>
            Eliminar Categoría
          </h3>
          <button onClick={onClose} className="text-danger-soft hover:text-white transition-colors">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 text-ink-soft text-sm">
          <p>
            ¿Está seguro de que desea eliminar la categoría{' '}
            <strong className="text-ink">{category.name}</strong>?
          </p>

          {category.productCount > 0 ? (
            <div className="bg-warning-soft border border-warning/30 p-3 rounded-lg text-warning text-xs flex flex-col gap-2">
              <div className="flex items-center gap-2 font-bold">
                <i className="fa-solid fa-circle-exclamation text-warning text-sm"></i>
                Esta categoría contiene {category.productCount} producto(s) asignado(s).
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
                    .filter(c => c.id !== category.id)
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
            onClick={onClose}
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
  );
}
