// Consultas propias de ventas: colas de pedidos (se refrescan solas) y cotizaciones.
import { useQuery } from '@tanstack/react-query';
import type { DispatchedOrder, Order, Quote } from '@ferresys/contracts/sales';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';

// Las colas se consultan cada pocos segundos: un pedido nuevo aparece sin recargar.
export const QUEUE_REFRESH_MS = 5000;

export const fetchQuotes = () => api.get<Quote[]>('/cotizaciones');

export const useQuotes = () => useQuery({ queryKey: queryKeys.quotes, queryFn: fetchQuotes });

// paused: mientras se cobra un pedido la cola no se refresca, para no mover lo que se está mirando.
export const useOrderQueue = (status: 'PENDING_PAYMENT' | 'PAID', paused = false) =>
  useQuery({
    queryKey: queryKeys.ordersByStatus(status),
    queryFn: () => api.get<Order[]>(`/pedidos?status=${status}`),
    refetchInterval: paused ? false : QUEUE_REFRESH_MS,
    retry: false,
  });

export const useDispatchedToday = () =>
  useQuery({
    queryKey: queryKeys.dispatchedToday,
    queryFn: () => api.get<DispatchedOrder[]>('/pedidos/despachados-hoy'),
    refetchInterval: QUEUE_REFRESH_MS,
    retry: false,
  });
