import { prisma } from '../src/db.js';
import { hashPassword, isPasswordHashed } from '../src/services/passwords.js';

// Convierte a hash las contraseñas que aún estén en texto plano (instalaciones anteriores y
// usuarios del seed de demo). Es idempotente: las ya convertidas no se tocan.
try {
  const users = await prisma.usuario.findMany({ select: { id: true, pass: true } });
  const legacy = users.filter(u => !isPasswordHashed(u.pass));
  for (const user of legacy) {
    await prisma.usuario.update({ where: { id: user.id }, data: { pass: await hashPassword(user.pass) } });
  }
  if (legacy.length > 0) {
    console.log(`[passwords] ${legacy.length} contraseña(s) en texto plano convertidas a hash.`);
  }
} finally {
  await prisma.$disconnect();
}
