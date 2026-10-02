// Descarga una tabla como CSV. Separador ";" y BOM para que Excel en español la abra bien.
export interface CsvColumn<T> {
  label: string;
  value: (row: T) => unknown;
}

export function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]) {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    columns.map(c => escape(c.label)).join(';'),
    ...rows.map(row => columns.map(c => escape(c.value(row))).join(';')),
  ];
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Número con coma decimal, como lo espera Excel configurado en español.
export const csvNumber = (value: number | string | null | undefined) => String(value ?? 0).replace('.', ',');
