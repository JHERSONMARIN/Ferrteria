import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de datos para FerreSys v4.8...');

  // 1. Usuario Admin por defecto
  const adminUser = await prisma.usuario.upsert({
    where: { user: 'admin' },
    update: {
      role: 'ADMINISTRADOR',
      modules: ['pos', 'inventory', 'categories', 'kardex', 'deliveries', 'client-dir', 'customers', 'personal', 'dashboard', 'caja', 'compras'],
      active: true,
    },
    create: {
      name: 'Pedro Admin',
      user: 'admin',
      pass: '1234',
      role: 'ADMINISTRADOR',
      modules: ['pos', 'inventory', 'categories', 'kardex', 'deliveries', 'client-dir', 'customers', 'personal', 'dashboard', 'caja', 'compras'],
      active: true,
    },
  });

  // Vendedor demo (solo POS según requerimiento)
  const vendedorUser = await prisma.usuario.upsert({
    where: { user: 'vendedor1' },
    update: {
      role: 'VENDEDOR',
      modules: ['pos'],
      active: true,
    },
    create: {
      name: 'Juan Pérez',
      user: 'vendedor1',
      pass: '1234',
      role: 'VENDEDOR',
      modules: ['pos'],
      active: true,
    },
  });

  // Cajero demo
  const cajeroUser = await prisma.usuario.upsert({
    where: { user: 'cajero1' },
    update: {
      role: 'CAJERO',
      modules: ['pos', 'caja'],
      active: true,
    },
    create: {
      name: 'María Cajera',
      user: 'cajero1',
      pass: '1234',
      role: 'CAJERO',
      modules: ['pos', 'caja'],
      active: true,
    },
  });

  // Repartidor demo
  const repartidorUser = await prisma.usuario.upsert({
    where: { user: 'repartidor1' },
    update: {
      role: 'REPARTIDOR',
      modules: ['deliveries'],
      active: true, 
    },
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

  // 2. Categorías iniciales de ferretería
  const defaultCategories = [
    { name: 'Ferretería general', icon: 'fa-hammer', color: 'orange', description: 'Materiales básicos de construcción y ferretería' },
    { name: 'Herramientas', icon: 'fa-wrench', color: 'blue', description: 'Herramientas manuales y eléctricas para trabajo pesado' },
    { name: 'Tornillería y fijaciones', icon: 'fa-screwdriver', color: 'slate', description: 'Tornillos, clavos, pernos, tarugos y anclajes' },
    { name: 'Electricidad', icon: 'fa-bolt', color: 'yellow', description: 'Cables, tomacorrientes, interruptores e iluminación' },
    { name: 'Plomería', icon: 'fa-faucet-drip', color: 'cyan', description: 'Tuberías, conexiones PVC, griferías y válvulas' },
    { name: 'Pinturas y acabados', icon: 'fa-paint-roller', color: 'purple', description: 'Esmaltes, látex, brochas, rodillos y solventes' },
    { name: 'Adhesivos y selladores', icon: 'fa-bottle-droplet', color: 'emerald', description: 'Siliconas, pegamentos de contacto y masillas' },
    { name: 'Cerrajería', icon: 'fa-key', color: 'amber', description: 'Cerraduras, candados, bisagras y pasadores' },
    { name: 'Seguridad', icon: 'fa-shield-halved', color: 'red', description: 'EPP, cascos, guantes, lentes y arneses' },
    { name: 'Jardinería', icon: 'fa-seedling', color: 'green', description: 'Mangueras, aspersores, palas y accesorios de jardín' },
    { name: 'Accesorios y consumibles', icon: 'fa-boxes-packing', color: 'indigo', description: 'Cintas, lijas, discos de corte y consumibles' },
    { name: 'General', icon: 'fa-layer-group', color: 'gray', description: 'Productos generales y diversos' },
  ];

  const categoryMap = {};
  for (const cat of defaultCategories) {
    const createdCat = await prisma.categoria.upsert({
      where: { name: cat.name },
      update: { icon: cat.icon, color: cat.color, description: cat.description },
      create: cat,
    });
    categoryMap[cat.name] = createdCat.id;
  }
  console.log('✅ Categorías de ferretería sembradas');

  // 3. Productos iniciales
  const defaultProducts = [
    { code: '77501', name: 'Cemento Sol', unit: 'Bolsa', stock: 120, price: 28.50, category: 'Ferretería general' },
    { code: '77502', name: 'Fierro Corrugado 1/2"', unit: 'Unidad', stock: 45, price: 35.00, category: 'Ferretería general' },
    { code: '77503', name: 'Cable THW 14 AWG', unit: 'Metro', stock: 500, price: 1.50, category: 'Electricidad' },
    { code: '77504', name: 'Pintura Látex Vencedor', unit: 'Galón', stock: 12, price: 145.00, category: 'Pinturas y acabados' }
  ];

  for (const prod of defaultProducts) {
    const catId = categoryMap[prod.category] || null;
    const createdProd = await prisma.producto.upsert({
      where: { code: prod.code },
      update: { category: prod.category, categoriaId: catId },
      create: { ...prod, categoriaId: catId },
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
