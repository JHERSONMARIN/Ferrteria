// Productos: el catálogo con su stock, precios y presentaciones; alta, edición, importación y exportación.
import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OnExisting, Product, ProductImportRequest, ProductImportResult } from '@ferresys/contracts/catalog';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { useBranches, useCategories, useProducts } from '../../api/queries.ts';
import { exportToExcel } from '../../shared/utils/excelExport.ts';
import { quantityProblem, formatQuantity } from '../../shared/utils/quantities.ts';
import { useToast, EmptyState, SkeletonTable, Pagination, usePagination } from '../../shared/ui/index.ts';
import ImportModal, { type ImportColumn, type ImportValues, type RowCheck } from '../../shared/import/ImportModal.tsx';
import { downloadTemplate, type Cell } from '../../shared/utils/spreadsheet.ts';
import ProductFormModal from './components/ProductFormModal.tsx';

// Columnas de la importación y de su plantilla. Los alias aceptan planillas con otros encabezados.
const IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'code', label: 'Código', required: true, aliases: ['codigo de barras', 'sku', 'cod'], width: 16 },
  { key: 'name', label: 'Nombre', required: true, aliases: ['producto', 'descripcion'], width: 36 },
  { key: 'category', label: 'Categoría', aliases: ['categoria', 'familia', 'linea'], width: 20 },
  { key: 'unit', label: 'Unidad', aliases: ['unidad de medida', 'um'], placeholder: 'Unidad', width: 12 },
  { key: 'allowsFractions', label: 'Fraccionado', aliases: ['se vende fraccionado', 'decimales'], placeholder: 'No', width: 12 },
  { key: 'price', label: 'Precio', required: true, aliases: ['precio venta', 'pv'], type: 'number', width: 10 },
  { key: 'wholesalePrice', label: 'Precio mayorista', aliases: ['mayorista'], type: 'number', width: 16 },
  { key: 'stock', label: 'Stock inicial', aliases: ['stock', 'cantidad', 'existencias'], type: 'number', placeholder: '0', width: 12 },
  { key: 'minStock', label: 'Stock mínimo', aliases: ['minimo', 'stock minimo'], type: 'number', placeholder: '10', width: 12 },
];
const IMPORT_EXAMPLES: Record<string, Cell>[] = [
  { code: '7750001000011', name: 'Cemento Sol 42.5 kg', category: 'Construcción', unit: 'Bolsa', allowsFractions: 'No', price: 32.5, wholesalePrice: 31, stock: 50, minStock: 10 },
  { code: 'CAB-12', name: 'Cable mellizo 2x12', category: 'Electricidad', unit: 'Metro', allowsFractions: 'Sí', price: 2.8, wholesalePrice: null, stock: 300.5, minStock: 50 },
];
const YES = ['si', 'sí', 's', 'x', '1', 'true', 'verdadero', 'yes'];
const NO = ['', 'no', 'n', '0', 'false', 'falso'];
const parseNumber = (v: string | undefined) => (String(v ?? '').trim() === '' ? null : Number(String(v).trim().replace(',', '.')));

const NO_PRODUCTS: Product[] = [];

interface Props {
  initialCategory?: string;
  initialSearch?: string;
  onNavigateToCategories?: () => void;
}

export default function ProductosPage({ initialCategory = 'Todas', initialSearch = '', onNavigateToCategories }: Props) {
  const aviso = useToast();
  const queryClient = useQueryClient();
  const productsQuery = useProducts();
  const products = productsQuery.data ?? NO_PRODUCTS;
  const categories = useCategories().data ?? [];
  const branches = useBranches().data ?? [];
  // Con una sola sucursal no se muestra nada de sucursales.
  const multiBranch = branches.length > 1;
  const branchName = (id: number) => branches.find(b => b.id === id)?.name ?? `Sucursal ${id}`;

  // Formulario abierto: el producto a editar (null = nuevo) y la categoría propuesta.
  const [productForm, setProductForm] = useState<{ product: Product | null; category: string } | null>(null);

  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [filterCategory, setFilterCategory] = useState(initialCategory || 'Todas');
  const [showImport, setShowImport] = useState(false);
  // Qué hacer con los códigos que ya existen al importar.
  const [onExisting, setOnExisting] = useState<OnExisting>('skip');

  useEffect(() => {
    if (productsQuery.error) aviso.error(`Error cargando inventario: ${productsQuery.error.message}`);
  }, [productsQuery.error, aviso]);

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

  // El stock, los precios y las categorías cambiaron.
  const refreshCatalog = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.products }),
    queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
  ]);

  const openCreateModal = () => {
    setProductForm({ product: null, category: filterCategory !== 'Todas' ? filterCategory : categoryOptions[0] || 'General' });
  };

  const openEditModal = (p: Product) => setProductForm({ product: p, category: p.category || 'General' });

  const handleSaved = async (message: string) => {
    setProductForm(null);
    await refreshCatalog();
    aviso.exito(message);
  };

  const existingCodes = useMemo(() => new Set(products.map(p => p.code.toLowerCase())), [products]);
  const existingCategories = useMemo(() => new Set(categoryOptions.map(c => c.toLowerCase())), [categoryOptions]);

  // Mismas reglas que el formulario y el servidor; lo que no impide importar queda como advertencia.
  const validateImportRow = (v: ImportValues): RowCheck => {
    const errors: Record<string, string> = {};
    const warnings: string[] = [];
    const code = v.code ?? '';
    const name = v.name ?? '';
    const categoryName = v.category ?? '';
    const fractions = String(v.allowsFractions ?? '').trim().toLowerCase();
    const allows = YES.includes(fractions);
    if (code.length < 2 || code.length > 60) errors.code = 'El código debe tener entre 2 y 60 caracteres.';
    if (name.length < 2 || name.length > 120) errors.name = 'El nombre debe tener entre 2 y 120 caracteres.';
    if (!YES.includes(fractions) && !NO.includes(fractions)) errors.allowsFractions = 'Fraccionado debe ser Sí o No.';
    const price = parseNumber(v.price);
    if (price === null || !(price > 0)) errors.price = 'El precio debe ser un número mayor a 0.';
    const wholesale = parseNumber(v.wholesalePrice);
    if (wholesale !== null && !(wholesale > 0)) errors.wholesalePrice = 'El precio mayorista debe ser mayor a 0 o quedar vacío.';
    const stockNum = parseNumber(v.stock) ?? 0;
    const stockProblem = quantityProblem(stockNum, allows);
    if (!Number.isFinite(stockNum) || stockNum < 0) errors.stock = 'El stock no puede ser negativo.';
    else if (stockNum > 0 && stockProblem) errors.stock = `El stock ${stockProblem}.`;
    const minNum = parseNumber(v.minStock) ?? 0;
    if (!Number.isFinite(minNum) || minNum < 0) errors.minStock = 'El stock mínimo no puede ser negativo.';

    if (existingCodes.has(code.toLowerCase())) {
      warnings.push(onExisting === 'update'
        ? 'Ya existe: se actualizarán sus datos y precios (el stock no cambia).'
        : 'Ya existe: se omitirá.');
    }
    if (categoryName && !existingCategories.has(categoryName.toLowerCase())) warnings.push(`Se creará la categoría "${categoryName}".`);
    if (!categoryName) warnings.push('Sin categoría: irá a General.');
    if (price !== null && price > 0 && wholesale !== null && wholesale > price) warnings.push('El precio mayorista es mayor que el normal.');
    return { errors, warnings };
  };

  const handleImport = async (rows: ImportValues[]) => {
    const res = await api.post<ProductImportResult>('/productos/importar', { rows, onExisting } satisfies ProductImportRequest, { timeoutMs: 120000 });
    await refreshCatalog();
    const parts = [`${res.created} creado${res.created === 1 ? '' : 's'}`];
    if (res.updated) parts.push(`${res.updated} actualizado${res.updated === 1 ? '' : 's'}`);
    if (res.skipped) parts.push(`${res.skipped} omitido${res.skipped === 1 ? '' : 's'} (ya existían)`);
    if (res.categoriesCreated) parts.push(`${res.categoriesCreated} categoría(s) nueva(s)`);
    aviso.exito('Importación completada.');
    return { message: `Productos importados: ${parts.join(', ')}.` };
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

  // Máximo 10 por página; en pantallas chicas se ve la página completa sin scroll interno.
  const pg = usePagination(filteredProducts);

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
              onClick={() => downloadTemplate('Plantilla_productos.xlsx', IMPORT_COLUMNS, IMPORT_EXAMPLES)}
              className="bg-surface border border-line hover:bg-surface-muted text-ink-soft px-3 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-download"></i> Plantilla
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="bg-surface border border-line hover:bg-surface-muted text-ink-soft px-3 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-file-import"></i> Importar
            </button>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-muted text-muted text-xs uppercase shadow-sm">
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
              {productsQuery.isPending ? (
                <tr>
                  <td colSpan={9} className="p-0"><SkeletonTable rows={8} columns={5} /></td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-0">
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
                pg.pageItems.map(p => {
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
                        {p.saleUnits.length > 0 && (
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
                            title={p.branches.map(b => `${branchName(b.branchId)}: ${formatQuantity(b.stock)}`).join('\n')}
                          >
                            Empresa: {formatQuantity(p.totalStock ?? p.stock)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted">{formatQuantity(p.minStock ?? 10)}</td>
                      <td className="px-4 py-3 text-right font-bold text-ink tabular-nums">
                        S/ {p.price.toFixed(2)}
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
        <Pagination {...pg} />
      </div>

      {productForm && (
        <ProductFormModal
          product={productForm.product}
          initialCategory={productForm.category}
          categoryOptions={categoryOptions}
          onClose={() => setProductForm(null)}
          onSaved={handleSaved}
        />
      )}

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Importar productos"
        entityLabel="productos"
        columns={IMPORT_COLUMNS}
        examples={IMPORT_EXAMPLES}
        templateName="Plantilla_productos.xlsx"
        uniqueKey="code"
        validateRow={validateImportRow}
        onImport={handleImport}
        options={(
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs bg-surface-muted rounded-lg px-3 py-2">
            <span className="font-bold text-ink-soft">Si el código ya existe:</span>
            {([['skip', 'Omitirlo'], ['update', 'Actualizar datos y precios']] as const).map(([id, label]) => (
              <label key={id} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="onExisting" checked={onExisting === id} onChange={() => setOnExisting(id)} className="accent-orange-600" />
                {label}
              </label>
            ))}
            <span className="text-muted">El stock de los productos existentes nunca se cambia al importar (use Movimientos).</span>
          </div>
        )}
      />

    </div>
  );
}
