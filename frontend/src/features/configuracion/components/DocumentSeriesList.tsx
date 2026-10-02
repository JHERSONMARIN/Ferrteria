// Series de comprobantes con su último número emitido (y su sucursal, si hay varias).
import type { DocumentSeries, DocumentType } from '@ferresys/contracts/settings';

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  NOTA_VENTA: 'Nota de venta',
  BOLETA: 'Boleta',
  FACTURA: 'Factura',
};

export default function DocumentSeriesList({ documentSeries }: { documentSeries: readonly DocumentSeries[] }) {
  return (
    <>
      <p className="text-xs font-bold text-ink-soft mb-2">Series de comprobantes</p>
      {documentSeries.length === 0 ? (
        <p className="text-xs text-muted">Las series se crean automáticamente al iniciar el servidor.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {documentSeries.map(s => (
            <div key={s.id} className="border border-line rounded-lg px-3 py-2 bg-surface-muted">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted">{DOCUMENT_TYPE_LABELS[s.documentType] ?? s.documentType}</span>
                {!s.isActive && <span className="text-[10px] font-bold text-muted">INACTIVA</span>}
              </div>
              <p className="font-mono font-bold text-ink">{s.series}</p>
              {new Set(documentSeries.map(x => x.branchId)).size > 1 && s.branch && (
                <p className="text-[11px] text-muted"><i className="fa-solid fa-store mr-1"></i>{s.branch.name}</p>
              )}
              <p className="text-[11px] text-muted">
                Último emitido: <span className="font-mono">{String(s.lastNumber).padStart(6, '0')}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
