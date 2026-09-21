import React from 'react';
import { quantityProblem } from '../utils/quantities.js';

let nextKey = 1;

// Fila vacía del editor (los valores se guardan como texto mientras se escriben).
export const emptySaleUnit = () => ({
  key: `n${nextKey++}`, id: null, name: '', factor: '', price: '', wholesalePrice: '', code: '', allowsFractions: false,
});

// Presentación que viene del servidor → fila del editor.
export const toSaleUnitRow = (u) => ({
  key: `u${u.id}`,
  id: u.id,
  name: u.name,
  factor: String(u.factor),
  price: String(u.price),
  wholesalePrice: u.wholesalePrice != null ? String(u.wholesalePrice) : '',
  code: u.code || '',
  allowsFractions: Boolean(u.allowsFractions),
});

// Fila del editor → lo que espera el servidor.
export const toSaleUnitPayload = (row) => ({
  id: row.id,
  name: row.name.trim(),
  factor: Number(row.factor),
  price: parseFloat(row.price),
  wholesalePrice: row.wholesalePrice === '' ? null : parseFloat(row.wholesalePrice),
  code: row.code.trim() || null,
  allowsFractions: row.allowsFractions,
});

// Errores por fila: { [key]: 'mensaje' }. Mismas reglas que el servidor.
export function validateSaleUnits(rows, baseUnit, productCode) {
  const errors = {};
  const names = new Set([baseUnit.trim().toLowerCase()]);
  const codes = new Set([productCode.trim()]);
  for (const row of rows) {
    const name = row.name.trim();
    const factor = Number(row.factor);
    const price = parseFloat(row.price);
    const wholesale = parseFloat(row.wholesalePrice);
    let msg = '';
    if (!name) msg = 'Escriba el nombre (ej. Paquete, Ciento).';
    else if (names.has(name.toLowerCase())) msg = 'El nombre está repetido o es igual a la unidad base.';
    else if (row.factor === '' || quantityProblem(factor, true)) msg = 'Indique cuántas unidades base trae (mayor a 0).';
    else if (row.price === '' || !(price > 0)) msg = 'El precio debe ser mayor a 0.';
    else if (row.wholesalePrice !== '' && !(wholesale > 0)) msg = 'El precio mayorista debe ser mayor a 0 (o vacío).';
    else if (row.code.trim() && codes.has(row.code.trim())) msg = 'El código está repetido.';
    if (msg) errors[row.key] = msg;
    names.add(name.toLowerCase());
    if (row.code.trim()) codes.add(row.code.trim());
  }
  return errors;
}

const cell = (error) => `w-full border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-brand bg-surface ${error ? 'border-danger' : 'border-line'}`;

// Otras formas de vender el mismo producto: por paquete, por ciento, por kilo… El stock sigue
// en la unidad base; cada presentación dice cuántas unidades base trae y su propio precio.
export default function SaleUnitsEditor({ rows, onChange, baseUnit, basePrice, errors = {}, onScan }) {
  const update = (key, field, value) => onChange(rows.map(r => (r.key === key ? { ...r, [field]: value } : r)));
  const remove = (key) => onChange(rows.filter(r => r.key !== key));

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-muted border-b border-line">
        <div>
          <p className="text-xs font-bold text-ink-soft">Presentaciones de venta</p>
          <p className="text-[11px] text-muted">
            Además de {baseUnit.toLowerCase()}{basePrice ? ` (S/ ${Number(basePrice).toFixed(2)})` : ''}: paquete, ciento, medio ciento, kilo…
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...rows, emptySaleUnit()])}
          disabled={rows.length >= 10}
          className="text-xs font-bold text-brand hover:underline shrink-0 disabled:opacity-50"
        >
          <i className="fa-solid fa-plus mr-1"></i> Agregar
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted px-3 py-3">Solo se vende por {baseUnit.toLowerCase()}.</p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map(row => {
            const factor = Number(row.factor);
            const price = parseFloat(row.price);
            const perUnit = factor > 0 && price > 0 ? price / factor : null;
            return (
              <div key={row.key} className="p-3 flex flex-col gap-2">
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                  <label className="col-span-2 sm:col-span-3">
                    <span className="text-[11px] text-muted">Nombre</span>
                    <input
                      value={row.name}
                      maxLength={40}
                      onChange={e => update(row.key, 'name', e.target.value)}
                      placeholder="Ciento"
                      className={cell(errors[row.key])}
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-[11px] text-muted">Trae ({baseUnit.toLowerCase()})</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={row.factor}
                      onChange={e => update(row.key, 'factor', e.target.value)}
                      placeholder="100"
                      className={cell(errors[row.key])}
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-[11px] text-muted">Precio (S/)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.10"
                      value={row.price}
                      onChange={e => update(row.key, 'price', e.target.value)}
                      className={cell(errors[row.key])}
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-[11px] text-muted">Mayorista</span>
                    <input
                      type="number"
                      min="0"
                      step="0.10"
                      value={row.wholesalePrice}
                      onChange={e => update(row.key, 'wholesalePrice', e.target.value)}
                      placeholder="Opcional"
                      className={cell()}
                    />
                  </label>
                  <label className="col-span-2 sm:col-span-3">
                    <span className="text-[11px] text-muted">Código de barras</span>
                    <div className="flex gap-1">
                      <input
                        value={row.code}
                        maxLength={60}
                        onChange={e => update(row.key, 'code', e.target.value)}
                        placeholder="Opcional"
                        className={`${cell()} font-mono`}
                      />
                      {onScan && (
                        <button
                          type="button"
                          onClick={() => onScan(code => update(row.key, 'code', code))}
                          className="px-2 rounded-lg border border-line text-ink-soft hover:bg-surface-muted"
                          title="Escanear código"
                        >
                          <i className="fa-solid fa-barcode"></i>
                        </button>
                      )}
                    </div>
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.allowsFractions}
                      onChange={e => update(row.key, 'allowsFractions', e.target.checked)}
                      className="accent-orange-600"
                    />
                    Se vende con decimales (ej. 0.5 {row.name.trim().toLowerCase() || 'kilo'})
                  </label>
                  <div className="flex items-center gap-3">
                    {perUnit !== null && (
                      <span className="text-[11px] text-muted">
                        S/ {perUnit.toFixed(perUnit < 0.1 ? 4 : 2)} por {baseUnit.toLowerCase()}
                      </span>
                    )}
                    <button type="button" onClick={() => remove(row.key)} className="text-xs text-muted hover:text-danger">
                      <i className="fa-solid fa-trash-can mr-1"></i> Quitar
                    </button>
                  </div>
                </div>
                {errors[row.key] && (
                  <p className="text-[11px] text-danger font-semibold">
                    <i className="fa-solid fa-circle-exclamation mr-1"></i>{errors[row.key]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
