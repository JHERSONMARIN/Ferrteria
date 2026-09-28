import { URL, DIR, browser, errores, verificar, irA, resumen } from './lib.mjs';

// La prueba de API deja a "ana" con clave temporal y la empresa con solo POS, Caja e Inventario contratados.
const context = await browser.newContext({ viewport: { width: 1366, height: 850 } });
const page = await context.newPage();
page.on('pageerror', e => errores.push(e.message));
page.on('dialog', d => d.accept());

const login = async (usuario, clave) => {
  await page.locator('input').nth(0).fill(usuario);
  await page.locator('input[type=password]').first().fill(clave);
  await page.getByRole('button', { name: 'Ingresar al Sistema' }).click();
};

// 1. Cambio obligatorio
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await login('ana', 'Reinicio2026');
await page.getByText('Elija su contraseña').waitFor();
verificar('Clave temporal: aparece la pantalla de cambio obligatorio', true);
verificar('…y no se muestra el sistema detrás', !(await page.locator('aside').isVisible()));
await page.screenshot({ path: `${DIR}/seg-1-cambio-obligatorio.png` });

const campos = page.locator('form input[type=password]');
await campos.nth(0).fill('Reinicio2026');
await campos.nth(1).fill('AnaNueva2026');
await campos.nth(2).fill('OtraCosa2026');
await page.getByRole('button', { name: 'Guardar contraseña' }).click();
verificar('Confirmación distinta muestra error', await page.getByText('Las contraseñas no coinciden.').isVisible());
await campos.nth(2).fill('AnaNueva2026');
await page.getByRole('button', { name: 'Guardar contraseña' }).click();
await page.locator('aside').waitFor();
await page.waitForTimeout(1000);
const menuAna = await page.locator('aside nav').innerText();
verificar('Tras cambiarla, entra al sistema', menuAna.includes('Vender'), menuAna);
verificar('Menú de Ana limitado (sin Productos ni Personal)',
  !menuAna.includes('Productos') && !menuAna.includes('Personal'), menuAna.replace(/\n/g, ' | '));
await page.locator('aside button:has(.fa-circle-user)').click();
verificar('…ni Configuración en su menú de usuario',
  await page.locator('aside').getByRole('button', { name: 'Configuración' }).count() === 0);
await page.keyboard.press('Escape');
await page.screenshot({ path: `${DIR}/seg-2-menu-ana.png` });

// 2. Sesión perdida a mitad de uso
await context.clearCookies();
await page.getByText('Inicio de sesión').waitFor({ timeout: 15000 });
verificar('Si la sesión se pierde, vuelve al login automáticamente', true);
verificar('…avisando al usuario', await page.getByText(/sesión terminó/).isVisible());

// 3. Administrador: solo ve lo contratado
await login('admin', 'AdminCentro2026');
await page.locator('aside').waitFor();
await page.waitForTimeout(1000);
const menuAdmin = await page.locator('aside nav').innerText();
verificar('El pie de la marca muestra la versión', /FerreSys v\d+\.\d+\.\d+/.test(await page.locator('aside').innerText()));
verificar('Menú del admin sin módulos no contratados (Créditos, Movimientos…)',
  !menuAdmin.includes('Créditos') && !menuAdmin.includes('Movimientos') && menuAdmin.includes('Productos'), menuAdmin.replace(/\n/g, ' | '));

// 4. Cambio voluntario
await irA(page, 'Cambiar contraseña');
await page.getByRole('heading', { name: 'Cambiar contraseña' }).waitFor();
await campos.nth(0).fill('AdminCentro2026');
await campos.nth(1).fill('AdminCentro2027');
await campos.nth(2).fill('AdminCentro2027');
await page.getByRole('button', { name: 'Guardar contraseña' }).click();
await page.waitForTimeout(1500);
verificar('Cambio voluntario: se cierra la ventana', await page.getByRole('heading', { name: 'Cambiar contraseña' }).count() === 0);
verificar('…y sigue dentro del sistema (sesión renovada)', await page.locator('aside').isVisible());
await page.waitForTimeout(9000);
verificar('…incluso tras el siguiente latido de sesión', await page.locator('aside').isVisible());

await irA(page, 'Cerrar sesión');
await page.getByText('Inicio de sesión').waitFor();
await login('admin', 'AdminCentro2026');
await page.waitForTimeout(1000);
verificar('La clave anterior ya no sirve', await page.getByText(/Credenciales incorrectas|incorrect/i).first().isVisible());
await login('admin', 'AdminCentro2027');
await page.locator('aside').waitFor();
verificar('La clave nueva sí', true);

await resumen();
