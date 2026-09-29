// Detalle de una compra del historial, con la base imponible y el IGV.
import type { Purchase } from '@ferresys/contracts/purchasing';

const IGV_RATE = 0.18;

interface Props {
  compra: Purchase;
  onClose: () => void;
}

export default function PurchaseDetailModal({ compra, onClose }: Props) {
  const totalConIgv = compra.total || 0;
  const baseImponible = totalConIgv / (1 + IGV_RATE);
  const igv = totalConIgv - baseImponible;
  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 bg-panel text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-lg"><i className="fa-solid fa-file-invoice-dollar mr-2"></i> Detalle de Compra</h3>
            <p className="text-muted text-xs mt-0.5">
              {compra.numDoc} · {compra.provider}
              <span className="text-muted"> ({compra.providerRuc})</span> · {compra.date}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-surface-muted">
          <table className="w-full text-left border-collapse bg-surface shadow-sm rounded-lg overflow-hidden">
            <thead className="bg-surface-muted text-muted text-xs uppercase">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Costo Unit. (S/)</th>
                <th className="px-3 py-2 text-right">Subtotal (S/)</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-line">
              {compra.detalles.map((d, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 font-mono text-xs">{d.producto.code}</td>
                  <td className="px-3 py-2 font-semibold text-ink">{d.producto.name}</td>
                  <td className="px-3 py-2 text-right font-bold">{d.quantity}</td>
                  <td className="px-3 py-2 text-right">S/ {d.unitPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-bold text-ink">S/ {d.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-surface border-t shrink-0">
          <div className="ml-auto w-full max-w-xs text-sm">
            <div className="flex justify-between py-1 text-ink-soft">
              <span>Op. Gravada:</span>
              <span className="font-semibold">S/ {baseImponible.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 text-ink-soft">
              <span>IGV (18%):</span>
              <span className="font-semibold">S/ {igv.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2 border-t mt-1 text-ink font-black text-lg">
              <span>Total:</span>
              <span className="text-brand">S/ {totalConIgv.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
