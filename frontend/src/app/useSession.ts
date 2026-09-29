// Sesión del usuario: se recuerda en el navegador, se confirma con el servidor cada 8 s (latido) y se
// cierra sola si el servidor la invalida (clave cambiada, usuario desactivado o sesión vencida).
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.ts';
import { queryKeys } from '../api/queryClient.ts';
import type { SessionUser } from '../api/types.ts';

const STORAGE_KEY = 'ferre_user';
const HEARTBEAT_MS = 8000;

function readStoredUser(): SessionUser | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) as SessionUser : null;
  } catch {
    return null;
  }
}

const store = (user: SessionUser | null) => {
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEY);
};

// Solo se reemplaza el usuario si cambió algo que afecta a la pantalla (evita redibujar cada latido).
const affectsScreen = (a: SessionUser, b: SessionUser) =>
  JSON.stringify(a.modules) !== JSON.stringify(b.modules) || a.role !== b.role || a.name !== b.name
  || Boolean(a.mustChangePassword) !== Boolean(b.mustChangePassword) || JSON.stringify(a.branch) !== JSON.stringify(b.branch);

export function useSession(onExpired: () => void) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(readStoredUser);

  const heartbeat = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<{ user: SessionUser }>('/auth/me'),
    enabled: Boolean(user?.id),
    refetchInterval: HEARTBEAT_MS,
    retry: false,
  });

  // Aplica al estado local los datos del usuario que devuelve el servidor.
  useEffect(() => {
    const serverUser = heartbeat.data?.user;
    if (!serverUser) return;
    setUser(prev => {
      if (!prev || !affectsScreen(prev, serverUser)) return prev;
      const updated = { ...prev, ...serverUser, mustChangePassword: Boolean(serverUser.mustChangePassword) };
      store(updated);
      return updated;
    });
  }, [heartbeat.data]);

  // Al cambiar el modo de una sucursal en Configuración se refresca al momento.
  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.me });
    window.addEventListener('refrescar-sesion', refresh);
    return () => window.removeEventListener('refrescar-sesion', refresh);
  }, [queryClient]);

  // api/client.ts emite "sesion-expirada" cuando el servidor rechaza la sesión.
  useEffect(() => {
    const expired = () => {
      if (readStoredUser()) onExpired();
      store(null);
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener('sesion-expirada', expired);
    return () => window.removeEventListener('sesion-expirada', expired);
  }, [onExpired, queryClient]);

  const signIn = useCallback((signedIn: SessionUser) => {
    store(signedIn);
    setUser(signedIn);
  }, []);

  const signOut = useCallback(() => {
    api.post('/auth/logout', {}).catch(() => {});
    store(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const passwordChanged = useCallback(() => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, mustChangePassword: false };
      store(updated);
      return updated;
    });
  }, []);

  return { user, signIn, signOut, passwordChanged };
}
