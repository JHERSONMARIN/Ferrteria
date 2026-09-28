import { DIR, verificar, sesion, irA, resumen } from './lib.mjs';

// Circuito de reparto: esperando despacho → el repartidor lo solicita → almacén se lo entrega →
// por salir → en camino → entregado.
const tarjeta = (page, ref) => page.locator('div.rounded-xl.shadow-sm.p-4').filter({ hasText: ref }).first();
const columna = (page, titulo) => page.locator('section').filter({ has: page.getByRole('heading', { name: titulo }) });

// 1. Venta directa con envío a domicilio desde el POS
const admin = await sesion('admin', 'AdminRegresion2026');
await irA(admin, 'Vender');
const buscador = admin.getByPlaceholder(/Escanee o busque/);
await buscador.waitFor();
await buscador.fill('P3'); await buscador.press('Enter');
await admin.getByRole('button', { name: /Cobrar.*F9/ }).click();
verificar('La ventana de cobro ofrece "Envío a domicilio"', await admin.getByRole('button', { name: /Envío a domicilio/ }).isVisible());
await admin.getByRole('button', { name: /Envío a domicilio/ }).click();
await admin.getByRole('button', { name: /Confirmar cobro/ }).click();
verificar('Sin dirección muestra el error', await admin.getByText('Ingrese la dirección de entrega.').isVisible());
await admin.getByPlaceholder(/Dirección: calle/).fill('Av. Atahualpa 789, Cajamarca');
await admin.getByPlaceholder('Teléfono (opcional)').fill('987654321');
await admin.screenshot({ path: `${DIR}/envios-1-cobro.png` });
await admin.getByRole('button', { name: /Confirmar cobro/ }).click();
await admin.getByText('Envío programado').waitFor({ timeout: 15000 });
const ref = (await admin.getByText(/^ENT-/).first().innerText()).trim();
verificar(`La confirmación muestra el envío programado (${ref})`, /^ENT-/.test(ref), ref);
await admin.getByRole('button', { name: 'Nueva venta' }).click();

// 2. El repartidor lo ve esperando despacho y lo solicita (en el celular)
const movil = await sesion('repartidor', 'repartidorClave2026', { width: 390, height: 844 });
await irA(movil, 'Entregas').catch(() => {});  // en el celular el menú está oculto: ya abre en Entregas
await movil.getByRole('heading', { name: /Esperando despacho/ }).waitFor();
await movil.waitForTimeout(800);
verificar(`${ref} aparece en "Esperando despacho"`, (await columna(movil, /Esperando despacho/).innerText()).includes(ref));
const t = tarjeta(movil, ref);
verificar('La dirección abre Google Maps', (await t.locator('a[href*="google.com/maps"]').getAttribute('href')).includes('Atahualpa'));
verificar('El teléfono se puede tocar para llamar', await t.locator('a[href="tel:987654321"]').isVisible());
await t.getByRole('button', { name: /Solicitar este pedido/ }).click();
await movil.waitForTimeout(1000);
verificar('Al solicitarlo puede soltarlo si otro lo va a llevar', await tarjeta(movil, ref).getByRole('button', { name: /Soltar el pedido/ }).isVisible());
await movil.screenshot({ path: `${DIR}/envios-2-solicitado.png` });

// 3. Almacén (aquí el administrador) se lo entrega al repartidor que lo solicitó
await irA(admin, 'Por despachar');
await admin.locator('main').getByText(/Por despachar \(\d+\)/).waitFor();
await admin.waitForTimeout(800);
await admin.locator('main button').filter({ hasText: 'Envío' }).first().click();
await admin.getByText(`Envío a domicilio · ${ref}`).waitFor();
verificar('Viene elegido el repartidor que lo solicitó', await admin.getByText('Repartidor solicitó este pedido.').isVisible());
await admin.getByRole('button', { name: /Marcar como entregado/ }).click();
await admin.getByText(/entregado a Repartidor/).first().waitFor();
verificar('Se registra a qué repartidor se entregó', true);

// 4. El repartidor sale y lo entrega
await movil.reload();
await tarjeta(movil, ref).getByText('Despachado a:').waitFor();
verificar(`${ref} pasa a "Por salir", despachado a él`,
  (await columna(movil, /Por salir/).innerText()).includes(ref) && /Despachado a:\s*Repartidor/.test(await tarjeta(movil, ref).innerText()));
await tarjeta(movil, ref).getByRole('button', { name: /Salir a repartir/ }).click();
await movil.waitForTimeout(1200);
verificar(`${ref} pasa a "En camino"`, (await columna(movil, /En camino/).innerText()).includes(ref));
await tarjeta(movil, ref).getByRole('button', { name: /^.*Entregado$/ }).click();
await movil.getByRole('button', { name: 'Sí, se entregó' }).click();
await movil.waitForTimeout(1200);
const activas = (await movil.locator('section').allInnerTexts()).join(' ');
verificar(`${ref} sale de las columnas activas al entregarse`, !activas.includes(ref), activas);
await movil.getByRole('button', { name: /Finalizadas/ }).click();
await movil.waitForTimeout(1000);
verificar('Y aparece en "Finalizadas" como Entregado', (await tarjeta(movil, ref).innerText()).includes('Entregado'));
const anchoPagina = await movil.evaluate(() => document.documentElement.scrollWidth);
verificar('En el celular no hay desplazamiento horizontal', anchoPagina <= 390, anchoPagina);
await movil.screenshot({ path: `${DIR}/envios-3-repartidor-movil.png` });

await resumen();
