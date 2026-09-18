import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './src/routes/auth.js';
import personalRoutes from './src/routes/personal.js';
import clientesRoutes from './src/routes/clientes.js';
import consultaDocRoutes from './src/routes/consultaDoc.js';
import productosRoutes from './src/routes/productos.js';
import kardexRoutes from './src/routes/kardex.js';
import ventasRoutes from './src/routes/ventas.js';
import entregasRoutes from './src/routes/entregas.js';
import creditosRoutes from './src/routes/creditos.js';
import dashboardRoutes from './src/routes/dashboard.js';
import cajaRoutes from './src/routes/caja.js';
import proveedoresRoutes from './src/routes/proveedores.js';
import comprasRoutes from './src/routes/compras.js';
import cotizacionesRoutes from './src/routes/cotizaciones.js';
import categoriesRoutes from './src/routes/categories.js';
import settingsRoutes from './src/routes/settings.js';
import { prisma } from './src/db.js';
import { initializeDocumentSeries } from './src/services/documentSeries.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', authRoutes); // Heartbeat `/api/usuarios/check/:id`
app.use('/api/personal', personalRoutes);
app.use('/api/clientes', consultaDocRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/categorias', categoriesRoutes);
app.use('/api/kardex', kardexRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/entregas', entregasRoutes);
app.use('/api/creditos', creditosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/settings', settingsRoutes);

// Información pública para la pantalla de inicio de sesión
app.get('/api/app-info', (req, res) => {
  res.json({ demoMode: process.env.DEMO_MODE === 'true' });
});

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', system: 'FerreSys v4.8 API', timestamp: new Date() });
});

// Manejo Global de Errores
app.use((err, req, res, next) => {
  console.error('❌ Error no capturado:', err);
  res.status(500).json({ error: err.message || 'Error interno del servidor.' });
});

// Si falla, el servidor arranca igual: las ventas responderán que no hay serie configurada.
try {
  await initializeDocumentSeries(prisma);
} catch (error) {
  console.error('❌ No se pudieron inicializar las series de comprobantes:', error);
}

app.listen(PORT, () => {
  console.log(`🚀 FerreSys Backend corriendo en el puerto ${PORT}`);
});
