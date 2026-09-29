// Tipos de industries.js para el código en TypeScript. Si cambia industries.js, se actualiza aquí.
export type Industry = 'ferreteria';

export declare const INDUSTRIES: Record<Industry, { nombre: string }>;

export declare const DEFAULT_INDUSTRY: Industry;

export declare function isIndustry(value: unknown): value is Industry;
