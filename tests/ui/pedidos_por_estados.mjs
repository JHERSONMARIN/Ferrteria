import { DIR, verificar, sesion, irA, resumen, cambiarModo } from './lib.mjs';

const menu = async (page) => page.locator('aside nav').innerText();

// 1. El administrador elige "Por etapas" desde Configuración
const admin = await sesion('admin', 'AdminRegresion2026');
await cambiarModo(admin, 'Por etapas');
verificar('Al guardar el modo aparece la guía para asignar módulos al personal', await admin.getByText(/Asigne en Personal los módulos/).isVisible());
await admin.getByText('Modo de trabajo').first().scrollIntoViewIfNeeded();
await admin.screenshot({ path: `${DIR}/pedidos-1-modo.png` });
const menuAdmin = await menu(admin);
verificar('El menú del admin muestra "Por cobrar" y "Por despachar" sin volver a entrar',
  menuAdmin.includes('Por cobrar') && menuAdmin.includes('Por despachar'), menuAdmin);

// 2. Vendedor: arma el pedido y lo envía a caja
const vendedor = await sesion('vendedor', 'vendedorClave2026');
const menuVendedor = await menu(vendedor);
verificar('El vendedor ve el POS pero no "Por cobrar" ni "Por despachar"',
  menuVendedor.includes('Vender') && !menuVendedor.includes('Por cobrar') && !menuVendedor.includes('Por despachar'), menuVendedor);
const buscador = vendedor.getByPlaceholder(/Escanee o busque/);
await buscador.fill('P1'); await buscador.press('Enter');
await buscador.fill('P1'); await buscador.press('Enter');
verificar('En modo pedidos el botón dice "Enviar a caja"', await vendedor.getByRole('button', { name: /Enviar a caja/ }).isVisible());
await vendedor.screenshot({ path: `${DIR}/pedidos-2-pos-pedido.png` });
await vendedor.getByRole('button', { name: /Enviar a caja/ }).click();
await vendedor.getByText('Pedido enviado a caja').waitFor();
const numero = (await vendedor.locator('text=/^N° \\d+$/').first().innerText()).trim();
verificar(`Se muestra el número del pedido en grande (${numero})`, /^N° \d+$/.test(numero), numero);
await vendedor.screenshot({ path: `${DIR}/pedidos-3-pedido-enviado.png` });

// 3. Cajero: encuentra el pedido por su número y lo cobra
const cajero = await sesion('cajero', 'cajeroClave2026');
verificar('El cajero ve "Por cobrar"', (await menu(cajero)).includes('Por cobrar'));
await irA(cajero, 'Por cobrar');
await cajero.getByRole('heading', { name: /Pedidos por cobrar/ }).waitFor();
await cajero.waitForTimeout(800);
verificar('El pedido aparece en la cola del cajero', await cajero.getByText(numero, { exact: true }).first().isVisible());
const busqueda = cajero.getByPlaceholder(/N° de pedido/);
await busqueda.fill(numero.replace('N° ', '')); await busqueda.press('Enter');
await cajero.getByRole('button', { name: /Cobrar S\/ 20\.00/ }).waitFor();
verificar('Escribiendo el número y Enter se abre el detalle (total S/ 20.00)', true);
await cajero.screenshot({ path: `${DIR}/pedidos-4-por-cobrar.png` });
await cajero.getByRole('button', { name: /Cobrar S\/ 20\.00/ }).click();
await cajero.getByRole('button', { name: /Pago exacto/ }).click();
await cajero.getByRole('button', { name: /Confirmar cobro/ }).click();
await cajero.getByText('Pedido cobrado').waitFor({ timeout: 15000 });
verificar('El cajero ve "Pedido cobrado" con la indicación de ir a despacho', await cajero.getByText(/recoja sus productos en despacho/).isVisible());
await cajero.screenshot({ path: `${DIR}/pedidos-5-cobrado.png` });
await cajero.getByRole('button', { name: 'Siguiente pedido' }).click();

// 4. Almacén: entrega el pedido pagado
const almacen = await sesion('almacen', 'almacenClave2026');
const menuAlmacen = await menu(almacen);
verificar('Almacén solo ve "Por despachar"', menuAlmacen.includes('Por despachar') && !menuAlmacen.includes('Vender'), menuAlmacen);
await irA(almacen, 'Por despachar');
await almacen.locator('main').getByText(/Por despachar \(\d+\)/).waitFor();
await almacen.waitForTimeout(800);
await almacen.getByText(numero, { exact: true }).first().click();
verificar('Almacén ve cuántas unidades entregar', await almacen.getByText('Productos a entregar').isVisible());
await almacen.screenshot({ path: `${DIR}/pedidos-6-por-despachar.png` });
await almacen.getByRole('button', { name: /Marcar como entregado/ }).click();
await almacen.getByText(`Pedido ${numero} entregado.`).first().waitFor();
verificar('Almacén marca el pedido como entregado', true);

// 5. De vuelta a modo directo: el POS cobra con la ventana de cobro reutilizada
await cambiarModo(admin, 'Directo');
verificar('En modo directo desaparecen "Por cobrar" y "Por despachar"', !(await menu(admin)).includes('Por cobrar'));
await irA(admin, 'Vender');
const b = admin.getByPlaceholder(/Escanee o busque/);
await b.waitFor();
await b.fill('P3'); await b.press('Enter');
await admin.getByRole('button', { name: /Cobrar.*F9/ }).click();
await admin.getByRole('button', { name: '10', exact: true }).first().click();
await admin.getByRole('button', { name: /Confirmar cobro/ }).click();
await admin.getByText('Venta registrada').first().waitFor({ timeout: 15000 });
verificar('Venta directa desde el POS con vuelto (paga con un billete de 10 por S/ 1)', await admin.getByText('S/ 9.00').first().isVisible());
await admin.screenshot({ path: `${DIR}/pedidos-7-directo.png` });

await resumen();
