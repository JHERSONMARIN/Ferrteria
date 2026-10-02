// Datos públicos del sistema, antes de iniciar sesión: GET /api/app-info.
import type { Industry } from './settings.ts';

export interface AppInfo {
  demoMode: boolean;
  /** Accesos rápidos de prueba (QUICK_LOGIN); vacío en producción. */
  quickLogin: { user: string; pass: string; label: string }[];
  business: { name: string | null; logo: string | null; primaryColor: string | null; navColor: string | null };
  version: { number: string | null; commit: string | null };
  /** Rubro de la empresa: el inicio de sesión muestra su ícono. */
  industry: Industry;
}
