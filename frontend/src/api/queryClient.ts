// Una sola forma de pedir datos al servidor: TanStack Query guarda cada respuesta con una clave, la
// comparte entre pantallas y la vuelve a pedir cuando se invalida o cuando toca (colas de caja y despacho).
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client.ts';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un error de sesión o de permisos no se arregla reintentando.
      retry: (failures, error) => failures < 1 && !(error instanceof ApiError && error.status < 500),
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

// Claves compartidas: invalidarlas refresca todas las pantallas que las usan. Las que empiezan igual se
// invalidan juntas: invalidar ['pedidos'] refresca las colas de caja y de despacho y sus contadores.
export const queryKeys = {
  appInfo: ['app-info'] as const,
  me: ['auth', 'me'] as const,
  settings: ['settings'] as const,
  branches: ['sucursales'] as const,
  products: ['productos'] as const,
  categories: ['categorias'] as const,
  customers: ['clientes'] as const,
  cashStatus: ['caja', 'estado-actual'] as const,
  staff: ['personal'] as const,
  quotes: ['cotizaciones'] as const,
  orders: ['pedidos'] as const,
  ordersByStatus: (status: 'PENDING_PAYMENT' | 'PAID') => ['pedidos', status] as const,
  dispatchedToday: ['pedidos', 'despachados-hoy'] as const,
  queueCounts: ['pedidos', 'contadores'] as const,
};
