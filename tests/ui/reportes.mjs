import { URL, DIR, browser, errores, verificar, sesion, irA, resumen } from './lib.mjs';

async function sesionAdmin(viewport) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errores.push(e.message));
  await page.goto(URL);
  await page.locator('input').nth(0).fill('admin');
  await page.locator('input[type=password]').first().fill('AdminFase5_2026');
  await page.getByRole('button', { name: 'Ingresar al Sistema' }).click();
  await page.waitForTimeout(1500);
  return page;
}
const page = await sesionAdmin({ width: 1440, height: 900 });
await irA(page, 'Reportes');
await page.waitForTimeout(800);
const main = page.locator('main');
await main.getByRole('tab', { name: /Reportes por período/ }).click();
await page.waitForTimeout(1200);
verificar('Muestra los indicadores del período', await main.getByText('Ventas cobradas').isVisible() && await main.getByText('Ticket promedio').isVisible());
verificar('Tabla de vendedores', await main.getByRole('heading', { name: 'Ventas por vendedor' }).isVisible());
verificar('Tabla de cobros por cajero', await main.getByText('Cajera Dos').first().isVisible());
verificar('Productos más vendidos', await main.getByText('Clavos 2"').first().isVisible());
await main.getByRole('button', { name: /Sin movimiento/ }).click();
verificar('Rotación: sin movimiento muestra el candado', await main.getByText('Candado viejo').isVisible());
const [descarga] = await Promise.all([
  page.waitForEvent('download'),
  main.locator('section', { hasText: 'Productos más vendidos' }).getByRole('button', { name: 'CSV' }).click(),
]);
const ruta = `${DIR}/productos.csv`;
await descarga.saveAs(ruta);
const fs = await import('node:fs');
const csv = fs.readFileSync(ruta, 'utf8');
verificar('Descarga el CSV con encabezados y datos', csv.startsWith('﻿Código;Producto') && csv.includes('CLA;"Clavos 2"""'), csv.slice(0, 120));
await main.getByRole('button', { name: 'Hoy' }).click();
await page.waitForTimeout(800);
verificar('El filtro "Hoy" deja un solo día', await main.getByText('1 día(s)').isVisible());
await main.getByRole('button', { name: '30 días' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${DIR}/f6-6-reportes.png`, fullPage: true });
const movil = await sesionAdmin({ width: 390, height: 844 });
await movil.waitForTimeout(800);
const ancho = await movil.evaluate(() => document.documentElement.scrollWidth);
verificar('En celular no hay scroll horizontal de la página', ancho <= 390, ancho);
await resumen();
