import { execSync } from 'node:child_process';
import { prisma } from '../src/db.js';

const BASELINE_MIGRATION = '0_init';

const run = (command) => execSync(command, { stdio: 'inherit' });

// Una base creada con "prisma db push" tiene tablas pero no historial de migraciones.
async function isLegacyDatabase() {
  const [row] = await prisma.$queryRaw`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS "hasHistory",
           to_regclass('public.usuarios') IS NOT NULL AS "hasTables"`;
  return !row.hasHistory && row.hasTables;
}

try {
  if (await isLegacyDatabase()) {
    console.log(`[migrate] Base sin historial de migraciones: se marca ${BASELINE_MIGRATION} como aplicada.`);
    run(`npx prisma migrate resolve --applied ${BASELINE_MIGRATION}`);
  }
} finally {
  await prisma.$disconnect();
}

run('npx prisma migrate deploy');
