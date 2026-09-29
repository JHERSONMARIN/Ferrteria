import type { Quote } from '@ferresys/contracts/sales';
import { formatSoles } from '../../../shared/utils/currency.ts';

interface Props {
  /** Cotizaciones pendientes. */
  quotes: readonly Quote[];
  onClose: () => void;
  onLoad: (quote: Quote) => void;
}

// Cotizaciones pendientes para cargarlas de vuelta en la venta.
export default function QuotePickerModal({ quotes, onClose, onLoad }: Props) {
  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 bg-panel text-white flex justify-between items-center">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <i className="fa-solid fa-file-import text-brand"></i> Cargar cotización
          </h3>
          <button onClick={onClose} className="text-muted hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          {quotes.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <i className="fa-solid fa-file-circle-check text-4xl mb-3 text-muted"></i>
              <p className="text-sm font-semibold">No hay cotizaciones pendientes</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {quotes.map(q => (
                <li
                  key={q.id}
                  className="border border-line rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:border-brand/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-ink">{q.numDoc}</span>
                      <span className="text-xs text-muted">{q.date}</span>
                    </div>
                    <p className="text-sm text-ink-soft truncate">{q.customer}</p>
                    <p className="text-xs text-muted">{q.detalles.length} producto{q.detalles.length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="font-black text-ink tabular-nums">{formatSoles(q.total)}</span>
                    <button
                      onClick={() => onLoad(q)}
                      className="bg-brand hover:bg-brand-strong text-brand-contrast font-bold px-4 py-2 rounded-lg text-sm shadow-sm"
                    >
                      Cargar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
