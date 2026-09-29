// Ajuste manual de stock: entrada o salida de un producto, con su motivo.
import { useState } from 'react';
import type { Product } from '@ferresys/contracts/catalog';
import type { ManualMovementRequest, ManualMovementSaved, MovementType } from '@ferresys/contracts/inventory';
import { api } from '../../../api/client.ts';
import FieldError from '../../../shared/ui/FieldError.tsx';
import { useToast } from '../../../shared/ui/index.ts';
import { borderClass } from '../../../shared/utils/validators.ts';
import { quantityProblem, roundQuantity, formatQuantity } from '../../../shared/utils/quantities.ts';

const COMMON_REASONS: Record<MovementType, string[]> = {
  ENTRADA: [
    'Ajuste por Conteo Físico (Sobrante)',
    'Ingreso Extraordinario / Muestra',
    'Devolución de Cliente',
    'Otro motivo de ingreso',
  ],
  SALIDA: [
    'Ajuste por Conteo Físico (Faltante)',
    'Merma por Rotura o Deterioro',
    'Producto Vencido / No Apto',
    'Consumo o Uso Interno de Ferretería',
    'Devolución a Proveedor',
    'Otro motivo de salida',
  ],
};

type Errors = { producto?: string; qty?: string };

interface Props {
  products: readonly Product[];
  onClose: () => void;
  onSaved: () => void;
}

export default function MovementFormModal({ products, onClose, onSaved }: Props) {
  const aviso = useToast();
  const [selectedProdId, setSelectedProdId] = useState(products[0] ? String(products[0].id) : '');
  const [type, setType] = useState<MovementType>('ENTRADA');
  const [reasonPreset, setReasonPreset] = useState(COMMON_REASONS.ENTRADA[0] ?? '');
  const [refDetail, setRefDetail] = useState('');
  const [qty, setQty] = useState('1');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const clearError = (field: keyof Errors) => setErrors((prev) => ({ ...prev, [field]: '' }));

  const validateMovement = () => {
    const e: Errors = {};
    if (!selectedProdId) e.producto = 'Seleccione un producto.';

    const qtyNum = Number(qty);
    const prod = products.find((p) => String(p.id) === String(selectedProdId));
    const available = prod ? roundQuantity(prod.stock - (prod.reserved || 0)) : 0;
    const problem = prod ? quantityProblem(qtyNum, prod.allowsFractions) : null;
    if (qty === '' || Number.isNaN(qtyNum)) e.qty = 'Ingrese la cantidad.';
    else if (problem) e.qty = `La cantidad ${problem}.`;
    else if (type === 'SALIDA' && prod && qtyNum > available) {
      e.qty = `Stock insuficiente. Disponible: ${formatQuantity(available)}${prod.reserved > 0 ? ' (el resto está reservado para pedidos)' : ''}.`;
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleTypeChange = (newType: MovementType) => {
    setType(newType);
    setReasonPreset(COMMON_REASONS[newType][0] ?? '');
    clearError('qty');
  };

  const handleSaveMovement = async () => {
    if (!validateMovement()) return;
    try {
      setSaving(true);
      const fullRef = refDetail.trim() ? `${reasonPreset} - ${refDetail.trim()}` : reasonPreset;
      await api.post<ManualMovementSaved>('/kardex', {
        productoId: Number(selectedProdId),
        type,
        qty: Number(qty),
        ref: fullRef,
      } satisfies ManualMovementRequest);
      onSaved();
    } catch (err) {
      aviso.error(`Error al registrar movimiento: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all p-4">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 bg-panel text-white flex justify-between items-center">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <i className="fa-solid fa-boxes-packing text-brand"></i>
            Nuevo Movimiento de Kardex
          </h3>
          <button onClick={onClose} className="text-muted hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Producto */}
          <div>
            <label className="text-xs font-bold text-ink-soft mb-1 block">
              Producto a Ajustar <span className="text-danger">*</span>
            </label>
            <select
              value={selectedProdId}
              onChange={(e) => {
                setSelectedProdId(e.target.value);
                clearError('producto');
                clearError('qty');
              }}
              className={`w-full border p-2.5 rounded-lg outline-none bg-surface text-sm ${borderClass(
                errors.producto
              )}`}
            >
              <option value="">-- Seleccionar producto --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Stock Actual: {p.stock} {p.unit})
                </option>
              ))}
            </select>
            <FieldError msg={errors.producto} />
          </div>

          {/* Tipo y Cantidad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-ink-soft mb-1 block">Tipo de Flujo</label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as MovementType)}
                className="w-full border border-line p-2.5 rounded-lg outline-none focus:border-brand bg-surface text-sm font-semibold"
              >
                <option value="ENTRADA">🟢 Ingreso (+)</option>
                <option value="SALIDA">🔴 Salida / Baja (-)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-ink-soft mb-1 block">
                Cantidad <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min="0.001"
                step="any"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  clearError('qty');
                }}
                className={`w-full border p-2.5 rounded-lg outline-none text-sm font-bold ${borderClass(
                  errors.qty
                )}`}
              />
              <FieldError msg={errors.qty} />
            </div>
          </div>

          {/* Motivo Predefinido */}
          <div>
            <label className="text-xs font-bold text-ink-soft mb-1 block">Motivo de la Operación</label>
            <select
              value={reasonPreset}
              onChange={(e) => setReasonPreset(e.target.value)}
              className="w-full border border-line p-2.5 rounded-lg outline-none focus:border-brand bg-surface text-sm"
            >
              {COMMON_REASONS[type].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Detalle Opcional */}
          <div>
            <label className="text-xs font-bold text-ink-soft mb-1 block">
              Documento de Referencia / Detalle Adicional
            </label>
            <input
              type="text"
              maxLength={100}
              value={refDetail}
              onChange={(e) => setRefDetail(e.target.value)}
              placeholder="Ej. Acta de merma #402 / Conteo físico mensual"
              className="w-full border border-line p-2.5 rounded-lg outline-none text-sm focus:border-brand"
            />
          </div>
        </div>

        <div className="p-4 bg-surface-muted border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 font-bold text-ink-soft bg-surface-muted hover:bg-line rounded-lg text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSaveMovement}
            disabled={saving}
            className="px-4 py-2 font-bold text-brand-contrast bg-brand hover:bg-brand-strong rounded-lg text-sm shadow-sm transition-colors flex items-center gap-2"
          >
            <i className="fa-solid fa-check"></i>
            {saving ? 'Procesando...' : 'Registrar Movimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}
