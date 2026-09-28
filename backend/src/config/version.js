import { readFileSync } from 'node:fs';

// Versión que corre esta instancia: número del package.json, commit y fecha de construcción de la
// imagen (ver Dockerfile). Se informa en /api/health y en /api/app-info, y la consola la muestra.
const read = (file) => {
  try {
    return readFileSync(new URL(file, import.meta.url), 'utf8').trim();
  } catch {
    return null;
  }
};

export const APP_VERSION = JSON.parse(read('../../package.json') ?? '{}').version ?? null;
export const APP_COMMIT = process.env.APP_COMMIT?.trim() || null;
export const APP_BUILT_AT = read('../../BUILT_AT');

// Para mostrar: "4.8.0 (507ec06)".
export const versionLabel = () => `${APP_VERSION ?? '?'}${APP_COMMIT ? ` (${APP_COMMIT})` : ''}`;
