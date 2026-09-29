// La licencia vista desde HTTP: respuesta uniforme a un error del plan y el modo solo lectura.
import type { NextFunction, Request, Response } from 'express';
import { errorBody } from '@ferresys/shared/errors';
import { LicenseError, type LicenseStatus } from '../domain/license.ts';

// Desde cualquier ruta: devuelve true si el error era del plan (y ya respondió).
export function respondIfLicenseError(res: Response, error: unknown): boolean {
  if (!(error instanceof LicenseError)) return false;
  res.status(error.status).json(errorBody(error));
  return true;
}

// Licencia vencida: la empresa queda en solo lectura (consultas y su propia sesión) hasta renovar.
export const readOnlyWhenExpired = (status: () => LicenseStatus) =>
  (req: Request, res: Response, next: NextFunction) => {
    const { expired, expiresAt } = status();
    if (!expired || req.method === 'GET' || req.path.startsWith('/auth/')) return next();
    res.status(403).json({
      error: `La licencia venció el ${expiresAt}. El sistema queda solo para consulta hasta renovarla con VALETEC.`,
      codigo: 'LICENCIA_VENCIDA',
    });
  };
