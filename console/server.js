// Consola de VALETEC: administra las empresas conectadas a FerreSys (altas, planes, actualizaciones,
// suspensiones y bajas). Es una aplicación aparte de las empresas: tiene su base (ferresys_control) y
// su propia sesión, y ejecuta los scripts de deploy/ en el servidor.
// Primero: reemplaza console por el registro estructurado antes de que otros módulos escriban.
import './src/logging.js';
import { requestLogger } from '@ferresys/shared/logger';
import { errorEnvelope, finalErrorHandler } from '@ferresys/shared/errors';
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

// Proxies delante de la consola (el HTTPS del servidor): 0 si se entra directo. Con esto req.ip es la
// IP real del visitante, que usa el límite de intentos de inicio de sesión.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));

// Cada petición a la API: identificador (cabecera X-Request-Id), una línea de registro y errores con
// la forma { error, codigo, requestId }.
app.use('/api', requestLogger, errorEnvelope);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'ferresys-console' }));
app.use('/api', apiRoutes);
// Una ruta de la API que no existe no debe caer en la interfaz (index.html).
app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

// La interfaz compilada se sirve desde el mismo servicio.
if (existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR));
  app.get('*', (req, res) => res.sendFile(join(WEB_DIR, 'index.html')));
}

// Errores que ninguna ruta atendió (también el JSON mal formado).
app.use(finalErrorHandler);

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
