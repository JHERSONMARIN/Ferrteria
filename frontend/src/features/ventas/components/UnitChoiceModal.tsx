import type { Product, SaleUnit } from '@ferresys/contracts/catalog';
import { Modal } from '../../../shared/ui/index.ts';
import { formatSoles } from '../../../shared/utils/currency.ts';
import { formatQuantity } from '../../../shared/utils/quantities.ts';
import { availableStock, priceFor } from '../cart.ts';

interface Props {
  /** Producto con varias presentaciones esperando que se elija en cuál se vende. */
  product: Product | null;
  /** Unidades base de ese producto que ya están en el carrito. */
  inCart: number;
  wholesale: boolean;
  onClose: () => void;
  /** unit null = la unidad base. */
  onChoose: (product: Product, unit: SaleUnit | null) => void;
}

export default function UnitChoiceModal({ product, inCart, wholesale, onClose, onChoose }: Props) {
  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      title={product?.name}
      description="¿En qué presentación lo vende?"
      icon="fa-layer-group"
      size="sm"
    >
      {product && (
        <div className="flex flex-col gap-2">
          {[null, ...product.saleUnits].map(unit => {
            const left = availableStock(product) - inCart;
            const factor = unit ? unit.factor : 1;
            const enough = left + 1e-9 >= factor;
            return (
              <button
                key={unit?.id ?? 'base'}
                type="button"
                disabled={!enough}
                onClick={() => onChoose(product, unit)}
                className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-left hover:border-brand hover:bg-brand-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>
                  <span className="block text-sm font-bold text-ink">{unit ? unit.name : product.unit}</span>
                  <span className="block text-[11px] text-muted">
                    {unit ? `${formatQuantity(unit.factor)} ${product.unit.toLowerCase()}` : 'Unidad base'}
                    {!enough && ' · sin stock suficiente'}
                  </span>
                </span>
                <span className="text-base font-black text-ink tabular-nums">{formatSoles(priceFor(product, wholesale, unit))}</span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
