// Descuento sobre el total de la venta: se calcula igual que en el servidor, que es quien valida el tope.
import { useState } from 'react';
import type { DiscountRequest } from '@ferresys/contracts/sales';
import { roundMoney } from '../../../shared/utils/quantities.ts';

export type DiscountType = 'PERCENT' | 'AMOUNT';

// isAdmin: el administrador no tiene tope; el resto descuenta hasta maxPercent.
export function useSaleDiscount(subtotal: number, isAdmin: boolean, maxPercent: number) {
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
    if (!isAdmin && amount > roundMoney(subtotal * maxPercent / 100)) return `Su descuento máximo es ${maxPercent} %.`;
    return '';
  })();
  const applied = error ? 0 : amount;
  // Lo que viaja al servidor.
  const payload: DiscountRequest | null = applied > 0 ? { type, value: number } : null;

  const clear = () => {
    setOpen(false);
    setValue('');
  };

  return {
    allowed, isAdmin, maxPercent, open, type, value, error, applied, payload,
    show: () => setOpen(true), setType, setValue, clear,
  };
}

export type SaleDiscount = ReturnType<typeof useSaleDiscount>;
