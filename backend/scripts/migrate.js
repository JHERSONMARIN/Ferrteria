import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { prisma } from '../src/db.js';

const BASELINE_MIGRATION = '000_init';
const MIGRATIONS_DIR = new URL('../prisma/migrations/', import.meta.url);

const run = (command) => execSync(command, { stdio: 'inherit' });

// Una base creada con "prisma db push" tiene tablas pero no historial de migraciones.
async function isLegacyDatabase() {
  const [row] = await prisma.$queryRaw`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS "hasHistory",
           to_regclass('public.usuarios') IS NOT NULL AS "hasTables"`;
  return !row.hasHistory && row.hasTables;
}

// Prisma aplica las migraciones en orden alfabético de carpeta. Hasta la Fase 6 se llamaban "0_init",
// "1_…", y "10_…" quedaba antes que "1_…": en una base nueva se aplicaban en desorden. Ahora llevan tres
// dígitos ("000_init"); en las bases existentes se actualiza el nombre registrado. El contenido del
// archivo no cambió, así que su checksum sigue coincidiendo.
async function renameLegacyMigrations() {
  const [row] = await prisma.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS "hasHistory"`;
  if (!row.hasHistory) return;
  for (const folder of readdirSync(MIGRATIONS_DIR)) {
    const match = folder.match(/^(\d{3})_(.+)$/);
    if (!match) continue;
    const legacyName = `${Number(match[1])}_${match[2]}`;
    const renamed = await prisma.$executeRaw`
      UPDATE "_prisma_migrations" SET "migration_name" = ${folder} WHERE "migration_name" = ${legacyName}`;
    if (renamed > 0) console.log(`[migrate] Migración ${legacyName} registrada como ${folder}.`);
  }
}

try {
  await renameLegacyMigrations();
  if (await isLegacyDatabase()) {
    console.log(`[migrate] Base sin historial de migraciones: se marca ${BASELINE_MIGRATION} como aplicada.`);
    run(`npx prisma migrate resolve --applied ${BASELINE_MIGRATION}`);
  }
} finally {
  await prisma.$disconnect();
}

run('npx prisma migrate deploy');
