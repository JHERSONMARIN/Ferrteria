// Entregas: los envíos a domicilio por estado. El repartidor los pide, sale a repartir y los cierra.
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssignCourierRequest, CancelDeliveryRequest, Delivery } from '@ferresys/contracts/deliveries';
import type { SessionUser } from '@ferresys/contracts/identity';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { useConfirm } from '../../shared/ui/index.ts';
import DeliveryCard, { type DeliveryActions } from './components/DeliveryCard.tsx';
import CancelDeliveryModal from './components/CancelDeliveryModal.tsx';
import ScheduleDeliveryModal from './components/ScheduleDeliveryModal.tsx';

const REFRESH_MS = 5000;

interface ColumnProps {
  title: string;
  icon: string;
  deliveries: Delivery[];
  emptyText: string;
  renderCard: (delivery: Delivery) => ReactNode;
}

function Column({ title, icon, deliveries, emptyText, renderCard }: ColumnProps) {
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <h3 className="text-sm font-bold text-ink-soft flex items-center gap-2">
        <i className={`fa-solid ${icon} text-brand`}></i>{title}
        <span className="bg-surface-muted text-ink-soft text-[11px] px-2 py-0.5 rounded-full">{deliveries.length}</span>
      </h3>
      {deliveries.length === 0 ? (
        <p className="text-xs text-muted border border-dashed border-line rounded-xl p-4 text-center">{emptyText}</p>
      ) : deliveries.map(renderCard)}
    </section>
  );
}

type View = 'activas' | 'finalizadas';
type Notice = { type: 'success' | 'warning'; text: string };

export default function EntregasPage({ currentUser }: { currentUser: SessionUser }) {
  const confirmar = useConfirm();
  const queryClient = useQueryClient();
  const isCourier = currentUser.role === 'REPARTIDOR';
  const [view, setView] = useState<View>('activas');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [cancelling, setCancelling] = useState<Delivery | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Se consulta cada pocos segundos y al volver a la pantalla (el repartidor la deja en segundo plano).
  const deliveriesQuery = useQuery({
    queryKey: [...queryKeys.deliveries, view],
    queryFn: () => api.get<Delivery[]>(`/entregas?estado=${view}`),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const deliveries = deliveriesQuery.data ?? [];
  const loadError = deliveriesQuery.error ? deliveriesQuery.error.message || 'No se pudieron cargar las entregas.' : '';
  const load = () => queryClient.invalidateQueries({ queryKey: queryKeys.deliveries });

  // Mantiene la pantalla encendida mientras el repartidor tiene abierta la lista.
  useEffect(() => {
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(lock => { wakeLockRef.current = lock; }).catch(() => {});
    }
    return () => { wakeLockRef.current?.release(); };
  }, []);

  const run = async (delivery: Delivery, action: () => Promise<unknown>, successText: string) => {
    try {
      setBusyId(delivery.id);
      await action();
      if (successText) setNotice({ type: 'success', text: successText });
    } catch (err) {
      setNotice({ type: 'warning', text: (err as Error).message || 'No se pudo completar la acción.' });
    } finally {
      await load();
      setBusyId(null);
    }
  };

  const cardProps: DeliveryActions = {
    esRepartidor: isCourier,
    userId: currentUser.id,
    onClaim: (d) => run(d, () => api.patch<Delivery>(`/entregas/${d.id}/repartidor`, { repartidorId: currentUser.id } satisfies AssignCourierRequest),
      `${d.ref} queda a su nombre: almacén se lo entregará a usted.`),
    onRelease: (d) => run(d, () => api.patch<Delivery>(`/entregas/${d.id}/repartidor`, { repartidorId: null } satisfies AssignCourierRequest),
      `${d.ref} quedó libre para otro repartidor.`),
    onDepart: (d) => run(d, () => api.post(`/entregas/${d.id}/salir`, {}), `${d.ref} en camino.`),
    onDeliver: async (d) => {
      const seguro = await confirmar({
        title: 'Marcar como entregado',
        description: `${d.ref} fue entregado a ${d.contactName}.`,
        confirmText: 'Sí, se entregó',
      });
      if (seguro) {
        run(d, () => api.post(`/entregas/${d.id}/entregar`, {}), `${d.ref} entregado.`);
      }
    },
    onCancel: (d) => setCancelling(d),
  };
  const renderCard = (d: Delivery) => <DeliveryCard key={d.id} delivery={d} {...cardProps} busy={busyId === d.id} />;

  const waiting = deliveries.filter(d => d.status === 'PENDIENTE' && d.waitingDispatch);
  const ready = deliveries.filter(d => d.status === 'PENDIENTE' && !d.waitingDispatch);
  const onTheWay = deliveries.filter(d => d.status === 'EN_CAMINO');

  return (
    <div className="tab-content active h-full p-3 sm:p-4 overflow-y-auto">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg border border-line bg-surface overflow-hidden text-sm font-bold">
            {([{ id: 'activas', label: 'Activas' }, { id: 'finalizadas', label: 'Finalizadas (7 días)' }] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`px-4 py-2 ${view === tab.id ? 'bg-brand text-brand-contrast' : 'text-ink-soft hover:bg-surface-muted'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowSchedule(true)}
              className="bg-brand hover:bg-brand-strong text-brand-contrast font-bold py-2 px-4 rounded-lg shadow text-sm"
            >
              <i className="fa-solid fa-plus mr-1.5"></i>Programar envío
            </button>
          </div>
        </div>

        {notice && (
          <div className={`rounded-lg px-4 py-2.5 text-sm flex justify-between gap-2 border ${
            notice.type === 'success' ? 'bg-success-soft border-success/30 text-success' : 'bg-warning-soft border-warning/30 text-warning'
          }`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100"><i className="fa-solid fa-xmark"></i></button>
          </div>
        )}
        {loadError && <p className="text-sm text-danger">{loadError}</p>}

        {view === 'activas' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <Column title="Esperando despacho" icon="fa-hourglass-half" deliveries={waiting} emptyText="Nada esperando al almacén." renderCard={renderCard} />
            <Column title="Por salir" icon="fa-box" deliveries={ready} emptyText="No hay envíos listos para salir." renderCard={renderCard} />
            <Column title="En camino" icon="fa-truck-fast" deliveries={onTheWay} emptyText="Ningún repartidor en ruta." renderCard={renderCard} />
          </div>
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-muted text-center py-12">No hay entregas finalizadas en los últimos 7 días.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{deliveries.map(renderCard)}</div>
        )}
      </div>

      {cancelling && (
        <CancelDeliveryModal
          delivery={cancelling}
          busy={busyId === cancelling.id}
          onClose={() => setCancelling(null)}
          onConfirm={(motivo) => {
            const envio = cancelling;
            setCancelling(null);
            run(envio, () => api.post<Delivery>(`/entregas/${envio.id}/cancelar`, { reason: motivo || null } satisfies CancelDeliveryRequest),
              `Envío ${envio.ref} cancelado: el cliente lo recoge en tienda.`);
          }}
        />
      )}

      {showSchedule && (
        <ScheduleDeliveryModal
          onClose={() => setShowSchedule(false)}
          onScheduled={(numDoc) => {
            setShowSchedule(false);
            setNotice({ type: 'success', text: `Envío de ${numDoc} programado.` });
            setView('activas');
            load();
          }}
        />
      )}
    </div>
  );
}
