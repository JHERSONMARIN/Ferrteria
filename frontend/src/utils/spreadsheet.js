// Lectura de planillas para las importaciones y descarga de sus plantillas. Las librerías se cargan
// solo cuando se usan, para no pesar en el resto del sistema.

const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Nombre de columna comparable: sin tildes, mayúsculas, espacios ni signos.
export const normalizeHeader = (text) => String(text ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// CSV con ";" (Excel en español) o ",": respeta comillas y saltos de línea dentro de ellas.
function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Devuelve las filas de la primera hoja como arreglos de celdas (texto o número).
export async function readSpreadsheet(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo pesa más de 5 MB.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(await file.text());
  if (!name.endsWith('.xlsx')) throw new Error('Use un archivo Excel (.xlsx) o CSV. Los .xls antiguos se deben guardar como .xlsx.');
  const { readSheet } = await import('read-excel-file/browser');
  return readSheet(file);
}

// Convierte las filas leídas en objetos según las columnas esperadas ({ key, label, aliases }).
// Las filas totalmente vacías se descartan. Devuelve también las columnas obligatorias que faltan.
export function rowsToObjects(sheetRows, columns) {
  const [header = [], ...body] = sheetRows;
  const headerKeys = header.map(normalizeHeader);
  const indexOf = {};
  for (const col of columns) {
    const names = [col.label, ...(col.aliases || [])].map(normalizeHeader);
    const idx = headerKeys.findIndex(h => names.includes(h));
    if (idx >= 0) indexOf[col.key] = idx;
  }
  const missing = columns.filter(c => c.required && indexOf[c.key] === undefined).map(c => c.label);
  const rows = body
    .filter(cells => cells.some(c => c !== null && c !== undefined && String(c).trim() !== ''))
    .map(cells => Object.fromEntries(columns.map(col => {
      const value = indexOf[col.key] === undefined ? '' : cells[indexOf[col.key]];
      return [col.key, value === null || value === undefined ? '' : String(value).trim()];
    })));
  return { rows, missing };
}

// Descarga una plantilla .xlsx con los encabezados y filas de ejemplo.
export async function downloadTemplate(fileName, columns, examples = []) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const header = columns.map(c => ({ value: c.label, fontWeight: 'bold', backgroundColor: '#F3F4F6' }));
  const data = [header, ...examples.map(ex => columns.map(c => (ex[c.key] ?? null)))];
  await writeExcelFile(data, { columns: columns.map(c => ({ width: c.width || 18 })) }).toFile(fileName);
}
