// Categorías: cómo se agrupan los productos, con sus números; alta, edición, eliminación e importación.
import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Category, CategoryImportResult, OnExisting } from '@ferresys/contracts/catalog';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { useCategories } from '../../api/queries.ts';
import { useToast, EmptyState, SkeletonCards, Pagination, usePagination } from '../../shared/ui/index.ts';
import ImportModal, { type ImportColumn, type ImportValues, type RowCheck } from '../../shared/import/ImportModal.tsx';
import { downloadTemplate, type Cell } from '../../shared/utils/spreadsheet.ts';
import { AVAILABLE_COLORS, AVAILABLE_ICONS, colorOf } from './categoryStyles.ts';
import CategoryFormModal from './components/CategoryFormModal.tsx';
import DeleteCategoryModal from './components/DeleteCategoryModal.tsx';

const IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'name', label: 'Nombre', required: true, aliases: ['categoria', 'nombre de la categoria'], width: 26 },
  { key: 'description', label: 'Descripción', aliases: ['descripcion', 'detalle'], width: 40 },
  { key: 'icon', label: 'Ícono', aliases: ['icono'], placeholder: 'fa-tag', width: 16 },
  { key: 'color', label: 'Color', placeholder: 'orange', width: 12 },
];
const IMPORT_EXAMPLES: Record<string, Cell>[] = [
  { name: 'Electricidad', description: 'Cables, tomacorrientes e interruptores', icon: 'fa-bolt', color: 'amber' },
  { name: 'Gasfitería', description: 'Tubos, llaves y accesorios', icon: 'fa-faucet-drip', color: 'blue' },
];

const NO_CATEGORIES: Category[] = [];

interface Props {
  onSelectCategory?: (category: string) => void;
  onNavigateToProducts?: () => void;
}

export default function CategoriasPage({ onSelectCategory, onNavigateToProducts }: Props) {
  const aviso = useToast();
  const queryClient = useQueryClient();
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? NO_CATEGORIES;
  const [searchQuery, setSearchQuery] = useState('');
  // Formulario abierto: la categoría a editar (null = nueva).
  const [categoryForm, setCategoryForm] = useState<{ category: Category | null } | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<Category | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [onExisting, setOnExisting] = useState<OnExisting>('skip');

  useEffect(() => {
    if (categoriesQuery.error) aviso.error(`Error cargando categorías: ${categoriesQuery.error.message}`);
  }, [categoriesQuery.error, aviso]);

  // Los productos muestran su categoría: se refrescan los dos.
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
    queryClient.invalidateQueries({ queryKey: queryKeys.products }),
  ]);

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
  const totalValuation = useMemo(() => categories.reduce((acc, c) => acc + (c.inventoryValue || 0), 0), [categories]);
  const totalProducts = useMemo(() => categories.reduce((acc, c) => acc + (c.productCount || 0), 0), [categories]);
  const totalLowStock = useMemo(() => categories.reduce((acc, c) => acc + (c.lowStockCount || 0), 0), [categories]);

  const handleSaved = async (message: string) => {
    setCategoryForm(null);
    await refresh();
    aviso.exito(message);
  };

  const handleDeleted = async () => {
    setDeleteCategoryTarget(null);
    await refresh();
    aviso.exito('Categoría eliminada exitosamente.');
  };

  const existingNames = useMemo(() => new Set(categories.map(c => c.name.toLowerCase())), [categories]);

  const validateImportRow = (v: ImportValues): RowCheck => {
    const errors: Record<string, string> = {};
    const warnings: string[] = [];
    const name = v.name ?? '';
    const description = v.description ?? '';
    const color = v.color ?? '';
    const icon = (v.icon ?? '').toLowerCase();
    const normalizedIcon = icon && !icon.startsWith('fa-') ? `fa-${icon}` : icon;
    if (name.length < 2 || name.length > 60) errors.name = 'El nombre debe tener entre 2 y 60 caracteres.';
    if (description.length > 200) errors.description = 'La descripción es demasiado larga (máx. 200).';
    if (normalizedIcon && !/^fa-[a-z0-9-]{1,40}$/.test(normalizedIcon)) errors.icon = 'Ícono no válido (ej. fa-hammer).';
    else if (normalizedIcon && !AVAILABLE_ICONS.includes(normalizedIcon)) warnings.push(`El ícono ${normalizedIcon} no está en la lista del sistema; puede no verse.`);
    if (color && !AVAILABLE_COLORS.includes(color.toLowerCase())) errors.color = `Color no válido. Use: ${AVAILABLE_COLORS.join(', ')}.`;
    if (existingNames.has(name.toLowerCase())) {
      warnings.push(onExisting === 'update' ? 'Ya existe: se actualizarán descripción, ícono y color.' : 'Ya existe: se omitirá.');
    }
    return { errors, warnings };
  };

  const handleImport = async (rows: ImportValues[]) => {
    const res = await api.post<CategoryImportResult>('/categorias/importar', { rows, onExisting }, { timeoutMs: 60000 });
    await refresh();
    aviso.exito('Importación completada.');
    const parts = [`${res.created} creada${res.created === 1 ? '' : 's'}`];
    if (res.updated) parts.push(`${res.updated} actualizada${res.updated === 1 ? '' : 's'}`);
    if (res.skipped) parts.push(`${res.skipped} omitida${res.skipped === 1 ? '' : 's'} (ya existían)`);
    return { message: `Categorías importadas: ${parts.join(', ')}.` };
  };

  // Máximo 12 por página; en pantallas chicas se ve la página completa sin scroll interno.
  const pg = usePagination(filteredCategories, 12);

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
              onClick={() => downloadTemplate('Plantilla_categorias.xlsx', IMPORT_COLUMNS, IMPORT_EXAMPLES)}
              className="bg-surface border border-line hover:bg-surface-muted text-ink-soft px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-download"></i> Plantilla
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="bg-surface border border-line hover:bg-surface-muted text-ink-soft px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-file-import"></i> Importar
            </button>
            <button
              onClick={() => setCategoryForm({ category: null })}
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
            {categoriesQuery.isPending ? (
              <div className="col-span-full"><SkeletonCards count={8} /></div>
            ) : filteredCategories.length === 0 ? (
              <div className="col-span-full bg-surface rounded-2xl border border-line">
                <EmptyState
                  icon="fa-tags"
                  title={categories.length === 0 ? 'Todavía no hay categorías' : 'Ninguna categoría coincide'}
                  description={categories.length === 0
                    ? 'Agrupe sus productos por categoría para encontrarlos más rápido al vender.'
                    : 'Pruebe con otro texto.'}
                />
              </div>
            ) : (
              pg.pageItems.map(cat => {
                const style = colorOf(cat.color);
                return (
                  <div
                    key={cat.id}
                    className="bg-surface border border-line rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Cabecera: Icono y Botones */}
                      <div className="flex items-center gap-3">
                        <span className={`w-10 h-10 shrink-0 rounded-xl ${style.bg} ${style.text} flex items-center justify-center font-bold text-base shadow-sm border ${style.border}`}>
                          <i className={`fa-solid ${cat.icon || 'fa-tag'}`}></i>
                        </span>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-bold text-ink text-base leading-tight truncate" title={cat.name}>{cat.name}</h5>
                          {cat.description && (
                            <p className="text-xs text-muted mt-0.5 line-clamp-1">{cat.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setCategoryForm({ category: cat })}
                            className="text-muted hover:text-brand p-1.5 rounded hover:bg-surface-muted transition-colors"
                            title="Editar categoría"
                          >
                            <i className="fa-solid fa-pen text-xs"></i>
                          </button>
                          <button
                            onClick={() => setDeleteCategoryTarget(cat)}
                            className="text-muted hover:text-danger p-1.5 rounded hover:bg-surface-muted transition-colors"
                            title="Eliminar categoría"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      </div>

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
          <Pagination {...pg} className="bg-surface" />
        </div>
      </div>

      {categoryForm && (
        <CategoryFormModal category={categoryForm.category} onClose={() => setCategoryForm(null)} onSaved={handleSaved} />
      )}

      {deleteCategoryTarget && (
        <DeleteCategoryModal
          category={deleteCategoryTarget}
          categories={categories}
          onClose={() => setDeleteCategoryTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Importar categorías"
        entityLabel="categorías"
        columns={IMPORT_COLUMNS}
        examples={IMPORT_EXAMPLES}
        templateName="Plantilla_categorias.xlsx"
        uniqueKey="name"
        validateRow={validateImportRow}
        onImport={handleImport}
        options={(
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs bg-surface-muted rounded-lg px-3 py-2">
            <span className="font-bold text-ink-soft">Si la categoría ya existe:</span>
            {([['skip', 'Omitirla'], ['update', 'Actualizar descripción, ícono y color']] as const).map(([id, label]) => (
              <label key={id} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="onExistingCat" checked={onExisting === id} onChange={() => setOnExisting(id)} className="accent-orange-600" />
                {label}
              </label>
            ))}
          </div>
        )}
      />
    </div>
  );
}
