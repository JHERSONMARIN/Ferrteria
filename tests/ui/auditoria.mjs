import { URL, DIR, browser, errores, verificar, sesion, irA, resumen } from './lib.mjs';

const vend = await sesion('vendedor', 'vendedorClave2026');
verificar('El vendedor no ve "Auditoría" en el menú', await vend.locator('aside').getByRole('button', { name: 'Auditoría' }).count() === 0);

const admin = await sesion('admin', 'AdminFase5_2026');
await irA(admin, 'Auditoría');
await admin.waitForTimeout(1000);
const main = admin.locator('main');
verificar('Lista los registros', await main.locator('li').getByText('Cambio de precio').first().isVisible());
await main.getByLabel('Acción').selectOption('USER_UPDATED');
await admin.waitForTimeout(800);
verificar('Filtra por acción', await main.locator('li').getByText('Cierre de caja').count() === 0 && await main.locator('li').getByText('Usuario modificado').first().isVisible());
await main.getByRole('button', { name: /Usuario temporal/ }).first().click();
verificar('Al abrir un registro muestra antes/después', await main.getByText('VENDEDOR', { exact: true }).first().isVisible()
  && await main.getByText('restablecida').first().isVisible());
await admin.screenshot({ path: `${DIR}/f6-1-auditoria.png` });
await main.getByRole('button', { name: /Limpiar filtros/ }).click();
await admin.waitForTimeout(600);
const movil = await sesion('admin', 'AdminFase5_2026', { width: 390, height: 844 });
// La última pestaña abierta se recuerda: en celular ya aparece Auditoría.
await movil.locator('main').getByText('Limpiar filtros').waitFor();
await movil.waitForTimeout(1000);
const ancho = await movil.evaluate(() => document.documentElement.scrollWidth);
verificar('En celular no hay scroll horizontal', ancho <= 390, ancho);
await movil.screenshot({ path: `${DIR}/f6-2-auditoria-movil.png` });
await resumen();
