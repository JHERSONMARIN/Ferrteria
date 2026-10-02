// Líneas del carrito de Vender: precio, presentación, cantidad (con − y +), descuento de la línea y quitar.
import { formatSoles } from '../../../shared/utils/currency.ts';
import { formatQuantity, roundQuantity } from '../../../shared/utils/quantities.ts';
import { lineDiscount, lineGross, perUnitLabel, type CartItem, type LineDiscountDraft } from '../cart.ts';
import CartQtyInput from './CartQtyInput.tsx';

interface Props {
  cart: readonly CartItem[];
  onSetQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  /** Sin permiso para descontar no se ofrece el descuento por línea. */
  allowDiscount: boolean;
  onSetDiscount: (key: string, discount: LineDiscountDraft | null) => void;
}

export default function CartLines({ cart, onSetQty, onRemove, allowDiscount, onSetDiscount }: Props) {
  if (cart.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-muted py-10">
        <i className="fa-solid fa-basket-shopping text-4xl mb-3 text-nav-ink"></i>
        <p className="text-sm font-semibold text-muted">Aún no hay productos</p>
        <p className="text-xs mt-1">Toque un producto del catálogo o escanee su código.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {cart.map(item => {
        const gross = lineGross(item);
        const discount = lineDiscount(item);
        return (
          <li key={item.key} className="py-3 flex flex-wrap gap-x-3 gap-y-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink leading-snug line-clamp-2">{item.name}</p>
              <p className="text-xs text-muted mt-0.5">
                {formatSoles(item.price)} {perUnitLabel(item.unit)}
                {item.unitName && (
                  <span className="ml-1 text-[10px] font-bold text-brand-text bg-brand-soft rounded px-1 py-0.5">
                    {item.unitName} · {formatQuantity(item.factor)} u.
                  </span>
                )}
              </p>
              {allowDiscount && !item.discount && (
                <button
                  type="button"
                  onClick={() => onSetDiscount(item.key, { type: 'PERCENT', value: '' })}
                  className="text-[11px] font-semibold text-brand-text hover:underline mt-1"
                >
                  <i className="fa-solid fa-percent mr-1"></i>Descuento
                </button>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className="text-sm font-black text-ink tabular-nums text-right">
                {discount.amount > 0 && <span className="block text-[11px] font-semibold text-muted line-through">{formatSoles(gross)}</span>}
                {formatSoles(gross - discount.amount)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onSetQty(item.key, roundQuantity(item.qty - 1))}
                  disabled={item.qty <= 1}
                  className="w-7 h-7 rounded-md bg-surface-muted hover:bg-surface-muted text-ink-soft font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Quitar uno"
                >
                  −
                </button>
                <CartQtyInput item={item} onCommit={qty => onSetQty(item.key, qty)} />
                <button
                  onClick={() => onSetQty(item.key, roundQuantity(item.qty + 1))}
                  className="w-7 h-7 rounded-md bg-surface-muted hover:bg-surface-muted text-ink-soft font-bold"
                  title="Agregar uno"
                >
                  +
                </button>
                <button
                  onClick={() => onRemove(item.key)}
                  className="w-7 h-7 rounded-md text-muted hover:text-danger hover:bg-danger-soft ml-1"
                  title="Eliminar producto"
                >
                  <i className="fa-solid fa-trash-can text-xs"></i>
                </button>
              </div>
            </div>
            {item.discount && (
              <LineDiscountEditor
                draft={item.discount}
                amount={discount.amount}
                error={discount.error}
                onChange={draft => onSetDiscount(item.key, draft)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Descuento de una línea: % o S/, el valor y cuánto descuenta.
function LineDiscountEditor({ draft, amount, error, onChange }: {
  draft: LineDiscountDraft; amount: number; error: string; onChange: (draft: LineDiscountDraft | null) => void;
}) {
  return (
    <div className="basis-full flex flex-wrap items-center gap-2 text-xs">
      <span className="font-bold text-muted">Desc.</span>
      <div className="flex rounded-md border border-line overflow-hidden font-bold">
        {([['PERCENT', '%'], ['AMOUNT', 'S/']] as const).map(([type, label]) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange({ ...draft, type })}
            className={`px-2 py-0.5 ${draft.type === type ? 'bg-panel text-white' : 'bg-surface text-ink-soft hover:bg-surface-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="number"
        min="0"
        step="0.01"
        autoFocus
        value={draft.value}
        onChange={e => onChange({ ...draft, value: e.target.value })}
        placeholder="0"
        aria-label="Descuento de la línea"
        className={`w-16 px-1.5 py-0.5 border rounded-md text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand ${error ? 'border-danger' : 'border-line'}`}
      />
      {error
        ? <span className="text-danger">{error}</span>
        : amount > 0 && <span className="text-success font-semibold">− {formatSoles(amount)}</span>}
      <button type="button" onClick={() => onChange(null)} title="Quitar descuento" className="ml-auto text-muted hover:text-danger px-1">
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
}
