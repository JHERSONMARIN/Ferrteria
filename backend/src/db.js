// El cliente vive en db.ts. Este archivo se mantiene porque los scripts de deploy/ importan
// /app/backend/src/db.js dentro del contenedor.
export { prisma } from './db.ts';
