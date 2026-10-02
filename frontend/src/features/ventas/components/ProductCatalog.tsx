// Catálogo de Vender: buscador (también por código), escáner, cotizaciones, categorías y las tarjetas de producto.
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import type { Product } from '@ferresys/contracts/catalog';
import { formatSoles } from '../../../shared/utils/currency.ts';
import { formatQuantity } from '../../../shared/utils/quantities.ts';
import { SkeletonCards } from '../../../shared/ui/index.ts';
import { availableStock, priceFor, stockUnitLabel } from '../cart.ts';
import type { useCatalogSearch } from '../hooks/useCatalogSearch.ts';

interface Props {
  catalog: ReturnType<typeof useCatalogSearch>;
  loading: boolean;
  searchRef: RefObject<HTMLInputElement>;
  onSearchKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  /** Unidades base de cada producto ya puestas en el carrito. */
  qtyInCart: ReadonlyMap<number, number>;
  isWholesale: boolean;
  busy: boolean;
  onAdd: (product: Product) => void;
  onScan: () => void;
  onOpenQuotes: () => void;
}

export default function ProductCatalog({
  catalog, loading, searchRef, onSearchKeyDown, qtyInCart, isWholesale, busy, onAdd, onScan, onOpenQuotes,
}: Props) {
  const { search, setSearch, selectedCategory, setSelectedCategory, categories, filteredProducts } = catalog;

  return (
    <div className="flex-1 flex flex-col bg-surface rounded-xl shadow-sm border border-line xl:h-full xl:overflow-hidden min-w-0">
      <div className="p-3 sm:p-4 border-b border-line flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <i className="fa-solid fa-barcode absolute left-3 top-1/2 -translate-y-1/2 text-muted"></i>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Escanee o busque por código o nombre…"
              className="w-full pl-10 pr-20 py-2.5 border border-line rounded-lg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 text-sm transition"
            />
            {search ? (
              <button
                onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-danger p-1"
                title="Limpiar búsqueda"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            ) : (
              <kbd className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted border border-line rounded px-1.5 py-0.5">F2</kbd>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onScan}
              className="flex-1 sm:flex-none bg-surface border border-line hover:bg-surface-muted text-ink-soft font-bold px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shrink-0"
              title="Escanear código de barras con la cámara o el lector"
            >
              <i className="fa-solid fa-barcode text-brand"></i> Escanear
            </button>
            <button
              onClick={onOpenQuotes}
              disabled={busy}
              className="flex-1 sm:flex-none bg-surface border border-line hover:bg-surface-muted text-ink-soft font-bold px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
            >
              <i className="fa-solid fa-file-import text-brand"></i> Cargar cotización
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 whitespace-nowrap border transition-colors ${
                selectedCategory === cat
                  ? 'bg-brand text-brand-contrast border-brand'
                  : 'bg-surface text-ink-soft border-line hover:bg-surface-muted'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-3 sm:p-4 xl:overflow-y-auto bg-surface-muted/60">
        <p className="text-xs text-muted mb-3">
          {filteredProducts.length} producto{filteredProducts.length === 1 ? '' : 's'}
          {search && <> para “<strong className="text-ink-soft">{search}</strong>”</>}
          {selectedCategory !== 'Todas' && <> en <strong className="text-ink-soft">{selectedCategory}</strong></>}
        </p>

        {loading ? (
          <SkeletonCards count={8} />
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <i className="fa-solid fa-magnifying-glass text-3xl mb-3 text-muted"></i>
            <p className="text-sm font-semibold">No hay productos que coincidan</p>
            {(search || selectedCategory !== 'Todas') && (
              <button onClick={catalog.clearFilters} className="mt-3 text-xs font-bold text-brand hover:underline">
                Quitar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {filteredProducts.map(product => (
              <ProductCard key={product.id} product={product} inCart={qtyInCart.get(product.id) || 0} isWholesale={isWholesale} onAdd={onAdd} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product, inCart, isWholesale, onAdd }: {
  product: Product; inCart: number; isWholesale: boolean; onAdd: (product: Product) => void;
}) {
  const available = availableStock(product);
  const soldOut = available <= 0;
  const lowStock = !soldOut && available <= (product.minStock || 10);

  return (
    <button
      onClick={() => onAdd(product)}
      disabled={soldOut}
      className={`relative text-left p-3 rounded-xl border bg-surface transition-all flex flex-col gap-1.5 min-h-[118px] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
        inCart > 0 ? 'border-brand ring-1 ring-brand/30' : 'border-line hover:border-brand hover:shadow-md'
      }`}
    >
      {inCart > 0 && (
        <span className="absolute top-2 right-2 bg-brand text-brand-contrast text-[11px] font-black rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center shadow">
          {inCart}
        </span>
      )}
      <span className="text-[10px] font-mono text-muted truncate pr-7">{product.code}</span>
      <h4 className="font-semibold text-ink text-sm leading-snug line-clamp-2 flex-1">{product.name}</h4>
      {product.saleUnits.length > 0 && (
        <span className="text-[10px] font-semibold text-brand-text truncate">
          <i className="fa-solid fa-layer-group mr-1"></i>
          {product.unit}, {product.saleUnits.map(u => u.name).join(', ')}
        </span>
      )}
      <div className="flex items-end justify-between gap-2">
        <span className="text-base font-black text-ink">
          {formatSoles(priceFor(product, isWholesale))}
          {isWholesale && product.wholesalePrice != null && (
            <span className="block text-[9px] font-bold text-info uppercase">Mayorista</span>
          )}
        </span>
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
            soldOut ? 'bg-surface-muted text-muted' : lowStock ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
          }`}
          title={product.reserved > 0 ? `${product.reserved} reservado(s) para pedidos` : undefined}
        >
          {soldOut ? 'Agotado' : `${formatQuantity(available)} ${stockUnitLabel(product.unit)}`}
        </span>
      </div>
    </button>
  );
}
