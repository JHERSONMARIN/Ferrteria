import express from 'express';
import { prisma } from '../db.js';
import { listCompanies, getCompany, readPlans, readThemes } from '../services/companies.js';
import {
  CommandError, createCompany, setPlan, setTheme, resetAdminPassword, removeCompany,
  startCompany, stopCompany, updateCompany, listHistory,
} from '../services/commands.js';
import { login, userFromToken, changePassword, sessionCookie, clearedCookie, readCookie, SESSION_COOKIE, PasswordPolicyError } from '../services/auth.js';

const router = express.Router();

const handle = (context, fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error instanceof CommandError) return res.status(error.status).json({ error: error.message, salida: error.output });
    if (error instanceof PasswordPolicyError) return res.status(400).json({ error: error.message });
    console.error(`[consola] ${context}:`, error);
    res.status(500).json({ error: `No se pudo ${context}.` });
  }
};

// ---------- Sesión ----------
router.post('/auth/login', handle('iniciar sesión', async (req, res) => {
  const result = await login(req.body?.user, req.body?.pass);
  if (!result) return res.status(401).json({ error: 'Credenciales incorrectas o usuario inactivo.' });
  res.setHeader('Set-Cookie', sessionCookie(result.token));
  res.json({ success: true, user: result.user });
}));

router.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearedCookie());
  res.json({ success: true });
});

// A partir de aquí, todo exige sesión de VALETEC.
router.use(handle('validar la sesión', async (req, res, next) => {
  const user = await userFromToken(readCookie(req, SESSION_COOKIE));
  if (!user) return res.status(401).json({ error: 'Sesión no iniciada o vencida.', codigo: 'SESION_INVALIDA' });
  req.user = user;
  // Con clave temporal solo se permite cambiarla.
  if (user.mustChangePassword && !req.path.startsWith('/auth/')) {
    return res.status(403).json({ error: 'Debe cambiar su contraseña.', codigo: 'CAMBIO_CLAVE_REQUERIDO' });
  }
  next();
}));

router.get('/auth/me', (req, res) => res.json({ user: req.user }));

router.post('/auth/change-password', handle('cambiar la contraseña', async (req, res) => {
  const result = await changePassword(req.user.id, req.body?.currentPassword, req.body?.newPassword);
  if (!result) return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  // La huella de la contraseña cambió: se entrega una sesión nueva y las demás quedan inválidas.
  res.setHeader('Set-Cookie', sessionCookie(result.token));
  res.json({ success: true, user: result.user });
}));

// ---------- Planes ----------
router.get('/planes', handle('listar los planes', async (req, res) => {
  const { planes, adicionales } = readPlans();
  res.json({ planes, adicionales });
}));

// ---------- Estilos ----------
router.get('/estilos', handle('listar los estilos', async (req, res) => {
  res.json(readThemes());
}));

// ---------- Empresas ----------
router.get('/empresas', handle('listar las empresas', async (req, res) => {
  const [companies, managed] = await Promise.all([
    listCompanies({ withUsage: req.query.uso === '1' }),
    prisma.managedCompany.findMany(),
  ]);
  const bySlug = new Map(managed.map(m => [m.slug, m]));
  res.json(companies.map(c => ({ ...c, contacto: bySlug.get(c.slug) ?? null })));
}));

router.get('/empresas/:slug', handle('obtener la empresa', async (req, res) => {
  const company = await getCompany(req.params.slug, { withUsage: true });
  if (!company) return res.status(404).json({ error: 'La empresa no existe.' });
  const contacto = await prisma.managedCompany.findUnique({ where: { slug: req.params.slug } });
  res.json({ ...company, contacto });
}));

router.post('/empresas', handle('crear la empresa', async (req, res) => {
  res.status(201).json(await createCompany(req.body ?? {}, req.user));
}));

router.put('/empresas/:slug/plan', handle('cambiar el plan', async (req, res) => {
  const { plan, extras = [], expiresAt = null } = req.body ?? {};
  res.json({ success: true, salida: await setPlan({ slug: req.params.slug, plan, extras, expiresAt }, req.user) });
}));

router.put('/empresas/:slug/estilo', handle('cambiar el estilo', async (req, res) => {
  res.json({ success: true, salida: await setTheme({ slug: req.params.slug, theme: req.body?.estilo }, req.user) });
}));

router.put('/empresas/:slug/contacto', handle('guardar el contacto', async (req, res) => {
  const { contact = null, phone = null, email = null, notes = null, name } = req.body ?? {};
  const company = await getCompany(req.params.slug);
  if (!company) return res.status(404).json({ error: 'La empresa no existe.' });
  res.json(await prisma.managedCompany.upsert({
    where: { slug: req.params.slug },
    update: { contact, phone, email, notes },
    create: { slug: req.params.slug, name: name || company.name, contact, phone, email, notes },
  }));
}));

router.post('/empresas/:slug/suspender', handle('suspender la empresa', async (req, res) => {
  res.json({ success: true, salida: await stopCompany({ slug: req.params.slug }, req.user) });
}));

router.post('/empresas/:slug/reactivar', handle('reactivar la empresa', async (req, res) => {
  res.json({ success: true, salida: await startCompany({ slug: req.params.slug }, req.user) });
}));

router.post('/empresas/:slug/actualizar', handle('actualizar la empresa', async (req, res) => {
  res.json({ success: true, salida: await updateCompany({ slug: req.params.slug }, req.user) });
}));

router.post('/empresas/:slug/clave-admin', handle('restablecer la contraseña', async (req, res) => {
  res.json(await resetAdminPassword({ slug: req.params.slug, username: req.body?.usuario || 'admin' }, req.user));
}));

router.delete('/empresas/:slug', handle('dar de baja la empresa', async (req, res) => {
  if (req.body?.confirmar !== req.params.slug) {
    return res.status(400).json({ error: 'Escriba el identificador de la empresa para confirmar la baja.' });
  }
  res.json({ success: true, salida: await removeCompany({ slug: req.params.slug }, req.user) });
}));

// ---------- Historial ----------
router.get('/historial', handle('consultar el historial', async (req, res) => {
  res.json(await listHistory({ slug: req.query.empresa || null, limit: req.query.limite }));
}));

export default router;
