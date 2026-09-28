import { URL, DIR, browser, errores, verificar, sesion, irA, resumen } from './lib.mjs';

const vend = await sesion('vendedor', 'vendedorClave2026');
await irA(vend, 'Vender');
const buscador = vend.getByPlaceholder(/Escanee o busque/);
await buscador.waitFor();
await buscador.fill('CEM'); await buscador.press('Enter');
const main = vend.locator('main');
verificar('Sin cliente el cemento entra a precio de lista (S/ 30)', await main.getByText('S/ 30.00').first().isVisible());
await vend.getByPlaceholder(/Público general/).fill('20611112222');
await vend.waitForTimeout(400);
verificar('Al elegir el cliente mayorista aparece el aviso', await vend.getByText('Precios mayoristas').isVisible());
verificar('…y el carrito se recalcula a S/ 27', await main.getByText('S/ 27.00').first().isVisible());
verificar('La tarjeta del producto marca "Mayorista"', await main.getByText('Mayorista', { exact: true }).first().isVisible());

await vend.getByRole('button', { name: /Aplicar descuento/ }).click();
const campo = vend.getByPlaceholder('0', { exact: true });
await campo.fill('20');
verificar('20 % supera el tope del vendedor', await vend.getByText('Su descuento máximo es 10 %.').isVisible());
verificar('…y el botón Cobrar queda deshabilitado', await vend.getByRole('button', { name: /Cobrar.*F9/ }).isDisabled());
await campo.fill('10');
verificar('Con 10 % muestra el descuento', await main.getByText('− S/ 2.70').isVisible());
verificar('…y el total baja a S/ 24.30', await main.getByText('S/ 24.30').first().isVisible());
await vend.screenshot({ path: `${DIR}/f5-1-pos-descuento.png` });

await vend.getByRole('button', { name: /Cobrar.*F9/ }).click();
await vend.getByRole('button', { name: /Confirmar cobro/ }).click();
await vend.waitForTimeout(1200);
verificar('La venta se registra mostrando el descuento', await vend.getByText('Descuento aplicado').isVisible());
await vend.screenshot({ path: `${DIR}/f5-2-venta-registrada.png` });

const admin = await sesion('admin', 'AdminFase5_2026');
await admin.locator('aside').getByRole('button', { name: /Configuración/ }).click();
await admin.waitForTimeout(800);
verificar('Configuración muestra la sección Descuentos', await admin.getByText('Descuento máximo (%)').isVisible());
await admin.getByText('Descuento máximo (%)').scrollIntoViewIfNeeded();
await admin.screenshot({ path: `${DIR}/f5-3-configuracion.png` });

await resumen();
