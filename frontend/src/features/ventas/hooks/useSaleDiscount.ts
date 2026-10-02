// Descuento sobre el total de la venta: se calcula igual que en el servidor, que es quien valida el tope.
// El tope de quien no es administrador suma este descuento y los de las líneas (lineDiscounts), sobre el
// importe sin descuentos.
import { useState } from 'react';
import type { DiscountRequest } from '@ferresys/contracts/sales';
import { roundMoney } from '../../../shared/utils/quantities.ts';

export type DiscountType = 'PERCENT' | 'AMOUNT';

// isAdmin: el administrador no tiene tope; el resto descuenta hasta maxPercent.
// subtotal: la suma de las líneas ya con sus descuentos.
export function useSaleDiscount(subtotal: number, isAdmin: boolean, maxPercent: number, lineDiscounts = 0) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DiscountType>('PERCENT');
  const [value, setValue] = useState('');

  const allowed = isAdmin || maxPercent > 0;
  const number = Number(value) || 0;
  const amount = number > 0 ? roundMoney(type === 'PERCENT' ? subtotal * number / 100 : number) : 0;
  const error = (() => {
    if (value === '') return '';
    if (!Number.isFinite(Number(value)) || Number(value) < 0) return 'Ingrese un valor válido.';
    if (type === 'PERCENT' && number > 100) return 'No puede superar el 100 %.';
    if (amount > 0 && amount >= subtotal) return 'No puede cubrir todo el total.';
    return '';
  })();
  const applied = error ? 0 : amount;
  // Tope: todo lo descontado (líneas y total) frente al importe sin descuentos.
  const overCap = !isAdmin && roundMoney(applied + lineDiscounts) > roundMoney((subtotal + lineDiscounts) * maxPercent / 100)
    ? `Su descuento máximo es ${maxPercent} %${lineDiscounts > 0 ? ', sumando el de las líneas' : ''}.`
    : '';
  // Lo que viaja al servidor.
  const payload: DiscountRequest | null = applied > 0 ? { type, value: number } : null;

  const clear = () => {
    setOpen(false);
    setValue('');
  };

  return {
    allowed, isAdmin, maxPercent, open, type, value, error, overCap, applied, payload,
    show: () => setOpen(true), setType, setValue, clear,
  };
}

export type SaleDiscount = ReturnType<typeof useSaleDiscount>;
