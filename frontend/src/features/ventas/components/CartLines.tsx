// Líneas del carrito de Vender: precio, presentación, cantidad (con − y +) y quitar.
import { formatSoles } from '../../../shared/utils/currency.ts';
import { formatQuantity, roundQuantity } from '../../../shared/utils/quantities.ts';
import { perUnitLabel, type CartItem } from '../cart.ts';
import CartQtyInput from './CartQtyInput.tsx';

interface Props {
  cart: readonly CartItem[];
  onSetQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
}

export default function CartLines({ cart, onSetQty, onRemove }: Props) {
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
      {cart.map(item => (
        <li key={item.key} className="py-3 flex gap-3">
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
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="text-sm font-black text-ink tabular-nums">{formatSoles(item.price * item.qty)}</span>
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
        </li>
      ))}
    </ul>
  );
}
