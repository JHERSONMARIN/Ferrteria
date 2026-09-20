import React from 'react';

// Los valores se guardan en céntimos para evitar errores de redondeo con decimales.
export const DENOMINACIONES = [
  { centimos: 20000, label: 'S/ 200', tipo: 'BILLETE' },
  { centimos: 10000, label: 'S/ 100', tipo: 'BILLETE' },
  { centimos: 5000, label: 'S/ 50', tipo: 'BILLETE' },
  { centimos: 2000, label: 'S/ 20', tipo: 'BILLETE' },
  { centimos: 1000, label: 'S/ 10', tipo: 'BILLETE' },
  { centimos: 500, label: 'S/ 5', tipo: 'MONEDA' },
  { centimos: 200, label: 'S/ 2', tipo: 'MONEDA' },
  { centimos: 100, label: 'S/ 1', tipo: 'MONEDA' },
  { centimos: 50, label: 'S/ 0.50', tipo: 'MONEDA' },
  { centimos: 20, label: 'S/ 0.20', tipo: 'MONEDA' },
  { centimos: 10, label: 'S/ 0.10', tipo: 'MONEDA' },
];

export function calcularTotalConteo(conteo) {
  const totalCentimos = DENOMINACIONES.reduce(
    (sum, d) => sum + d.centimos * (parseInt(conteo[d.centimos], 10) || 0),
    0
  );
  return totalCentimos / 100;
}

export function contarPiezas(conteo, tipo) {
  return DENOMINACIONES
    .filter(d => d.tipo === tipo)
    .reduce((sum, d) => sum + (parseInt(conteo[d.centimos], 10) || 0), 0);
}

function FilaDenominacion({ den, cantidad, onCantidadChange }) {
  const cant = parseInt(cantidad, 10) || 0;
  const subtotal = (den.centimos * cant) / 100;

  return (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${cant > 0 ? 'bg-brand-soft' : ''}`}>
      <span className="w-16 sm:w-20 text-xs font-bold text-ink-soft shrink-0">{den.label}</span>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onCantidadChange(Math.max(0, cant - 1))}
          className="w-7 h-7 bg-surface-muted hover:bg-line rounded text-ink-soft font-bold text-sm transition-colors"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={cantidad ?? ''}
          onChange={e => {
            const limpio = e.target.value.replace(/\D/g, '').slice(0, 4);
            onCantidadChange(limpio === '' ? '' : parseInt(limpio, 10));
          }}
          placeholder="0"
          className="w-12 text-center border border-line rounded py-1 text-sm font-bold outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => onCantidadChange(cant + 1)}
          className="w-7 h-7 bg-surface-muted hover:bg-line rounded text-ink-soft font-bold text-sm transition-colors"
        >
          +
        </button>
      </div>

      <span className={`flex-1 text-right text-xs font-bold tabular-nums ${cant > 0 ? 'text-ink' : 'text-muted'}`}>
        S/ {subtotal.toFixed(2)}
      </span>
    </div>
  );
}

export default function ContadorEfectivo({ conteo, onChange }) {
  const total = calcularTotalConteo(conteo);
  const totalBilletes = contarPiezas(conteo, 'BILLETE');
  const totalMonedas = contarPiezas(conteo, 'MONEDA');

  const setCantidad = (centimos, cantidad) => {
    onChange({ ...conteo, [centimos]: cantidad });
  };

  const limpiar = () => onChange({});

  const billetes = DENOMINACIONES.filter(d => d.tipo === 'BILLETE');
  const monedas = DENOMINACIONES.filter(d => d.tipo === 'MONEDA');

  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface">
      <div className="flex justify-between items-center px-3 py-2 bg-surface-muted border-b border-line">
        <span className="text-xs font-bold text-ink-soft uppercase tracking-wide">
          <i className="fa-solid fa-calculator mr-1.5 text-brand"></i>
          Conteo de Efectivo
        </span>
        <button
          type="button"
          onClick={limpiar}
          className="text-[11px] font-bold text-muted hover:text-danger transition-colors"
        >
          <i className="fa-solid fa-eraser mr-1"></i> Limpiar
        </button>
      </div>

      {/* En lg la columna del contador se angosta, por eso vuelve a una sola columna hasta xl. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-x-4 p-3">
        <div>
          <p className="text-[11px] font-bold text-muted uppercase px-2 mb-1">
            Billetes ({totalBilletes})
          </p>
          {billetes.map(den => (
            <FilaDenominacion
              key={den.centimos}
              den={den}
              cantidad={conteo[den.centimos]}
              onCantidadChange={c => setCantidad(den.centimos, c)}
            />
          ))}
        </div>

        <div className="mt-3 md:mt-0 lg:mt-3 xl:mt-0">
          <p className="text-[11px] font-bold text-muted uppercase px-2 mb-1">
            Monedas ({totalMonedas})
          </p>
          {monedas.map(den => (
            <FilaDenominacion
              key={den.centimos}
              den={den}
              cantidad={conteo[den.centimos]}
              onCantidadChange={c => setCantidad(den.centimos, c)}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center px-4 py-3 bg-nav text-white">
        <div className="flex flex-col">
          <span className="text-xs font-semibold">Total Contado</span>
          <span className="text-[10px] text-muted">
            {totalBilletes} billete{totalBilletes === 1 ? '' : 's'} · {totalMonedas} moneda{totalMonedas === 1 ? '' : 's'}
          </span>
        </div>
        <span className="text-2xl font-black text-brand tabular-nums">S/ {total.toFixed(2)}</span>
      </div>
    </div>
  );
}
