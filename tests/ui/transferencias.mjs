import { URL, DIR, browser, errores, verificar, sesion, irA, resumen } from './lib.mjs';

const vn = await sesion('vendnorte', 'vendnorteClave2026');
verificar('El vendedor (sin Inventario ni Kardex) no ve Transferencias', await vn.locator('aside').getByRole('button', { name: 'Transferencias' }).count() === 0);

const an = await sesion('almnorte', 'almnorteClave2026');
await irA(an, 'Transferencias');
const m = an.locator('main');
verificar('El origen es su sucursal, fijo', await m.getByText('Sucursal Norte', { exact: true }).first().isVisible() && await m.locator('select').count() === 1);
await m.locator('select').selectOption({ label: 'Principal' });
await m.getByPlaceholder(/Buscar producto/).fill('CEM');
await m.getByRole('button', { name: /Cemento/ }).click();
await m.getByLabel('Cantidad de Cemento').fill('999');
verificar('Avisa si pide más de lo disponible y bloquea el botón', await m.getByText(/Solo hay/).isVisible() && await m.getByRole('button', { name: /^.*Transferir$/ }).isDisabled());
await m.getByLabel('Cantidad de Cemento').fill('1');
await m.getByPlaceholder(/Nota/).fill('Prueba de pantalla');
await m.getByRole('button', { name: /^.*Transferir$/ }).click();
await an.waitForTimeout(1200);
verificar('Registra la transferencia y la muestra en el historial', await m.getByText(/TRF-\d+ registrada/).isVisible() && await m.getByText('Prueba de pantalla').first().isVisible());
await an.screenshot({ path: `${DIR}/f6-9-transferencias.png` });
const movil = await sesion('almnorte', 'almnorteClave2026', { width: 390, height: 844 });
const ancho = await movil.evaluate(() => document.documentElement.scrollWidth);
verificar('En celular no hay scroll horizontal', ancho <= 390, ancho);
await resumen();
