// Lo que el backend agrega a cada petición de Express: el usuario de la sesión (middleware/authenticate.js)
// y el identificador de la petición (@ferresys/shared/logger).

export interface SessionUser {
  id: number;
  name: string;
  user: string;
  role: 'ADMINISTRADOR' | 'VENDEDOR' | 'CAJERO' | 'REPARTIDOR' | string;
  modules: string[];
  active: boolean;
  mustChangePassword: boolean;
  branchId: number;
  branch: {
    id: number;
    name: string;
    saleFlowMode: 'DIRECT' | 'SEPARATE_CASHIER' | 'STAGED';
    deliveriesEnabled: boolean;
    dispatchRole: string | null;
  } | null;
}

declare global {
  namespace Express {
    interface Request {
      /** Solo en rutas que pasan por authenticate. */
      user: SessionUser;
      id: string;
    }
  }
}
