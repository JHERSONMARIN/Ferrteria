// Tipos de sessionTokens.js para el código en TypeScript. Si cambia sessionTokens.js, se actualiza aquí.
export interface SessionClaims {
  /** Id del usuario. */
  sub: number;
  /** Huella de la contraseña: si la contraseña cambia, el token deja de valer. */
  pwf: string;
  iat: number;
  exp: number;
}

export declare const SESSION_MAX_AGE_SECONDS: number;
export declare const passwordFingerprint: (storedPassword: string) => string;
export declare function createSessionToken(user: { id: number; pass: string }): string;
export declare function readSessionToken(token: string | null | undefined): SessionClaims | null;
