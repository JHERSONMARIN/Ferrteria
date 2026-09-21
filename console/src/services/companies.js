// Lee las empresas instaladas. La fuente de verdad es el disco (deploy/companies/<slug>/.env) y Docker;
// la consola no duplica esa información en su base.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DEPLOY_DIR = process.env.DEPLOY_DIR || join(process.cwd(), '..', 'deploy');
const COMPANIES_DIR = join(DEPLOY_DIR, 'companies');
const PLANS_FILE = join(DEPLOY_DIR, 'plans.json');
// Los estilos viven con el producto (los usa también la Configuración de cada empresa).
const THEMES_FILE = join(DEPLOY_DIR, '..', 'backend', 'src', 'config', 'themes.json');
const MODULES_FILE = join(DEPLOY_DIR, '..', 'backend', 'src', 'config', 'modules.js');
const DB_CONTAINER = 'ferresys-infra-db';
const CLAVES_SECRETAS = ['DATABASE_URL', 'JWT_SECRET', 'INITIAL_ADMIN_PASSWORD'];

export const readPlans = () => JSON.parse(readFileSync(PLANS_FILE, 'utf8'));
export const readThemes = () => JSON.parse(readFileSync(THEMES_FILE, 'utf8')).estilos;

// Módulos del producto: se leen del backend para no repetir la lista aquí.
export function readModules() {
  const texto = readFileSync(MODULES_FILE, 'utf8');
  const lista = (bloque) => (texto.match(new RegExp(`${bloque} = \\[([^\\]]*)\\]`))?.[1] ?? '')
    .match(/'[^']+'/g)?.map(m => m.replace(/'/g, '')) ?? [];
  return { disponibles: lista('AVAILABLE_MODULES'), siempre: lista('ALWAYS_ENABLED_MODULES') };
}

// .env sencillo: CLAVE=valor, una por línea, con comillas opcionales.
function parseEnv(text) {
  const values = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
  return values;
}

const list = (value) => (value ? value.split(',').map(v => v.trim()).filter(Boolean) : []);
const limit = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null; // null = sin límite
};

export const companySlugs = () => (existsSync(COMPANIES_DIR)
  ? readdirSync(COMPANIES_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
  : []);

export function readCompanyEnv(slug) {
  const file = join(COMPANIES_DIR, slug, '.env');
  if (!existsSync(file)) return null;
  return parseEnv(readFileSync(file, 'utf8'));
}

// Estado de los contenedores de la empresa (web y backend).
async function dockerState(slug) {
  try {
    const { stdout } = await execFileAsync('docker', [
      'ps', '-a', '--filter', `name=ferresys-${slug}-`, '--format', '{{.Names}}|{{.State}}',
    ]);
    const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
      const [name, state] = line.split('|');
      return { name, state };
    });
    if (containers.length === 0) return { status: 'sin-contenedores', containers };
    const running = containers.filter(c => c.state === 'running').length;
    if (running === containers.length) return { status: 'activa', containers };
    return { status: running === 0 ? 'detenida' : 'parcial', containers };
  } catch (error) {
    return { status: 'desconocido', containers: [], error: error.message };
  }
}

// Consulta de solo lectura a la base de la empresa (uso del plan).
async function usage(slug) {
  const dbName = `ferresys_${slug.replace(/-/g, '_')}`;
  // En una sola línea: al pasarla al contenedor, los saltos de línea quedarían escapados.
  const sql = [
    "SELECT (SELECT count(*) FROM usuarios WHERE active) || '|' ||",
    "(SELECT count(*) FROM branches WHERE active) || '|' ||",
    "(SELECT count(*) FROM cash_registers WHERE active) || '|' ||",
    `(SELECT count(*) FROM ventas WHERE status IN ('PAID','DISPATCHED')`,
    `AND COALESCE("paidAt", "createdAt") >= date_trunc('month', (NOW() AT TIME ZONE 'America/Lima'))) || '|' ||`,
    `(SELECT COALESCE("primaryColor", '') || ',' || COALESCE("navColor", '') FROM business_settings WHERE id = 1) || '|' ||`,
    `(SELECT COALESCE((SELECT string_agg(m, ',') FROM jsonb_array_elements_text(("enabledModules")::jsonb) AS m), '')`,
    `FROM business_settings WHERE id = 1)`,
  ].join(' ');
  try {
    const { stdout } = await execFileAsync('docker', ['exec', DB_CONTAINER, 'sh', '-c',
      `psql -U "$POSTGRES_USER" -d ${dbName} -tAc ${JSON.stringify(sql)}`]);
    const [users, branches, cashRegisters, salesThisMonth, colores, modulos] = stdout.trim().split('|');
    const [primaryColor, navColor] = (colores || '').split(',');
    return {
      users: Number(users), branches: Number(branches), cashRegisters: Number(cashRegisters),
      salesThisMonth: Number(salesThisMonth),
      theme: { primaryColor: primaryColor || null, navColor: navColor || null },
      // Lo que la empresa ve hoy en su menú (su configuración, no solo la licencia).
      enabledModules: (modulos || '').split(',').filter(Boolean),
    };
  } catch {
    return null; // la empresa puede estar detenida o la base todavía sin migrar
  }
}

function licenseStatus(expiresAt) {
  if (!expiresAt) return { expiresAt: null, daysLeft: null, state: 'sin-vencimiento' };
  const end = new Date(`${expiresAt}T23:59:59-05:00`);
  const daysLeft = Math.ceil((end - new Date()) / 86400000);
  return { expiresAt, daysLeft, state: daysLeft < 0 ? 'vencida' : daysLeft <= 15 ? 'por-vencer' : 'vigente' };
}

// Datos de una empresa; con uso, además consulta su base (más lento).
export async function getCompany(slug, { withUsage = false } = {}) {
  const env = readCompanyEnv(slug);
  if (!env) return null;
  const [docker, use] = await Promise.all([dockerState(slug), withUsage ? usage(slug) : null]);
  return {
    slug,
    name: env.COMPANY_NAME || slug,
    port: Number(env.WEB_PORT) || null,
    url: env.WEB_PORT ? `http://127.0.0.1:${env.WEB_PORT}` : null,
    plan: env.PLAN || null,
    modules: list(env.LICENSED_MODULES),
    features: list(env.LICENSED_FEATURES),
    limits: {
      maxUsers: limit(env.MAX_USERS),
      maxBranches: limit(env.MAX_BRANCHES),
      maxCashRegisters: limit(env.MAX_CASH_REGISTERS),
    },
    license: licenseStatus(env.LICENSE_EXPIRES_AT || null),
    demoMode: env.DEMO_MODE === 'true',
    docker,
    usage: use,
  };
}

export async function listCompanies({ withUsage = false } = {}) {
  return Promise.all(companySlugs().map(slug => getCompany(slug, { withUsage })));
}

// Nunca se devuelven claves ni cadenas de conexión a la interfaz.
export const isSecretKey = (key) => CLAVES_SECRETAS.includes(key);
