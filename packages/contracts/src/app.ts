// Datos públicos del sistema, antes de iniciar sesión: GET /api/app-info.

export interface AppInfo {
  demoMode: boolean;
  /** Accesos rápidos de prueba (QUICK_LOGIN); vacío en producción. */
  quickLogin: { user: string; pass: string; label: string }[];
  business: { name: string | null; logo: string | null; primaryColor: string | null; navColor: string | null };
  version: { number: string | null; commit: string | null };
}
