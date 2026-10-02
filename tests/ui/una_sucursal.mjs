import { URL, DIR, browser, errores, verificar, sesion, irA, resumen } from './lib.mjs';

const admin = await sesion('admin', 'AdminFase5_2026');
verificar('Sin sucursal en el encabezado', await admin.locator('header').getByText('Principal').count() === 0);
verificar('Sin menú de Transferencias', await admin.locator('aside').getByRole('button', { name: 'Transferencias' }).count() === 0);
await irA(admin, 'Productos');
await admin.locator('main').getByText('Cemento').first().waitFor();
verificar('Inventario sin columnas de sucursal', await admin.locator('main').getByText('Stock (mi sucursal)').count() === 0 && await admin.locator('main').getByText(/Empresa:/).count() === 0);
await irA(admin, 'Personal');
verificar('Personal sin sucursal', await admin.locator('main').getByText('Principal').count() === 0);
await irA(admin, 'Configuración');
verificar('Configuración sí ofrece crear sucursales', await admin.locator('main').getByText('Agregar sucursal').isVisible());
await resumen();
