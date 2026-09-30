import { DIR, verificar, sesion, irA, resumen } from './lib.mjs';

// La prueba de API deja una farmacia con lotes (uno vencido), un producto con receta y una venta de un controlado.
const admin = await sesion('admin', 'AdminFarmacia2026');
const menu = admin.locator('aside');
verificar('El menú de la farmacia tiene Vencimientos y el libro de controlados',
  await menu.getByText('Vencimientos').isVisible() && await menu.getByText('Libro de controlados').isVisible());

await irA(admin, 'Vencimientos');
const main = admin.locator('main');
verificar('Vencimientos muestra el lote vencido para retirarlo', await main.getByText('Vencido: retírelo').first().isVisible());
verificar('…y el stock sin lote', await main.getByText('Stock sin lote', { exact: true }).isVisible());
await admin.screenshot({ path: `${DIR}/farmacia-1-vencimientos.png` });

await irA(admin, 'Libro de controlados');
verificar('El libro muestra la venta del controlado con su paciente', await main.getByText('Ana Ruiz').isVisible());
await admin.screenshot({ path: `${DIR}/farmacia-2-controlados.png` });

await irA(admin, 'Vender');
const buscador = admin.getByPlaceholder(/Escanee o busque/);
await buscador.waitFor();
await buscador.fill('AMOX'); await buscador.press('Enter');
verificar('Con un producto con receta el POS pide el número', await admin.getByLabel('N° de receta').isVisible());
await admin.getByRole('button', { name: /Cobrar.*F9/ }).click();
verificar('…y no deja cobrar sin él', await admin.getByText('Indique el número de receta.').isVisible());
await admin.getByLabel('N° de receta').fill('R-100');
await admin.getByRole('button', { name: /Cobrar.*F9/ }).click();
await admin.getByRole('button', { name: /Confirmar cobro/ }).click();
await admin.waitForTimeout(1200);
verificar('Con la receta la venta se registra', await admin.getByText('Venta registrada').isVisible());
await admin.screenshot({ path: `${DIR}/farmacia-3-receta.png` });

await resumen();
