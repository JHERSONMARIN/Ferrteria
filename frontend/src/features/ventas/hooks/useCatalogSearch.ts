// Búsqueda del catálogo de Vender: texto, categoría y búsqueda por código exacto (lector de barras).
import { useMemo, useState } from 'react';
import type { Category, Product, SaleUnit } from '@ferresys/contracts/catalog';

export function useCatalogSearch(products: readonly Product[], dbCategories: readonly Category[]) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');

  // Sin categorías registradas se usan las de los productos.
  const categories = useMemo(() => {
    const fromDb = dbCategories.map(c => c.name);
    const fromProducts = products.map(p => p.category).filter(Boolean);
    const unique = Array.from(new Set([...fromDb, ...fromProducts]));
    return ['Todas', ...(unique.length > 0 ? unique : ['General'])];
  }, [dbCategories, products]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter(p => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
        || p.saleUnits.some(u => u.code && u.code.toLowerCase().includes(q));
      const matchesCategory = selectedCategory === 'Todas' || (p.category || 'General') === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, selectedCategory]);

  // Producto (y presentación, si el código es de una) con ese código exacto.
  const findByCode = (code: string): { product: Product; unit: SaleUnit | undefined } | null => {
    const q = code.trim().toLowerCase();
    const product = products.find(p => p.code.toLowerCase() === q);
    if (product) return { product, unit: undefined };
    for (const p of products) {
      const unit = p.saleUnits.find(u => u.code && u.code.toLowerCase() === q);
      if (unit) return { product: p, unit };
    }
    return null;
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedCategory('Todas');
  };

  return { search, setSearch, selectedCategory, setSelectedCategory, categories, filteredProducts, findByCode, clearFilters };
}
