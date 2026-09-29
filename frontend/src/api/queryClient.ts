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

// Claves compartidas: invalidarlas refresca todas las pantallas que las usan.
export const queryKeys = {
  appInfo: ['app-info'] as const,
  me: ['auth', 'me'] as const,
  settings: ['settings'] as const,
  branches: ['sucursales'] as const,
  queueCounts: ['pedidos', 'contadores'] as const,
};
