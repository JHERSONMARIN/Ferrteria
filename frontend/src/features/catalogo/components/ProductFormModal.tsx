// Formulario de un producto nuevo o existente, con sus presentaciones de venta y la lectura del código de barras.
import { useState } from 'react';
import type { BarcodeLookup, Product, ProductRequest } from '@ferresys/contracts/catalog';
import { api } from '../../../api/client.ts';
import FieldError from '../../../shared/ui/FieldError.tsx';
import { useToast } from '../../../shared/ui/index.ts';
import BarcodeScannerModal from '../../../shared/scanner/BarcodeScannerModal.tsx';
import { borderClass } from '../../../shared/utils/validators.ts';
import { quantityProblem, FRACTIONAL_UNITS } from '../../../shared/utils/quantities.ts';
import { useIndustryUi } from '../../../industries/index.ts';
import SaleUnitsEditor, {
  toSaleUnitRow, toSaleUnitPayload, validateSaleUnits, type SaleUnitErrors, type SaleUnitRow,
} from './SaleUnitsEditor.tsx';

type Field = 'code' | 'name' | 'category' | 'stock' | 'minStock' | 'price' | 'wholesalePrice';
type Errors = Partial<Record<Field, string>>;

interface Props {
  /** El producto a editar; null = uno nuevo. */
  product: Product | null;
  /** Categoría propuesta para un producto nuevo. */
  initialCategory: string;
  categoryOptions: readonly string[];
  onClose: () => void;
  /** Se guardó: el mensaje para el aviso. */
  onSaved: (message: string) => void;
}

export default function ProductFormModal({ product, initialCategory, categoryOptions, onClose, onSaved }: Props) {
  const aviso = useToast();
  const editingProductId = product?.id ?? null;
  const [code, setCode] = useState(product?.code ?? '');
  const [unit, setUnit] = useState(product?.unit || 'Unidad');
  const [allowsFractions, setAllowsFractions] = useState(Boolean(product?.allowsFractions));
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product ? product.category || 'General' : initialCategory);
  const [stock, setStock] = useState(product ? String(product.stock) : '');
  const [minStock, setMinStock] = useState(product ? String(product.minStock ?? 10) : '10');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [wholesalePrice, setWholesalePrice] = useState(product?.wholesalePrice != null ? String(product.wholesalePrice) : '');
  const [searchingBarcode, setSearchingBarcode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productErrors, setProductErrors] = useState<Errors>({});
  const [saleUnits, setSaleUnits] = useState<SaleUnitRow[]>(() => (product?.saleUnits ?? []).map(toSaleUnitRow));
  const [saleUnitErrors, setSaleUnitErrors] = useState<SaleUnitErrors>({});
  // Campos del rubro de la empresa (farmacia: registro sanitario, receta…); ferretería no tiene.
  const { ProductFields } = useIndustryUi();
  const [industryData, setIndustryData] = useState<Record<string, unknown>>(product?.industryData ?? {});
  // Escáner abierto: guarda a qué campo va el código leído.
  const [scanTarget, setScanTarget] = useState<((code: string) => void) | null>(null);

  const clearProductError = (field: Field) => setProductErrors(prev => ({ ...prev, [field]: '' }));

  const validateProduct = () => {
    const e: Errors = {};
    if (!code.trim()) e.code = 'El código es obligatorio.';
    else if (code.trim().length < 2) e.code = 'El código debe tener al menos 2 caracteres.';

    if (!name.trim()) e.name = 'El nombre del producto es obligatorio.';
    else if (name.trim().length < 2) e.name = 'El nombre debe tener al menos 2 caracteres.';

    if (!category) e.category = 'Seleccione una categoría.';

    const stockNum = Number(stock);
    const stockProblem = quantityProblem(stockNum, allowsFractions);
    if (stock === '' || Number.isNaN(stockNum)) e.stock = 'Ingrese el stock inicial.';
    else if (stockNum < 0) e.stock = 'El stock no puede ser negativo.';
    else if (stockNum > 0 && stockProblem) e.stock = `El stock ${stockProblem}.`;

    const minNum = Number(minStock);
    const minProblem = quantityProblem(minNum, allowsFractions);
    if (minStock === '' || Number.isNaN(minNum)) e.minStock = 'Ingrese el stock mínimo.';
    else if (minNum < 0) e.minStock = 'No puede ser negativo.';
    else if (minNum > 0 && minProblem) e.minStock = `El mínimo ${minProblem}.`;

    const priceNum = parseFloat(price);
    if (price === '' || Number.isNaN(priceNum)) e.price = 'Ingrese el precio.';
    else if (priceNum <= 0) e.price = 'El precio debe ser mayor a 0.';
    else if (priceNum > 1000000) e.price = 'El precio es demasiado alto.';

    const wholesaleNum = parseFloat(wholesalePrice);
    if (wholesalePrice !== '' && (Number.isNaN(wholesaleNum) || wholesaleNum <= 0)) e.wholesalePrice = 'Debe ser mayor a 0 (o dejarlo vacío).';

    const unitErrors = validateSaleUnits(saleUnits, unit, code);
    setSaleUnitErrors(unitErrors);
    setProductErrors(e);
    return Object.keys(e).length === 0 && Object.keys(unitErrors).length === 0;
  };

  const handleSaveProduct = async () => {
    if (!validateProduct()) return;

    const payload: ProductRequest = {
      code: code.trim(),
      name: name.trim(),
      unit,
      allowsFractions,
      category,
      minStock: Number(minStock),
      price: parseFloat(price),
      wholesalePrice: wholesalePrice === '' ? null : parseFloat(wholesalePrice),
      saleUnits: saleUnits.map(toSaleUnitPayload),
      ...(ProductFields ? { industryData } : {}),
    };
    try {
      setSaving(true);
      if (editingProductId) await api.put<Product>(`/productos/${editingProductId}`, payload);
      else await api.post<Product>('/productos', { ...payload, stock: Number(stock) });
      onSaved(editingProductId ? 'Producto actualizado correctamente.' : 'Producto registrado exitosamente.');
    } catch (err) {
      aviso.error(`Error guardando producto: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSearchBarcode = async (scanned?: string) => {
    const barcode = (scanned ?? code).trim();
    if (!barcode) return;
    try {
      setSearchingBarcode(true);
      const res = await api.get<BarcodeLookup>(`/productos/barcode/${encodeURIComponent(barcode)}`);
      if (res.foundInDb) {
        aviso.exito('Este producto ya existe en el inventario.');
        setName(res.product.name);
        setUnit(res.product.unit);
        setPrice(String(res.product.price));
        if (res.product.category) setCategory(res.product.category);
      } else if (res.name) {
        setName(res.name);
      }
    } catch {
      aviso.error('No se encontró el nombre del producto de forma automática. Ingrese el nombre manualmente.');
    } finally {
      setSearchingBarcode(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="p-4 bg-panel text-white flex justify-between items-center shrink-0">
          <h3 className="font-bold text-lg">
            <i className={`fa-solid ${editingProductId ? 'fa-pen-to-square' : 'fa-box-open'} mr-2`}></i>
            {editingProductId ? 'Editar Producto' : 'Nuevo Producto'}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted mb-1 block">Código (Escanear)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={40}
                  value={code}
                  onChange={e => { setCode(e.target.value); clearProductError('code'); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearchBarcode(); }}
                  placeholder="Escanea aquí..."
                  className={`w-full border p-2 rounded outline-none text-sm ${borderClass(productErrors.code)}`}
                />
                <button
                  type="button"
                  onClick={() => setScanTarget(() => (scanned: string) => {
                    setCode(scanned);
                    clearProductError('code');
                    if (!editingProductId) handleSearchBarcode(scanned);
                  })}
                  className="bg-brand-soft text-brand-text px-3 rounded hover:brightness-95 text-xs"
                  title="Escanear el código de barras con la cámara o el lector"
                >
                  <i className="fa-solid fa-barcode"></i>
                </button>
                <button
                  onClick={() => handleSearchBarcode()}
                  disabled={searchingBarcode || !!editingProductId}
                  className="bg-surface-muted text-ink-soft px-3 rounded hover:bg-line text-xs disabled:opacity-50"
                  title="Buscar código en internet"
                >
                  <i className="fa-solid fa-magnifying-glass"></i>
                </button>
              </div>
              <FieldError msg={productErrors.code} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted mb-1 block">Unidad</label>
              <select
                value={unit}
                onChange={e => {
                  setUnit(e.target.value);
                  if (FRACTIONAL_UNITS.includes(e.target.value)) setAllowsFractions(true);
                }}
                className="w-full border border-line p-2 rounded outline-none focus:border-brand bg-surface text-sm"
              >
                <option value="Unidad">Unidad</option>
                <option value="Bolsa">Bolsa</option>
                <option value="Metro">Metro</option>
                <option value="Kilo">Kilo</option>
                <option value="Galón">Galón</option>
                <option value="Litro">Litro</option>
                <option value="Caja">Caja</option>
                <option value="Paquete">Paquete</option>
              </select>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer bg-surface-muted border border-line rounded-lg px-3 py-2">
            <input
              type="checkbox"
              checked={allowsFractions}
              onChange={e => { setAllowsFractions(e.target.checked); clearProductError('stock'); clearProductError('minStock'); }}
              className="accent-orange-600 w-4 h-4 mt-0.5"
            />
            <span>
              <span className="font-semibold">Se vende fraccionado</span>
              <span className="block text-xs text-muted">Permite vender cantidades con decimales, por ejemplo 2.5 metros o 0.750 kilos.</span>
            </span>
          </label>

          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Nombre del Producto</label>
            <input
              type="text"
              maxLength={120}
              value={name}
              onChange={e => { setName(e.target.value); clearProductError('name'); }}
              placeholder={searchingBarcode ? 'Buscando en internet...' : 'Ej. Cemento Sol 42.5kg'}
              className={`w-full border p-2 rounded outline-none text-sm ${borderClass(productErrors.name)}`}
            />
            <FieldError msg={productErrors.name} />
          </div>

          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Categoría de Almacén</label>
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); clearProductError('category'); }}
              className={`w-full border p-2 rounded outline-none bg-surface text-sm ${borderClass(productErrors.category)}`}
            >
              {categoryOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <FieldError msg={productErrors.category} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-bold text-muted mb-1 block">Stock {editingProductId ? 'Actual' : 'Inicial'}</label>
              <input
                type="number"
                min="0"
                disabled={!!editingProductId}
                value={stock}
                onChange={e => { setStock(e.target.value); clearProductError('stock'); }}
                className={`w-full border p-2 rounded outline-none text-sm ${editingProductId ? 'bg-surface-muted cursor-not-allowed' : ''} ${borderClass(productErrors.stock)}`}
              />
              <FieldError msg={productErrors.stock} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted mb-1 block">Stock Mínimo</label>
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
              <label className="text-xs font-bold text-muted mb-1 block">Precio (S/)</label>
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
            <div>
              <label className="text-xs font-bold text-muted mb-1 block">Precio mayorista (opcional)</label>
              <input
                type="number"
                step="0.10"
                min="0"
                value={wholesalePrice}
                onChange={e => { setWholesalePrice(e.target.value); clearProductError('wholesalePrice'); }}
                placeholder="Igual al normal"
                className={`w-full border p-2 rounded outline-none text-sm ${borderClass(productErrors.wholesalePrice)}`}
              />
              <FieldError msg={productErrors.wholesalePrice} />
            </div>
          </div>

          {ProductFields && <ProductFields value={industryData} onChange={setIndustryData} />}

          <SaleUnitsEditor
            rows={saleUnits}
            onChange={rows => { setSaleUnits(rows); setSaleUnitErrors({}); }}
            baseUnit={unit}
            basePrice={price}
            errors={saleUnitErrors}
            onScan={apply => setScanTarget(() => apply)}
          />
        </div>
        <div className="p-4 bg-surface-muted border-t flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 font-bold text-ink-soft bg-surface-muted rounded-lg text-sm">Cancelar</button>
          <button onClick={handleSaveProduct} disabled={saving} className="px-4 py-2 font-bold text-brand-contrast bg-brand hover:bg-brand-strong rounded-lg text-sm shadow-sm transition-colors">
            {editingProductId ? 'Guardar Cambios' : 'Guardar Producto'}
          </button>
        </div>
      </div>

      <BarcodeScannerModal
        open={Boolean(scanTarget)}
        onClose={() => setScanTarget(null)}
        onDetected={scanned => scanTarget?.(scanned)}
      />
    </div>
  );
}
