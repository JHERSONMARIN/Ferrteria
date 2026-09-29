// Programar el envío de una venta ya cobrada, buscándola por su comprobante.
import { useState } from 'react';
import type { DeliveryScheduled, SaleForDelivery, ScheduleDeliveryRequest } from '@ferresys/contracts/deliveries';
import { api } from '../../../api/client.ts';
import FieldError from '../../../shared/ui/FieldError.tsx';
import { borderClass } from '../../../shared/utils/validators.ts';
import { formatSoles } from '../../../shared/utils/currency.ts';

interface Props {
  onClose: () => void;
  onScheduled: (numDoc: string) => void;
}

export default function ScheduleDeliveryModal({ onClose, onScheduled }: Props) {
  const [numDoc, setNumDoc] = useState('');
  const [sale, setSale] = useState<SaleForDelivery | null>(null);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const search = async () => {
    setError('');
    setSale(null);
    if (!numDoc.trim()) {
      setError('Ingrese el número de comprobante.');
      return;
    }
    try {
      setWorking(true);
      const found = await api.get<SaleForDelivery>(`/entregas/venta/${encodeURIComponent(numDoc.trim())}`);
      if (found.existingDelivery) {
        setError(`Esta venta ya tiene el envío ${found.existingDelivery}.`);
        return;
      }
      setSale(found);
      setAddress(found.customer?.address || '');
      setPhone(found.customer?.phone || '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const schedule = async () => {
    setError('');
    if (!sale) return;
    if (address.trim().length < 5) {
      setError('Ingrese la dirección de entrega.');
      return;
    }
    try {
      setWorking(true);
      await api.post<DeliveryScheduled>('/entregas', {
        numDoc: sale.numDoc,
        address: address.trim(),
        contactName: sale.customer?.name || null,
        contactPhone: phone.trim() || null,
        notes: notes.trim() || null,
      } satisfies ScheduleDeliveryRequest);
      onScheduled(sale.numDoc);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm sm:p-4">
      <div className="bg-surface sm:rounded-xl rounded-t-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-5 py-4 bg-panel text-white flex justify-between items-center">
          <h3 className="font-bold"><i className="fa-solid fa-truck-ramp-box mr-2 text-brand"></i>Programar envío de una venta</h3>
          <button onClick={onClose} className="text-muted hover:text-white"><i className="fa-solid fa-xmark text-xl"></i></button>
        </div>
        <div className="p-5 flex flex-col gap-3 overflow-y-auto">
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Comprobante de la venta</label>
            <div className="flex gap-2">
              <input
                autoFocus
                value={numDoc}
                onChange={e => { setNumDoc(e.target.value.toUpperCase()); setSale(null); setError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') search(); }}
                placeholder="Ej. B001-000038"
                className="flex-1 border border-line rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-brand"
              />
              <button onClick={search} disabled={working} className="px-4 rounded-lg bg-panel text-white text-sm font-bold disabled:opacity-50">Buscar</button>
            </div>
          </div>

          {sale && (
            <>
              <div className="rounded-lg bg-surface-muted border border-line p-3 text-sm">
                <p className="font-bold text-ink">{sale.customer?.name || 'Público general'} · {formatSoles(sale.total)}</p>
                <p className="text-xs text-muted">{sale.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Dirección de entrega</label>
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  maxLength={250}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none ${borderClass(error && address.trim().length < 5 ? error : '')}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} placeholder="Teléfono" className="border border-line rounded-lg px-3 py-2 text-sm outline-none" />
                <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} placeholder="Indicaciones" className="border border-line rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
            </>
          )}
          <FieldError msg={error} />
        </div>
        <div className="p-4 border-t border-line bg-surface-muted flex gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg bg-surface-muted text-ink-soft font-bold text-sm">Cancelar</button>
          <button
            onClick={schedule}
            disabled={!sale || working}
            className="flex-1 py-2.5 rounded-lg bg-brand hover:bg-brand-strong text-brand-contrast font-bold text-sm disabled:opacity-50"
          >
            Programar envío
          </button>
        </div>
      </div>
    </div>
  );
}
