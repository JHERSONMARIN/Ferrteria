// Tipos de passwords.js para el código en TypeScript. Si cambia passwords.js, se actualiza aquí.
import { AppError } from './errors.js';

export declare const MIN_PASSWORD_LENGTH: number;
export declare class PasswordPolicyError extends AppError {}
export declare const isPasswordHashed: (stored: unknown) => boolean;
export declare function hashPassword(plainPassword: string): Promise<string>;
export declare function verifyPassword(plainPassword: string, stored: string): Promise<boolean>;
/** Lanza PasswordPolicyError si la contraseña no cumple la política. */
export declare function validateNewPassword(plainPassword: unknown): void;
