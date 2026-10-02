// Descuento sobre el total: botón para abrirlo, tipo (% o S/), valor y el tope de quien vende.
import type { SaleDiscount } from '../hooks/useSaleDiscount.ts';

export default function DiscountEditor({ discount }: { discount: SaleDiscount }) {
  if (!discount.open) {
    return (
      <button
        type="button"
        onClick={discount.show}
        className="self-start text-xs font-semibold text-brand-text hover:text-brand-text hover:underline"
      >
        <i className="fa-solid fa-percent mr-1.5"></i> Aplicar descuento
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Descuento</span>
        <div className="flex rounded-md border border-line overflow-hidden text-xs font-bold">
          {([['PERCENT', '%'], ['AMOUNT', 'S/']] as const).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => discount.setType(type)}
              className={`px-2.5 py-1 ${discount.type === type ? 'bg-panel text-white' : 'bg-surface text-ink-soft hover:bg-surface-muted'}`}
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
          value={discount.value}
          onChange={e => discount.setValue(e.target.value)}
          placeholder="0"
          className={`w-20 px-2 py-1 border rounded-md text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand ${discount.error ? 'border-danger' : 'border-line'}`}
        />
        <button type="button" onClick={discount.clear} title="Quitar descuento" className="ml-auto text-muted hover:text-danger px-1">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
      {discount.error
        ? <p className="text-xs text-danger mt-1">{discount.error}</p>
        : !discount.isAdmin && <p className="text-[11px] text-muted mt-1">Hasta {discount.maxPercent} % del total.</p>}
    </div>
  );
}
