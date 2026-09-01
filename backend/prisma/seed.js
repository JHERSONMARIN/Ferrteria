import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de datos para FerreSys v4.8...');

  // 1. Usuario Admin por defecto
  const adminUser = await prisma.usuario.upsert({
    where: { user: 'admin' },
    update: {},
    create: {
      name: 'Pedro Admin',
      user: 'admin',
      pass: '1234',
      role: 'ADMINISTRADOR',
      modules: ['pos', 'inventory', 'kardex', 'deliveries', 'client-dir', 'customers', 'personal', 'dashboard', 'caja', 'compras'],
      active: true,
    },
  });

  // Vendedor demo
  const vendedorUser = await prisma.usuario.upsert({
    where: { user: 'vendedor1' },
    update: {},
    create: {
      name: 'Juan Pérez',
      user: 'vendedor1',
      pass: '1234',
      role: 'VENDEDOR',
      modules: ['pos', 'inventory', 'kardex', 'deliveries', 'client-dir'],
      active: true,
    },
  });

  // Repartidor demo
  const repartidorUser = await prisma.usuario.upsert({
    where: { user: 'repartidor1' },
    update: {},
    create: {
      name: 'Carlos Ruiz',
      user: 'repartidor1',
      pass: '1234',
      role: 'REPARTIDOR',
      modules: ['deliveries'],
      active: true,
    },
  });

  console.log('✅ Usuarios creados');

  // 2. Productos iniciales
  const defaultProducts = [
    { code: '77501', name: 'Cemento Sol', unit: 'Bolsa', stock: 120, price: 28.50 },
    { code: '77502', name: 'Fierro Corrugado 1/2"', unit: 'Unidad', stock: 45, price: 35.00 },
    { code: '77503', name: 'Cable THW 14 AWG', unit: 'Metro', stock: 500, price: 1.50 },
    { code: '77504', name: 'Pintura Látex Vencedor', unit: 'Galón', stock: 12, price: 145.00 }
  ];

  for (const prod of defaultProducts) {
    const createdProd = await prisma.producto.upsert({
      where: { code: prod.code },
      update: {},
      create: prod,
    });

    // Registrar kardex inicial si tiene stock
    if (prod.stock > 0) {
      const existingKardex = await prisma.movimientoKardex.findFirst({
        where: { productoId: createdProd.id, ref: 'Stock Inicial al Registrar' }
      });

      if (!existingKardex) {
        await prisma.movimientoKardex.create({
          data: {
            productoId: createdProd.id,
            type: 'ENTRADA',
            qty: prod.stock,
            stockAfter: prod.stock,
            ref: 'Stock Inicial al Registrar',
          }
        });
      }
    }
  }

  console.log('✅ Productos e inventario inicial registrados');

  // 3. Cliente Demo
  const clienteDemo = await prisma.cliente.upsert({
    where: { doc: '20601234567' },
    update: {},
    create: {
      type: 'EMPRESA',
      doc: '20601234567',
      name: 'CONSTRUCTORA VALETEC S.A.C.',
      phone: '987654321',
      email: 'contacto@valetec.com',
      address: 'Av. Industrial 456, Cajamarca',
    },
  });

  console.log('✅ Cliente demo registrado');
  console.log('🎉 Seed completado exitosamente.');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
