import { useEffect, useState } from 'react';
import { formatQuantity, quantityProblem } from '../../../shared/utils/quantities.ts';
import type { CartItem } from '../cart.ts';

interface Props {
  item: CartItem;
  onCommit: (qty: number) => void;
}

// Cantidad editable: se confirma al salir del campo o con Enter, para poder escribir "2.5"
// sin que el valor se corrija a mitad de camino.
export default function CartQtyInput({ item, onCommit }: Props) {
  const [draft, setDraft] = useState(formatQuantity(item.qty));
  useEffect(() => { setDraft(formatQuantity(item.qty)); }, [item.qty]);

  const commit = () => {
    const value = Number(draft.replace(',', '.'));
    if (quantityProblem(value, item.allowsFractions)) setDraft(formatQuantity(item.qty));
    else onCommit(value);
  };

  return (
    <input
      type="text"
      inputMode={item.allowsFractions ? 'decimal' : 'numeric'}
      value={draft}
      onFocus={e => e.target.select()}
      onChange={e => setDraft(e.target.value.replace(item.allowsFractions ? /[^0-9.,]/g : /\D/g, ''))}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`${item.allowsFractions ? 'w-16' : 'w-11'} h-7 text-center border border-line rounded-md text-sm font-bold outline-none focus:border-brand`}
      title={item.allowsFractions ? 'Admite decimales (hasta 3)' : undefined}
    />
  );
}
