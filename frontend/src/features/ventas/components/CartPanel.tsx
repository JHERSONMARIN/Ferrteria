// La venta (o el pedido) en curso: avisos, líneas, cliente y datos del rubro (children), descuento, total y acciones.
import type { ReactNode, RefObject } from 'react';
import { formatSoles } from '../../../shared/utils/currency.ts';
import type { PosCart } from '../hooks/usePosCart.ts';
import type { SaleDiscount } from '../hooks/useSaleDiscount.ts';
import CartLines from './CartLines.tsx';
import DiscountEditor from './DiscountEditor.tsx';

interface Props {
  cart: PosCart;
  discount: SaleDiscount;
  total: number;
  /** Modo directo: se cobra aquí. Si no, el pedido se envía a caja. */
  isDirect: boolean;
  cashClosed: boolean;
  processing: boolean;
  /** Nombre del cliente con lista mayorista (para el aviso), o null. */
  wholesaleCustomer: string | null;
  panelRef: RefObject<HTMLDivElement>;
  actionsRef: RefObject<HTMLDivElement>;
  onPrimary: () => void;
  onQuote: () => void;
  /** Cliente y datos del rubro de la venta. */
  children: ReactNode;
}

export default function CartPanel({
  cart, discount, total, isDirect, cashClosed, processing, wholesaleCustomer, panelRef, actionsRef, onPrimary, onQuote, children,
}: Props) {
  const lines = cart.cart;
  const empty = lines.length === 0;

  return (
    <div
      ref={panelRef}
      className="w-full xl:w-[420px] flex flex-col bg-surface rounded-xl shadow-sm border border-line xl:h-full xl:overflow-hidden shrink-0"
    >
      <div className="px-4 py-3 border-b border-line flex justify-between items-center">
        <h3 className="font-bold text-ink flex items-center gap-2">
          <i className="fa-solid fa-cart-shopping text-brand"></i> {isDirect ? 'Venta actual' : 'Pedido actual'}
          {!empty && (
            <span className="bg-surface-muted text-ink-soft text-xs font-bold px-2 py-0.5 rounded-full">{lines.length} prod.</span>
          )}
        </h3>
        {!empty && (
          <button onClick={cart.askToClear} className="text-xs font-semibold text-muted hover:text-danger transition-colors">
            <i className="fa-solid fa-trash-can mr-1"></i> Vaciar
          </button>
        )}
      </div>

      {cashClosed && (
        <div className="px-4 py-2.5 bg-danger-soft border-b border-danger/30 text-xs text-danger flex items-center gap-2">
          <i className="fa-solid fa-lock"></i>
          <span><strong>Sin turno de caja.</strong> Abra una caja o únase a un turno en "Arqueo de Caja" para poder cobrar.</span>
        </div>
      )}

      {wholesaleCustomer && !cart.loadedQuote && (
        <div className="px-4 py-2 bg-info-soft border-b border-info/30 text-xs text-info">
          <i className="fa-solid fa-tags mr-1.5"></i>
          <strong>Precios mayoristas</strong> de {wholesaleCustomer}.
        </div>
      )}

      {cart.loadedQuote && (
        <div className="px-4 py-2 bg-warning-soft border-b border-warning/30 text-xs text-warning flex justify-between items-center gap-2">
          <span>
            <i className="fa-solid fa-file-invoice mr-1.5"></i>
            Desde la cotización <strong>{cart.loadedQuote.numDoc}</strong>
          </span>
          <button
            onClick={cart.unlinkQuote}
            className="text-warning hover:text-danger font-bold shrink-0 underline"
            title="Se registrará como venta normal y la cotización seguirá pendiente"
          >
            Desvincular
          </button>
        </div>
      )}

      <div className="flex-1 xl:overflow-y-auto px-4 min-h-[140px]">
        <CartLines cart={lines} onSetQty={cart.setQty} onRemove={cart.remove} />
      </div>

      <div ref={actionsRef} className="border-t border-line bg-surface-muted p-4 flex flex-col gap-3 shrink-0">
        {children}

        {discount.allowed && !empty && <DiscountEditor discount={discount} />}

        {discount.applied > 0 && (
          <div className="text-sm text-muted flex flex-col gap-0.5">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatSoles(cart.subtotal)}</span></div>
            <div className="flex justify-between text-success font-semibold">
              <span>Descuento</span><span className="tabular-nums">− {formatSoles(discount.applied)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-between items-end">
          <span className="text-sm text-muted">Total</span>
          <span className="text-3xl font-black text-ink tabular-nums">{formatSoles(total)}</span>
        </div>

        <button
          onClick={onPrimary}
          disabled={processing || empty || cashClosed || Boolean(discount.error)}
          className="w-full bg-brand hover:bg-brand-strong text-brand-contrast font-bold py-3.5 rounded-lg shadow-md transition-colors text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {processing && !isDirect
            ? <><i className="fa-solid fa-spinner fa-spin"></i> Enviando…</>
            : <><i className={`fa-solid ${isDirect ? 'fa-cash-register' : 'fa-paper-plane'}`}></i> {isDirect ? 'Cobrar' : 'Enviar a caja'}</>}
          <kbd className="hidden sm:inline text-[10px] font-bold bg-brand-strong/60 rounded px-1.5 py-0.5">F9</kbd>
        </button>

        <button
          onClick={onQuote}
          disabled={processing || empty}
          className="w-full bg-surface border border-line hover:bg-surface-muted text-ink-soft font-semibold py-2 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className="fa-solid fa-file-pdf mr-1.5 text-muted"></i> Guardar como cotización
        </button>
      </div>
    </div>
  );
}
