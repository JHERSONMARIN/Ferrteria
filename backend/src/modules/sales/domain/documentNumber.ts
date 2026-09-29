// Numeración de comprobantes y cotizaciones. Cada sucursal (establecimiento) emite con sus propias series:
// la primera usa T001/B001/F001 y las siguientes reciben el siguiente código libre de cada letra.
import { AppError } from '@ferresys/shared/errors';
import type { DocType } from './sale.ts';

export class DocumentSeriesError extends AppError {
  static override area = 'SERIE';
}

export const SERIES_PREFIX: Record<DocType, string> = { NOTA_VENTA: 'T', BOLETA: 'B', FACTURA: 'F' };

export const formatDocumentNumber = (series: string, number: number) => `${series}-${String(number).padStart(6, '0')}`;

// Número que sigue al último emitido con esa serie ("T001-000041" → 41).
export const issuedNumber = (numDoc: string | null | undefined, series: string) =>
  numDoc ? parseInt(numDoc.slice(series.length + 1), 10) || 0 : 0;

// Primer código libre para la letra: T001, T002…
export function nextFreeSeriesCode(used: ReadonlySet<string>, prefix: string): string {
  for (let n = 1; n <= 999; n += 1) {
    const code = `${prefix}${String(n).padStart(3, '0')}`;
    if (!used.has(code)) return code;
  }
  throw new DocumentSeriesError(`No quedan series libres para la letra ${prefix}.`);
}

// Cotizaciones: COT-000001, COT-000002… a partir de la última emitida.
export function nextQuoteNumber(lastNumDoc: string | null | undefined): string {
  const last = lastNumDoc ? parseInt(lastNumDoc.replace('COT-', ''), 10) || 0 : 0;
  return `COT-${String(last + 1).padStart(6, '0')}`;
}
