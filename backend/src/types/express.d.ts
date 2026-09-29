// Lo que el backend agrega a cada petición de Express: el usuario de la sesión (modules/identity/session.ts)
// y el identificador de la petición (@ferresys/shared/logger).

import type { SessionUser } from '@ferresys/contracts/identity';

// El usuario de la sesión tiene la misma forma que recibe la pantalla (packages/contracts).
export type { SessionUser };

declare global {
  namespace Express {
    interface Request {
      /** Solo en rutas que pasan por authenticate. */
      user: SessionUser;
      id: string;
    }
  }
}
