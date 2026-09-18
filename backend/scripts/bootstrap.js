import { randomBytes } from 'node:crypto';
import { prisma } from '../src/db.js';
import { AVAILABLE_MODULES } from '../src/services/settings.js';
import { hashPassword } from '../src/services/passwords.js';

// Prepara una base recién creada para una empresa nueva: configuración y administrador inicial.
// En bases que ya tienen usuarios no hace nada, por lo que puede ejecutarse en cada arranque.
async function bootstrap() {
  const userCount = await prisma.usuario.count();
  if (userCount > 0) return;

  const legalName = process.env.COMPANY_NAME?.trim() || 'Mi Ferretería';
  await prisma.businessSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, legalName, enabledModules: AVAILABLE_MODULES },
  });

  const adminUser = process.env.INITIAL_ADMIN_USER?.trim() || 'admin';
  const providedPassword = process.env.INITIAL_ADMIN_PASSWORD?.trim();
  const password = providedPassword || randomBytes(9).toString('base64url');

  await prisma.usuario.create({
    data: {
      name: 'Administrador',
      user: adminUser,
      pass: await hashPassword(password),
      role: 'ADMINISTRADOR',
      modules: AVAILABLE_MODULES,
      active: true,
      mustChangePassword: true,
    },
  });

  console.log(`[bootstrap] Empresa "${legalName}" inicializada. Administrador: ${adminUser}`);
  if (!providedPassword) {
    console.log(`[bootstrap] Contraseña generada (se muestra solo esta vez): ${password}`);
  }
}

try {
  await bootstrap();
} finally {
  await prisma.$disconnect();
}
