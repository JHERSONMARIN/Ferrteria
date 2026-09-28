// Utilidades comunes de las pruebas de interfaz (Playwright). Las corre tests/run.py después de la
// prueba de API de su cadena, que deja la empresa con los usuarios y datos que aquí se usan.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const URL = process.env.FERRESYS_URL || 'http://127.0.0.1:23990';
// Las capturas quedan junto a la salida de las pruebas (tests/.salida/capturas), fuera de git.
export const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../.salida/capturas');
mkdirSync(DIR, { recursive: true });

export const resultados = [];
export const errores = [];

export const verificar = (nombre, cond, detalle = '') => {
  resultados.push(!!cond);
  console.log(`${cond ? 'OK   ' : 'FALLA'} ${nombre}${!cond && detalle ? `  → ${detalle}` : ''}`);
};

export const browser = await chromium.launch();

// Abre un navegador independiente con la sesión del usuario ya iniciada.
export async function sesion(usuario, clave, viewport = { width: 1440, height: 900 }) {
  const page = await (await browser.newContext({ viewport })).newPage();
  page.on('pageerror', e => errores.push(`${usuario}: ${e.message}`));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { window.print = () => {}; });
  await page.goto(URL);
  await page.locator('input').nth(0).fill(usuario);
  await page.locator('input[type=password]').first().fill(clave);
  await page.getByRole('button', { name: 'Ingresar al Sistema' }).click();
  await page.locator('aside').waitFor();
  await page.waitForTimeout(1000);
  return page;
}

// Estas opciones viven en el menú del usuario, al pie de la barra lateral.
const MENU_USUARIO = ['Configuración', 'Cambiar contraseña', 'Cerrar sesión'];

// Navega con el menú lateral por el nombre visible de la opción.
export const irA = async (page, nombre) => {
  const aside = page.locator('aside');
  if (MENU_USUARIO.includes(nombre)) {
    await aside.locator('button:has(.fa-circle-user)').click();
  }
  // El nombre accesible incluye el glifo del ícono y, a veces, un contador: se ignora lo que no es letra.
  const texto = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await aside.getByRole('button', { name: new RegExp(`^[^\\p{L}]*${texto}[^\\p{L}]*$`, 'u') }).first().click();
  await page.waitForTimeout(800);
};

// Cierra el navegador, imprime el total y termina con código 1 si algo falló.
export async function resumen() {
  verificar('Sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  console.log(`\nResultado: ${resultados.filter(Boolean).length}/${resultados.length} pruebas OK`);
  await browser.close();
  process.exit(resultados.every(Boolean) ? 0 : 1);
}
