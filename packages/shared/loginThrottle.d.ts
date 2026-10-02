// Tipos de loginThrottle.js para el código en TypeScript. Si cambia loginThrottle.js, se actualiza aquí.
/** Segundos de bloqueo restantes (0 si puede intentar). */
export declare function secondsBlocked(username: string, ip: string | undefined): number;
export declare function registerFailure(username: string, ip: string | undefined): void;
export declare function registerSuccess(username: string, ip: string | undefined): void;
