// Consola de VALETEC: administra las empresas conectadas a FerreSys (altas, planes, actualizaciones,
// suspensiones y bajas). Es una aplicación aparte de las empresas: tiene su base (ferresys_control) y
// su propia sesión, y ejecuta los scripts de deploy/ en el servidor.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import apiRoutes from './src/routes/api.js';
import { bootstrapConsoleUser } from './src/services/auth.js';
import { prisma } from './src/db.js';

const app = express();
const PORT = process.env.PORT || 4000;
const ROOT = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(ROOT, 'web', 'dist');

app.use(express.json({ limit: '1mb' }));
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Solicitud inválida.' });
  next(err);
});

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'ferresys-console' }));
app.use('/api', apiRoutes);

// La interfaz compilada se sirve desde el mismo servicio.
if (existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR));
  app.get('*', (req, res) => res.sendFile(join(WEB_DIR, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error('[consola] Error no capturado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

try {
  await bootstrapConsoleUser();
} catch (error) {
  console.error('[consola] No se pudo preparar el usuario inicial:', error);
}

app.listen(PORT, () => console.log(`Consola VALETEC escuchando en el puerto ${PORT}`));

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
