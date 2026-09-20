// Acciones sobre el servidor. La consola no ejecuta comandos libres: solo los scripts de deploy/, con
// argumentos validados. Cada acción queda en el historial (console_audit), salga bien o mal.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { prisma } from '../db.js';
import { DEPLOY_DIR, readPlans, companySlugs, readCompanyEnv } from './companies.js';

const execFileAsync = promisify(execFile);

// Entorno limpio para los scripts: las variables de la consola (su DATABASE_URL, su JWT_SECRET…) no
// deben llegar a las empresas. Docker Compose da prioridad al entorno por encima del --env-file, así que
// una variable heredada sobrescribiría la configuración de la empresa.
const SCRIPT_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME || '/root',
  TZ: process.env.TZ || 'America/Lima',
  ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}),
  ...(process.env.DOCKER_CONFIG ? { DOCKER_CONFIG: process.env.DOCKER_CONFIG } : {}),
};

// Crear una empresa construye imágenes: puede tardar varios minutos.
const TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OUTPUT = 20000;

export class CommandError extends Error {
  constructor(message, status = 400, output = null) {
    super(message);
    this.status = status;
    this.output = output;
  }
}

const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertSlug(slug) {
  if (!SLUG_PATTERN.test(String(slug ?? ''))) {
    throw new CommandError('Identificador inválido: minúsculas, números y guiones (2 a 31 caracteres, empieza con letra).');
  }
  return slug;
}

const assertExists = (slug) => {
  if (!companySlugs().includes(assertSlug(slug))) throw new CommandError(`No existe la empresa '${slug}'.`, 404);
  return slug;
};

async function record({ action, slug, summary, details, ok, user }) {
  await prisma.consoleAudit.create({
    data: { action, slug: slug ?? null, summary: summary.slice(0, 300), details, ok, userId: user?.id ?? null, userName: user?.name ?? 'Sistema' },
  });
}

// Ejecuta un script de deploy/ y guarda el resultado en el historial.
async function run({ script, args, action, slug, summary, user }) {
  const command = join(DEPLOY_DIR, script);
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, env: SCRIPT_ENV });
    const output = `${stdout}${stderr}`.slice(-MAX_OUTPUT);
    await record({ action, slug, summary, details: { args, output }, ok: true, user });
    return output;
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`.slice(-MAX_OUTPUT);
    await record({ action, slug, summary: `Falló: ${summary}`, details: { args, output }, ok: false, user });
    throw new CommandError(`No se pudo completar la acción en el servidor.`, 500, output);
  }
}

// ---------- Acciones ----------

export async function createCompany({ slug, name, port, plan, contact, phone, email, notes }, user) {
  assertSlug(slug);
  if (companySlugs().includes(slug)) throw new CommandError(`La empresa '${slug}' ya existe.`, 409);
  const legalName = String(name ?? '').trim();
  if (legalName.length < 2 || /["$\\]/.test(legalName)) throw new CommandError('Razón social inválida (sin comillas dobles, $ ni barras).');
  const webPort = Number(port);
  if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535) throw new CommandError('Puerto inválido (1024 a 65535).');
  const plans = readPlans().planes;
  if (plan && !plans[plan]) throw new CommandError(`Plan desconocido: ${plan}.`);

  const output = await run({
    script: 'create-company.sh',
    args: plan ? [slug, legalName, String(webPort), plan] : [slug, legalName, String(webPort)],
    action: 'COMPANY_CREATED', slug, summary: `Empresa ${slug} creada (${legalName})${plan ? `, plan ${plan}` : ''}`, user,
  });

  await prisma.managedCompany.upsert({
    where: { slug },
    update: { name: legalName, contact, phone, email, notes, removedAt: null },
    create: { slug, name: legalName, contact, phone, email, notes },
  });

  // La clave temporal del administrador solo se muestra en este momento.
  const password = output.match(/Contrase\u00f1a:\s+(\S+)/)?.[1] ?? null;
  return { output, adminPassword: password };
}

export async function setPlan({ slug, plan, extras = [], expiresAt = null }, user) {
  assertExists(slug);
  const { planes, adicionales } = readPlans();
  if (!planes[plan]) throw new CommandError(`Plan desconocido: ${plan}.`);
  for (const extra of extras) {
    if (!adicionales[extra]) throw new CommandError(`Adicional desconocido: ${extra}.`);
  }
  if (expiresAt && !DATE_PATTERN.test(expiresAt)) throw new CommandError('Fecha de vencimiento inválida (AAAA-MM-DD).');

  const args = [slug, plan];
  if (extras.length > 0) args.push('--extra', extras.join(','));
  if (expiresAt) args.push('--vence', expiresAt);

  return run({
    script: 'set-plan.sh', args, action: 'PLAN_CHANGED', slug,
    summary: `Plan de ${slug}: ${planes[plan].nombre}${extras.length ? ` + ${extras.join(', ')}` : ''}${expiresAt ? `, vence ${expiresAt}` : ''}`,
    user,
  });
}

export async function resetAdminPassword({ slug, username = 'admin' }, user) {
  assertExists(slug);
  if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) throw new CommandError('Usuario inválido.');
  const output = await run({
    script: 'reset-password.sh', args: [slug, username],
    action: 'PASSWORD_RESET', slug, summary: `Clave restablecida a ${username} de ${slug}`, user,
  });
  return { output, password: output.match(/Contrase\u00f1a:\s+(\S+)/)?.[1] ?? null };
}

export async function removeCompany({ slug }, user) {
  assertExists(slug);
  const output = await run({
    script: 'remove-company.sh', args: [slug], action: 'COMPANY_REMOVED', slug,
    summary: `Empresa ${slug} dada de baja (con respaldo)`, user,
  });
  await prisma.managedCompany.updateMany({ where: { slug }, data: { removedAt: new Date() } });
  return output;
}

// Arrancar, detener (suspensión por falta de pago) y actualizar a la versión nueva del código.
async function compose({ slug, args, action, summary, user }) {
  assertExists(slug);
  const env = readCompanyEnv(slug);
  if (!env) throw new CommandError(`No se pudo leer la configuración de '${slug}'.`, 404);
  const composeArgs = [
    'compose', '-p', `ferresys-${slug}`,
    '-f', join(DEPLOY_DIR, 'company', 'docker-compose.yml'),
    '--env-file', join(DEPLOY_DIR, 'companies', slug, '.env'),
    ...args,
  ];
  try {
    const { stdout, stderr } = await execFileAsync('docker', composeArgs, { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, env: SCRIPT_ENV });
    const output = `${stdout}${stderr}`.slice(-MAX_OUTPUT);
    await record({ action, slug, summary, details: { args, output }, ok: true, user });
    return output;
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`.slice(-MAX_OUTPUT);
    await record({ action, slug, summary: `Falló: ${summary}`, details: { args, output }, ok: false, user });
    throw new CommandError('No se pudo completar la acción en el servidor.', 500, output);
  }
}

export const startCompany = ({ slug }, user) =>
  compose({ slug, args: ['up', '-d'], action: 'COMPANY_RESUMED', summary: `Empresa ${slug} reactivada`, user });

export const stopCompany = ({ slug }, user) =>
  compose({ slug, args: ['stop'], action: 'COMPANY_SUSPENDED', summary: `Empresa ${slug} suspendida`, user });

// Actualiza a la versión del código que tiene el servidor (reconstruye sus imágenes).
export const updateCompany = ({ slug }, user) =>
  compose({ slug, args: ['up', '-d', '--build'], action: 'COMPANY_UPDATED', summary: `Empresa ${slug} actualizada a la versión actual`, user });

export async function listHistory({ slug = null, limit: take = 100 } = {}) {
  return prisma.consoleAudit.findMany({
    where: slug ? { slug } : {},
    orderBy: { id: 'desc' },
    take: Math.min(Number(take) || 100, 300),
  });
}
