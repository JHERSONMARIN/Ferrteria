// Un envío: destino, productos y lo que se puede hacer según su estado y quién lo mira.
import type { Delivery } from '@ferresys/contracts/deliveries';
import { formatSoles } from '../../../shared/utils/currency.ts';

const STATUS_BADGE: Partial<Record<Delivery['status'], { label: string; className: string }>> = {
  ENTREGADO: { label: 'Entregado', className: 'bg-success-soft text-success' },
  CANCELADO: { label: 'Cancelado', className: 'bg-surface-muted text-ink-soft' },
};

const formatTime = (date: string | null) => (date ? new Date(date).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '');
const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export interface DeliveryActions {
  esRepartidor: boolean;
  userId: number | null;
  onClaim: (delivery: Delivery) => void;
  onRelease: (delivery: Delivery) => void;
  onDepart: (delivery: Delivery) => void;
  onDeliver: (delivery: Delivery) => void;
  onCancel: (delivery: Delivery) => void;
}

interface Props extends DeliveryActions {
  delivery: Delivery;
  busy: boolean;
}

export default function DeliveryCard({ delivery, busy, esRepartidor, userId, onClaim, onRelease, onDepart, onDeliver, onCancel }: Props) {
  const active = delivery.status === 'PENDIENTE' || delivery.status === 'EN_CAMINO';
  const badge = STATUS_BADGE[delivery.status as 'ENTREGADO' | 'CANCELADO'];

  return (
    <div className="bg-surface rounded-xl border border-line shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-ink truncate">{delivery.contactName}</p>
          <p className="text-[11px] text-muted font-mono">
            {delivery.ref}{delivery.saleNumDoc && ` · ${delivery.saleNumDoc}`}
          </p>
        </div>
        {badge ? (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge.className}`}>{badge.label}</span>
        ) : delivery.total !== null && (
          <span className="text-xs font-bold text-success bg-success-soft px-2 py-0.5 rounded-full shrink-0">Pagado {formatSoles(delivery.total)}</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <a href={mapsUrl(delivery.address)} target="_blank" rel="noreferrer" className="text-ink-soft hover:text-brand flex gap-2">
          <i className="fa-solid fa-location-dot text-brand mt-0.5"></i>
          <span className="underline decoration-dotted">{delivery.address}</span>
        </a>
        {delivery.contactPhone && (
          <a href={`tel:${delivery.contactPhone}`} className="text-ink-soft hover:text-brand flex gap-2 items-center">
            <i className="fa-solid fa-phone text-brand"></i> {delivery.contactPhone}
          </a>
        )}
        {delivery.notes && (
          <p className="text-xs text-muted bg-surface-muted rounded px-2 py-1"><i className="fa-solid fa-note-sticky mr-1"></i>{delivery.notes}</p>
        )}
      </div>

      <ul className="text-xs text-ink-soft bg-surface-muted rounded-lg p-2 flex flex-col gap-0.5">
        {delivery.items.map((item, i) => (
          <li key={i}><span className="font-bold">{item.qty}×</span> {item.name}</li>
        ))}
      </ul>

      {active ? (
        <>
          {/* Esperando despacho: el pedido sigue en almacén y cualquier repartidor puede pedirlo. */}
          {delivery.waitingDispatch ? (
            <>
              <p className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2">
                <i className="fa-solid fa-hourglass-half mr-1.5"></i>
                {delivery.courier
                  ? <>Lo pidió <span className="font-bold">{delivery.courier.name}</span>. Almacén todavía no lo despacha.</>
                  : 'Esperando que almacén despache los productos.'}
              </p>
              {esRepartidor && (delivery.courier
                ? delivery.courier.id === userId && (
                  <button
                    onClick={() => onRelease(delivery)}
                    disabled={busy}
                    className="text-xs font-semibold text-muted hover:text-danger"
                  >
                    Soltar el pedido (que lo tome otro)
                  </button>
                )
                : (
                  <button
                    onClick={() => onClaim(delivery)}
                    disabled={busy}
                    className="w-full border border-brand text-brand hover:bg-brand-soft font-bold py-2.5 rounded-lg text-sm disabled:opacity-50"
                  >
                    <i className="fa-solid fa-hand mr-1.5"></i>Solicitar este pedido
                  </button>
                ))}
            </>
          ) : delivery.status === 'PENDIENTE' ? (
            <>
              {/* Ya despachado: almacén se lo entregó a este repartidor. */}
              {delivery.courier && (
                <p className="text-xs text-ink-soft flex items-center gap-2">
                  <i className="fa-solid fa-box-open text-brand"></i>
                  Despachado a: <span className="font-semibold text-ink">{delivery.courier.name}</span>
                </p>
              )}
              <button
                onClick={() => onDepart(delivery)}
                disabled={busy}
                className="w-full bg-panel hover:bg-panel-strong text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50"
              >
                <i className="fa-solid fa-truck-fast mr-1.5"></i>Salir a repartir
              </button>
            </>
          ) : (
            <>
              {/* En camino: cerrarlo como entregado o devolverlo a la tienda. */}
              {delivery.courier && (
                <p className="text-xs text-ink-soft flex items-center gap-2">
                  <i className="fa-solid fa-truck-fast text-brand"></i>
                  Lleva: <span className="font-semibold text-ink">{delivery.courier.name}</span>
                </p>
              )}
              <button
                onClick={() => onDeliver(delivery)}
                disabled={busy}
                className="w-full bg-success hover:brightness-95 text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50"
              >
                <i className="fa-solid fa-check mr-1.5"></i>Entregado
              </button>
              {!delivery.legacy && (
                <button onClick={() => onCancel(delivery)} disabled={busy} className="text-xs font-semibold text-muted hover:text-danger">
                  Cancelar envío: regresar los productos a la tienda
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <p className="text-[11px] text-muted">
          {delivery.courier && <>Repartidor: {delivery.courier.name} · </>}
          {delivery.status === 'ENTREGADO' ? `Entregado ${formatTime(delivery.deliveredAt)}` : `Registrado ${formatTime(delivery.createdAt)}`}
        </p>
      )}
    </div>
  );
}
