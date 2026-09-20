import express from 'express';
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
import auditoriaRoutes from './src/routes/auditoria.js';
import pedidosRoutes from './src/routes/pedidos.js';
import { prisma } from './src/db.js';
import { initializeDocumentSeries } from './src/services/documentSeries.js';
import { ensureBranchStockRows } from './src/services/stock.js';
import { licenseStatus } from './src/services/license.js';
import sucursalesRoutes from './src/routes/sucursales.js';
import transferenciasRoutes from './src/routes/transferencias.js';
import { expireOrders } from './src/services/saleOrders.js';
import { authenticate, requirePasswordChanged } from './src/middleware/authenticate.js';
import { allowModules } from './src/middleware/authorize.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Las peticiones llegan a través del proxy del frontend (y en producción también del proxy HTTPS).
// Solo se confía en esa cantidad de saltos para obtener la IP real del cliente: con más,
// cualquiera podría falsear su IP en X-Forwarded-For.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

// Sin CORS: el navegador siempre llega por el mismo dominio a través del proxy del frontend,
// así que ningún otro sitio web puede llamar a la API con la sesión del usuario.
app.use(express.json());

// Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---------- Rutas públicas ----------
app.use('/api/auth', authRoutes);

// Accesos rápidos para probar: QUICK_LOGIN="usuario:clave:Etiqueta,usuario2:clave2".
// Se muestran en la pantalla de inicio, así que SOLO deben definirse en entornos de prueba.
function quickLoginUsers() {
  const raw = process.env.QUICK_LOGIN?.trim();
  if (!raw) return [];
  return raw.split(',').map(entry => {
    const [user, pass, label] = entry.split(':').map(part => part?.trim());
    return user && pass ? { user, pass, label: label || user } : null;
  }).filter(Boolean);
}

const QUICK_LOGIN_USERS = quickLoginUsers();
if (QUICK_LOGIN_USERS.length > 0) {
  console.warn(`[login] ${QUICK_LOGIN_USERS.length} acceso(s) rápido(s) de prueba visibles en la pantalla de inicio (QUICK_LOGIN). No usar en producción.`);
}

// Información pública para la pantalla de inicio de sesión (nombre y logo de la empresa).
app.get('/api/app-info', async (req, res) => {
  let business = { name: process.env.COMPANY_NAME || null, logo: null };
  try {
    const settings = await prisma.businessSettings.findUnique({
      where: { id: 1 },
      select: { legalName: true, tradeName: true, logo: true },
    });
    if (settings) business = { name: settings.tradeName || settings.legalName, logo: settings.logo };
  } catch (error) {
    console.error('[app-info] No se pudieron leer los datos de la empresa:', error);
  }
  res.json({ demoMode: process.env.DEMO_MODE === 'true', quickLogin: QUICK_LOGIN_USERS, business });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', system: 'FerreSys v4.8 API', timestamp: new Date() });
});

// ---------- A partir de aquí todo requiere sesión ----------
app.use('/api', authenticate, requirePasswordChanged);

// Licencia vencida: la empresa queda en solo lectura hasta renovar con VALETEC.
app.use('/api', (req, res, next) => {
  const { expired, expiresAt } = licenseStatus();
  if (!expired || req.method === 'GET' || req.path.startsWith('/auth/')) return next();
  res.status(403).json({
    error: `La licencia venció el ${expiresAt}. El sistema queda solo para consulta hasta renovarla con VALETEC.`,
    codigo: 'LICENCIA_VENCIDA',
  });
});

// Catálogos que consultan varias pantallas (POS, compras, entregas…); modificarlos exige su módulo.
const CATALOG_READERS = ['pos', 'cotizaciones', 'inventory', 'categories', 'kardex', 'compras', 'deliveries'];

app.use('/api/settings', allowModules({ GET: 'authenticated', default: 'admin' }), settingsRoutes);
app.use('/api/auditoria', allowModules({ default: 'admin' }), auditoriaRoutes);
app.use('/api/sucursales', allowModules({ GET: 'authenticated', default: 'admin' }), sucursalesRoutes);
app.use('/api/transferencias', allowModules({ default: ['inventory', 'kardex'] }), transferenciasRoutes);
app.use('/api/personal', allowModules({ GET: ['personal', 'pos', 'deliveries'], default: ['personal'] }), personalRoutes);
app.use('/api/clientes', allowModules({
  GET: ['pos', 'caja', 'cotizaciones', 'client-dir', 'customers', 'deliveries'],
  PUT: ['client-dir', 'customers'],
  default: ['client-dir'],
}), consultaDocRoutes, clientesRoutes);
app.use('/api/productos', allowModules({ GET: CATALOG_READERS, default: ['inventory'] }), productosRoutes);
app.use('/api/categorias', allowModules({ GET: CATALOG_READERS, default: ['categories', 'inventory'] }), categoriesRoutes);
app.use('/api/kardex', allowModules({ default: ['kardex', 'inventory'] }), kardexRoutes);
app.use('/api/ventas', allowModules({ GET: ['pos', 'dashboard'], default: ['pos'] }), ventasRoutes);
app.use('/api/cotizaciones', allowModules({ DELETE: ['cotizaciones'], default: ['cotizaciones', 'pos'] }), cotizacionesRoutes);
app.use('/api/caja', allowModules({ GET: ['caja', 'pos'], default: ['caja'] }), cajaRoutes);
app.use('/api/entregas', allowModules({ default: ['deliveries'] }), entregasRoutes);
app.use('/api/creditos', allowModules({ default: ['customers'] }), creditosRoutes);
app.use('/api/dashboard', allowModules({ default: ['dashboard'] }), dashboardRoutes);
app.use('/api/proveedores', allowModules({ default: ['compras'] }), proveedoresRoutes);
app.use('/api/compras', allowModules({ default: ['compras'] }), comprasRoutes);
// Permisos por acción dentro del router (crear: POS, cobrar: caja, despachar: despacho).
app.use('/api/pedidos', pedidosRoutes);

// Cualquier otra ruta de la API
app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

// Manejo Global de Errores
app.use((err, req, res, next) => {
  // Errores del propio cliente (JSON mal formado, cuerpo demasiado grande): no son fallas del servidor.
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: 'Solicitud inválida.' });
  }
  console.error(`❌ Error no capturado en ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// Si falla, el servidor arranca igual: las ventas responderán que no hay serie configurada.
try {
  await initializeDocumentSeries(prisma);
} catch (error) {
  console.error('❌ No se pudieron inicializar las series de comprobantes:', error);
}

try {
  await ensureBranchStockRows(prisma);
} catch (error) {
  console.error('❌ No se pudo verificar el stock por sucursal:', error);
}

// Pedidos sin cobrar que pasaron el cierre del día: se anulan y liberan su stock reservado.
const runOrderExpiration = () => expireOrders(prisma).catch(error => {
  console.error('❌ Error al vencer pedidos:', error);
});
await runOrderExpiration();
setInterval(runOrderExpiration, 5 * 60 * 1000).unref();

app.listen(PORT, () => {
  console.log(`🚀 FerreSys Backend corriendo en el puerto ${PORT}`);
});
