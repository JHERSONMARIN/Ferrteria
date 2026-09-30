// Rutas propias de cada rubro (/api/rubro/...). Solo las importa server.ts: las rutas usan módulos del núcleo
// (sucursales, reportes) y esos módulos usan los enganches de index.ts; si los paquetes cargaran sus rutas,
// los módulos se importarían en círculo.
import type { Industry } from '@ferresys/shared/industries';
import { INDUSTRY } from '../modules/licensing/index.ts';
import { farmaciaRoutes } from './farmacia/routes.ts';
import type { IndustryRoute } from './hooks.ts';

const ROUTES: Record<Industry, IndustryRoute[]> = { ferreteria: [], farmacia: farmaciaRoutes };

export const industryRoutes = ROUTES[INDUSTRY];
