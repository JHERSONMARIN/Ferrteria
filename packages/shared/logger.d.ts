// Tipos de logger.js para el código en TypeScript. Si cambia logger.js, se actualiza aquí.
import type { NextFunction, Request, Response } from 'express';

type Log = (message: string, fields?: Record<string, unknown>) => void;
export declare const logger: { debug: Log; info: Log; warn: Log; error: Log };
export declare function installConsoleLogger(options?: { service?: string }): void;
export declare function requestLogger(req: Request, res: Response, next: NextFunction): void;
export declare function setRequestUser(user: { id: number; user: string }): void;
