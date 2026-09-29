// Tipos de errors.js para el código en TypeScript. Si cambia errors.js, se actualiza aquí.
import type { NextFunction, Request, Response } from 'express';

export declare function codeForStatus(status: number): string;

export declare class AppError extends Error {
  /** Prefijo del código cuando no se da uno (CAJA → CAJA_CONFLICTO). */
  static area?: string;
  status: number;
  codigo: string;
  extra: Record<string, unknown> | null;
  constructor(message: string, status?: number, codigo?: string | null, extra?: Record<string, unknown> | null);
}

export declare function errorBody(error: AppError): { error: string; codigo: string; [key: string]: unknown };

export declare function errorEnvelope(req: Request, res: Response, next: NextFunction): void;

export declare function finalErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void;
