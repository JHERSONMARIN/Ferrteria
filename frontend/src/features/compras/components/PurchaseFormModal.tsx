// Registrar una compra: proveedor, documento y los productos con su costo. Ingresa el stock.
import { useState } from 'react';
import type { Product } from '@ferresys/contracts/catalog';
import type { PurchaseRequest, PurchaseSaved, Supplier } from '@ferresys/contracts/purchasing';
import { api } from '../../../api/client.ts';
import FieldError from '../../../shared/ui/FieldError.tsx';
import { useToast } from '../../../shared/ui/index.ts';
import { borderClass } from '../../../shared/utils/validators.ts';
import { quantityProblem, roundQuantity } from '../../../shared/utils/quantities.ts';
import { useIndustryUi } from '../../../industries/index.ts';

interface CartItem {
  id: number;
  name: string;
  code: string;
  qty: number;
  cost: number;
  /** Datos del rubro de la línea (farmacia: lote y vencimiento). */
  industryData?: Record<string, unknown>;
}

type CompraErrors = { proveedor?: string; numDoc?: string; cart?: string };
type ItemErrors = { product?: string; qty?: string; cost?: string; industry?: string };

interface Props {
  proveedores: readonly Supplier[];
  productos: readonly Product[];
  onClose: () => void;
  onSaved: () => void;
}

export default function PurchaseFormModal({ proveedores, productos, onClose, onSaved }: Props) {
  const aviso = useToast();
  const [selectedProveedorId, setSelectedProveedorId] = useState(proveedores[0] ? String(proveedores[0].id) : '');
  const [numDoc, setNumDoc] = useState('');
  const [productInput, setProductInput] = useState('');
  const [productQty, setProductQty] = useState('1');
  const [productCost, setProductCost] = useState('');
  const [compraCart, setCompraCart] = useState<CartItem[]>([]);
  const [compraErrors, setCompraErrors] = useState<CompraErrors>({});
  const [itemErrors, setItemErrors] = useState<ItemErrors>({});
  const [saving, setSaving] = useState(false);
  // Farmacia: cada línea entra a un lote. El mismo producto en otro lote es otra línea.
  const { stockEntry } = useIndustryUi();
  const [lineData, setLineData] = useState<Record<string, unknown>>({});
  const sameLine = (item: CartItem, id: number) =>
    item.id === id && JSON.stringify(item.industryData ?? {}) === JSON.stringify(stockEntry ? lineData : {});

  const clearCompraError = (f: keyof CompraErrors) => setCompraErrors(p => ({ ...p, [f]: '' }));
  const clearItemError = (f: keyof ItemErrors) => setItemErrors(p => ({ ...p, [f]: '' }));

  const validateCompra = () => {
    const e: CompraErrors = {};
    if (!selectedProveedorId) e.proveedor = 'Seleccione un proveedor.';
    if (!numDoc.trim()) e.numDoc = 'Ingrese el N° de factura / guía.';
    else if (numDoc.trim().length < 3) e.numDoc = 'El número de documento es demasiado corto.';
    if (compraCart.length === 0) e.cart = 'Agregue al menos un producto a la compra.';
    setCompraErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAddCompraItem = () => {
    const e: ItemErrors = {};
    const qty = Number(productQty);
    const cost = parseFloat(productCost);

    if (!productInput.trim()) e.product = 'Seleccione un producto.';
    if (productCost === '' || Number.isNaN(cost)) e.cost = 'Ingrese el costo unitario.';
    else if (cost < 0) e.cost = 'El costo no puede ser negativo.';

    const prod = e.product ? undefined : (
      productos.find(p => `${p.code} - ${p.name}` === productInput.trim()) ??
      productos.find(p => p.code === productInput.trim() || p.name.toLowerCase().includes(productInput.trim().toLowerCase()))
    );
    if (!e.product && !prod) e.product = 'Producto no encontrado en el catálogo.';

    // Enteros, o hasta 3 decimales si el producto se vende fraccionado (metros, kilos).
    const problem = prod ? quantityProblem(qty, prod.allowsFractions) : null;
    if (productQty === '' || Number.isNaN(qty)) e.qty = 'Ingrese la cantidad.';
    else if (problem) e.qty = `La cantidad ${problem}.`;
    const industryProblem = stockEntry?.problem(lineData);
    if (industryProblem) e.industry = industryProblem;

    setItemErrors(e);
    if (Object.keys(e).length > 0 || !prod) return;

    setCompraErrors(p => ({ ...p, cart: '' }));
    setCompraCart(prev => {
      if (prev.some(item => sameLine(item, prod.id))) {
        return prev.map(item => sameLine(item, prod.id) ? { ...item, qty: roundQuantity(item.qty + qty), cost } : item);
      }
      return [...prev, { id: prod.id, name: prod.name, code: prod.code, qty, cost, ...(stockEntry ? { industryData: lineData } : {}) }];
    });
    setLineData({});

    setProductInput('');
    setProductQty('1');
    setProductCost('');
  };

  const handleRemoveCompraItem = (index: number) => {
    setCompraCart(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveCompra = async () => {
    if (!validateCompra()) return;
    try {
      setSaving(true);
      await api.post<PurchaseSaved>('/compras', {
        proveedorId: Number(selectedProveedorId),
        numDoc: numDoc.trim(),
        items: compraCart,
      } satisfies PurchaseRequest);
      onSaved();
    } catch (err) {
      aviso.error(`Error registrando compra: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const compraTotal = compraCart.reduce((acc, i) => acc + (i.qty * i.cost), 0);

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 bg-panel text-white flex justify-between items-center shrink-0">
          <h3 className="font-bold text-lg"><i className="fa-solid fa-cart-flatbed mr-2"></i> Registrar Entrada de Mercadería</h3>
          <button onClick={onClose} className="text-muted hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div className="p-4 bg-surface-muted border-b border-line grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Proveedor</label>
            <select
              value={selectedProveedorId}
              onChange={e => { setSelectedProveedorId(e.target.value); clearCompraError('proveedor'); }}
              className={`w-full border p-2 rounded outline-none bg-surface text-sm ${borderClass(compraErrors.proveedor)}`}
            >
              <option value="">-- Seleccionar proveedor --</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.name} (RUC: {p.ruc})</option>
              ))}
            </select>
            <FieldError msg={compraErrors.proveedor} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">N° Factura / Guía de Remisión</label>
            <input
              type="text"
              maxLength={30}
              value={numDoc}
              onChange={e => { setNumDoc(e.target.value); clearCompraError('numDoc'); }}
              placeholder="Ej: F001-000458"
              className={`w-full border p-2 rounded outline-none text-sm font-medium ${borderClass(compraErrors.numDoc)}`}
            />
            <FieldError msg={compraErrors.numDoc} />
          </div>
        </div>

        <div className="p-4 border-b border-line shrink-0 bg-surface">
          <div className="flex gap-2 items-start">
            <div className="flex-1 relative">
              <input
                list="compra-prod-list"
                value={productInput}
                onChange={e => { setProductInput(e.target.value); clearItemError('product'); }}
                placeholder="Buscar producto..."
                className={`w-full px-3 py-2 border rounded outline-none bg-surface text-sm ${borderClass(itemErrors.product)}`}
              />
              <datalist id="compra-prod-list">
                {productos.map(p => (
                  <option key={p.id} value={`${p.code} - ${p.name}`} />
                ))}
              </datalist>
              <FieldError msg={itemErrors.product} />
            </div>
            <div>
              <input
                type="number"
                min="0.001"
                step="any"
                value={productQty}
                onChange={e => { setProductQty(e.target.value); clearItemError('qty'); }}
                placeholder="Cant."
                className={`w-20 border p-2 rounded outline-none text-sm ${borderClass(itemErrors.qty)}`}
              />
              <FieldError msg={itemErrors.qty} />
            </div>
            <div>
              <input
                type="number"
                step="0.10"
                min="0"
                value={productCost}
                onChange={e => { setProductCost(e.target.value); clearItemError('cost'); }}
                placeholder="Costo S/"
                className={`w-24 border p-2 rounded outline-none text-sm ${borderClass(itemErrors.cost)}`}
              />
              <FieldError msg={itemErrors.cost} />
            </div>
            <button
              onClick={handleAddCompraItem}
              className="bg-panel text-white font-bold px-4 py-2 rounded shadow hover:bg-panel-strong text-sm h-[38px]"
            >
              Agregar
            </button>
          </div>
          {stockEntry && (
            <div className="mt-2 max-w-md">
              <stockEntry.Fields value={lineData} onChange={value => { setLineData(value); clearItemError('industry'); }} />
              <FieldError msg={itemErrors.industry} />
            </div>
          )}
          <FieldError msg={compraErrors.cart} />
        </div>

        <div className="flex-1 overflow-auto p-4 bg-surface-muted">
          <table className="w-full text-left border-collapse bg-surface shadow-sm rounded-lg overflow-hidden">
            <thead className="bg-surface-muted text-muted text-xs uppercase">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Producto</th>
                {stockEntry && <th className="px-3 py-2">{stockEntry.label}</th>}
                <th className="px-3 py-2">Cant.</th>
                <th className="px-3 py-2 text-right">Costo U.</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-line">
              {compraCart.map((item, index) => (
                <tr key={`${item.id}-${index}`}>
                  <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                  <td className="px-3 py-2 font-semibold">{item.name}</td>
                  {stockEntry && <td className="px-3 py-2 text-xs">{stockEntry.describe(item.industryData ?? {})}</td>}
                  <td className="px-3 py-2 font-bold">{item.qty}</td>
                  <td className="px-3 py-2 text-right">S/ {item.cost.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-bold">S/ {(item.qty * item.cost).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => handleRemoveCompraItem(index)} className="text-danger hover:text-danger">
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-surface border-t flex justify-between items-center shrink-0">
          <div className="text-ink font-bold text-lg">
            TOTAL COMPRA: <span className="text-2xl font-black text-brand">S/ {compraTotal.toFixed(2)}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 font-bold text-ink-soft bg-surface-muted rounded-lg text-sm">Cancelar</button>
            <button onClick={handleSaveCompra} disabled={saving || compraCart.length === 0} className="px-6 py-2 font-bold text-brand-contrast bg-brand rounded-lg shadow-md text-sm">
              Registrar Compra
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
