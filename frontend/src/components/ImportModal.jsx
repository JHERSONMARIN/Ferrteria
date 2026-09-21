import React, { useMemo, useRef, useState } from 'react';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { readSpreadsheet, rowsToObjects, downloadTemplate, normalizeHeader } from '../utils/spreadsheet.js';

const PAGE_SIZE = 25;
const MAX_ROWS = 2000;
let nextRowId = 1;

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'error', label: 'Con errores' },
  { id: 'warning', label: 'Con advertencias' },
  { id: 'ok', label: 'Correctas' },
];

// Importación desde Excel o CSV en tres pasos: elegir el archivo, revisar cada fila (se pueden
// corregir los datos aquí mismo, quitar filas o elegir cuáles entran) y guardar. Nada se guarda
// hasta confirmar, y el servidor vuelve a validar todo antes de escribir.
//
// columns: [{ key, label, required, aliases, width, placeholder, type: 'text'|'number'|'bool' }]
// validateRow(values) → { errors: { key: msg }, warnings: [msg] }
// uniqueKey: columna que no puede repetirse en el archivo (ej. el código)
// onImport(rowsValues) → { message } | lanza un error con err.data.rows = [{ index, error }]
export default function ImportModal({
  open, onClose, title, entityLabel, columns, examples, templateName, validateRow, uniqueKey, onImport, options,
}) {
  const fileRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState('');
  const [reading, setReading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [serverErrors, setServerErrors] = useState({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => {
    setRows([]); setFileName(''); setReadError(''); setFilter('all'); setPage(0); setServerErrors({}); setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };
  const close = () => { if (importing) return; reset(); onClose(); };

  const handleFile = async (file) => {
    if (!file) return;
    reset();
    setReading(true);
    try {
      const sheet = await readSpreadsheet(file);
      const { rows: parsed, missing } = rowsToObjects(sheet, columns);
      if (missing.length > 0) throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}. Use la plantilla.`);
      if (parsed.length === 0) throw new Error('El archivo no tiene filas con datos.');
      if (parsed.length > MAX_ROWS) throw new Error(`El archivo tiene ${parsed.length} filas; se pueden importar hasta ${MAX_ROWS} por vez.`);
      setFileName(file.name);
      setRows(parsed.map(values => ({ id: nextRowId++, values, selected: true })));
    } catch (err) {
      setReadError(err.message || 'No se pudo leer el archivo.');
    } finally {
      setReading(false);
    }
  };

  // Validación de cada fila + repetidos dentro del archivo + errores que devolvió el servidor.
  const checked = useMemo(() => {
    const counts = new Map();
    if (uniqueKey) {
      rows.forEach(r => {
        const k = normalizeHeader(r.values[uniqueKey]);
        if (k) counts.set(k, (counts.get(k) || 0) + 1);
      });
    }
    return rows.map(r => {
      const { errors = {}, warnings = [] } = validateRow(r.values) || {};
      const all = { ...errors };
      if (uniqueKey && counts.get(normalizeHeader(r.values[uniqueKey])) > 1) {
        all[uniqueKey] = all[uniqueKey] || 'Se repite en el archivo.';
      }
      const messages = Object.values(all).filter(Boolean);
      if (serverErrors[r.id]) messages.push(serverErrors[r.id]);
      const status = messages.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';
      return { ...r, fieldErrors: all, messages, warnings, status };
    });
  }, [rows, validateRow, uniqueKey, serverErrors]);

  const counts = useMemo(() => ({
    all: checked.length,
    error: checked.filter(r => r.status === 'error').length,
    warning: checked.filter(r => r.status === 'warning').length,
    ok: checked.filter(r => r.status === 'ok').length,
  }), [checked]);
  const visible = checked.filter(r => filter === 'all' || r.status === filter);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const importable = checked.filter(r => r.selected && r.status !== 'error');

  const editCell = (id, key, value) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, values: { ...r.values, [key]: value } } : r)));
    setServerErrors(prev => (prev[id] ? { ...prev, [id]: undefined } : prev));
  };
  const toggle = (id) => setRows(prev => prev.map(r => (r.id === id ? { ...r, selected: !r.selected } : r)));
  const removeRow = (id) => setRows(prev => prev.filter(r => r.id !== id));
  const selectWhere = (fn) => setRows(prev => prev.map(r => ({ ...r, selected: fn(checked.find(c => c.id === r.id)) })));
  const removeErrors = () => setRows(prev => prev.filter(r => checked.find(c => c.id === r.id)?.status !== 'error'));

  const handleImport = async () => {
    if (importable.length === 0) return;
    setImporting(true);
    setReadError('');
    setServerErrors({});
    try {
      const res = await onImport(importable.map(r => r.values));
      setResult(res?.message || 'Importación completada.');
      setRows([]);
    } catch (err) {
      const rowErrors = err.data?.rows;
      if (Array.isArray(rowErrors)) {
        const map = {};
        rowErrors.forEach(({ index, error }) => { if (importable[index]) map[importable[index].id] = error; });
        setServerErrors(map);
        setFilter('error');
        setPage(0);
      }
      setReadError(err.message || 'No se pudo importar.');
    } finally {
      setImporting(false);
    }
  };

  const reviewing = rows.length > 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={reviewing ? `${fileName} · ${rows.length} fila${rows.length === 1 ? '' : 's'}` : `Cargue ${entityLabel} desde un Excel o CSV.`}
      icon="fa-file-import"
      size="full"
      footer={reviewing ? (
        <>
          <Button onClick={reset} disabled={importing} className="mr-auto" icon="fa-rotate-left">Otro archivo</Button>
          <Button onClick={close} disabled={importing}>Cancelar</Button>
          <Button variant="primary" icon="fa-upload" loading={importing} disabled={importable.length === 0} onClick={handleImport}>
            Importar {importable.length} {importable.length === 1 ? 'fila' : 'filas'}
          </Button>
        </>
      ) : (
        <Button onClick={close}>Cerrar</Button>
      )}
    >
      {result && (
        <div className="mb-4 bg-success-soft border border-success/30 text-success text-sm rounded-lg p-3 flex gap-2">
          <i className="fa-solid fa-circle-check mt-0.5"></i><span>{result}</span>
        </div>
      )}
      {readError && (
        <div className="mb-4 bg-danger-soft border border-danger/30 text-danger text-sm rounded-lg p-3 flex gap-2">
          <i className="fa-solid fa-circle-exclamation mt-0.5"></i><span>{readError}</span>
        </div>
      )}

      {!reviewing ? (
        <div className="flex flex-col gap-4">
          <label
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
            className="border-2 border-dashed border-line rounded-xl p-8 text-center cursor-pointer hover:border-brand hover:bg-brand-soft/40 transition-colors"
          >
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
            {reading ? (
              <p className="text-sm text-muted"><i className="fa-solid fa-spinner fa-spin mr-2"></i>Leyendo el archivo…</p>
            ) : (
              <>
                <i className="fa-solid fa-file-excel text-3xl text-success mb-2 block"></i>
                <p className="text-sm font-bold text-ink">Elija o arrastre un archivo .xlsx o .csv</p>
                <p className="text-xs text-muted mt-1">Hasta {MAX_ROWS} filas. La primera fila debe tener los nombres de las columnas.</p>
              </>
            )}
          </label>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-muted rounded-xl p-3">
            <div className="text-xs text-ink-soft">
              <p className="font-bold mb-1">Columnas</p>
              <p>
                {columns.map((c, i) => (
                  <span key={c.key}>{i > 0 && ', '}{c.label}{c.required && <span className="text-danger">*</span>}</span>
                ))}
              </p>
            </div>
            <Button size="sm" icon="fa-download" onClick={() => downloadTemplate(templateName, columns, examples)} className="shrink-0">
              Descargar plantilla
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {options}

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setFilter(f.id); setPage(0); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  filter === f.id ? 'bg-brand text-brand-contrast border-brand' : 'bg-surface text-ink-soft border-line hover:bg-surface-muted'
                }`}
              >
                {f.label} ({counts[f.id]})
              </button>
            ))}
            <span className="flex-1" />
            <button type="button" onClick={() => selectWhere(r => r.status !== 'error')} className="text-xs font-bold text-brand hover:underline">
              Solo las correctas
            </button>
            <button type="button" onClick={() => selectWhere(() => false)} className="text-xs font-bold text-muted hover:underline">
              Ninguna
            </button>
            {counts.error > 0 && (
              <button type="button" onClick={removeErrors} className="text-xs font-bold text-danger hover:underline">
                Quitar filas con errores
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-line rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className="px-2 py-2 w-8"></th>
                  <th className="px-2 py-2 text-left w-10">#</th>
                  {columns.map(c => (
                    <th key={c.key} className="px-2 py-2 text-left whitespace-nowrap">
                      {c.label}{c.required && <span className="text-danger">*</span>}
                    </th>
                  ))}
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageRows.length === 0 && (
                  <tr><td colSpan={columns.length + 3} className="px-3 py-6 text-center text-muted">No hay filas en este filtro.</td></tr>
                )}
                {pageRows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr className={r.status === 'error' ? 'bg-danger-soft/40' : r.status === 'warning' ? 'bg-warning-soft/40' : ''}>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={r.selected && r.status !== 'error'}
                          disabled={r.status === 'error'}
                          onChange={() => toggle(r.id)}
                          title={r.status === 'error' ? 'Corrija la fila para poder importarla' : undefined}
                          className="accent-orange-600"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-muted tabular-nums">
                        <i className={`fa-solid mr-1 ${
                          r.status === 'error' ? 'fa-circle-xmark text-danger' : r.status === 'warning' ? 'fa-triangle-exclamation text-warning' : 'fa-circle-check text-success'
                        }`}></i>
                        {rows.findIndex(x => x.id === r.id) + 1}
                      </td>
                      {columns.map(c => (
                        <td key={c.key} className="px-1 py-1">
                          <input
                            value={r.values[c.key]}
                            onChange={e => editCell(r.id, c.key, e.target.value)}
                            placeholder={c.placeholder}
                            title={r.fieldErrors[c.key] || undefined}
                            className={`w-full min-w-[5.5rem] rounded-md border px-2 py-1 bg-surface outline-none focus:border-brand ${
                              r.fieldErrors[c.key] ? 'border-danger' : 'border-transparent hover:border-line'
                            } ${c.type === 'number' ? 'text-right tabular-nums' : ''}`}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-center">
                        <button type="button" onClick={() => removeRow(r.id)} className="text-muted hover:text-danger" title="Quitar fila">
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      </td>
                    </tr>
                    {(r.messages.length > 0 || r.warnings.length > 0) && (
                      <tr className={r.status === 'error' ? 'bg-danger-soft/40' : 'bg-warning-soft/40'}>
                        <td></td>
                        <td colSpan={columns.length + 2} className="px-2 pb-1.5 text-[11px]">
                          {r.messages.map((m, i) => <p key={`e${i}`} className="text-danger font-semibold">{m}</p>)}
                          {r.warnings.map((m, i) => <p key={`w${i}`} className="text-warning">{m}</p>)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Página {page + 1} de {pages}</span>
              <div className="flex gap-1">
                <Button size="sm" icon="fa-chevron-left" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <Button size="sm" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
