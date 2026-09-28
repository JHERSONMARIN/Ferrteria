import { URL, DIR, browser, errores, verificar, sesion, irA, resumen } from './lib.mjs';

const c1 = await sesion('cajero', 'cajeroClave2026');
await irA(c1, 'Caja');
const m1 = c1.locator('main');
verificar('Sin turno muestra las cajas', await m1.getByRole('heading', { name: 'Cajas' }).isVisible()
  && await m1.getByText('Caja Principal').first().isVisible() && await m1.getByText('Caja Mostrador').first().isVisible());
await m1.getByRole('button', { name: 'Abrir esta caja' }).first().click();
verificar('Elegir otra caja cambia el formulario de apertura', await m1.getByText('Apertura de Caja Mostrador').isVisible());
await m1.getByRole('button', { name: 'Seleccionada' }).waitFor();
await m1.getByRole('button', { name: /Monto directo/ }).click();
await m1.getByPlaceholder('Ej: 100.00').fill('80');
await m1.getByRole('button', { name: /Abrir Caja Mostrador y comenzar turno/ }).click();
await c1.waitForTimeout(1200);
verificar('Turno abierto con el nombre de la caja', await m1.getByText('CAJA MOSTRADOR ABIERTA').isVisible());
verificar('No ofrece salir siendo el único cajero', await m1.getByRole('button', { name: /Salir del turno/ }).count() === 0);

const c2 = await sesion('cajero2', 'cajero2Clave2026');
await irA(c2, 'Caja');
const m2 = c2.locator('main');
verificar('La cajera 2 ve quién abrió la Caja Mostrador', await m2.getByText(/Abierta por Cajero/).isVisible());
await c2.screenshot({ path: `${DIR}/f6-3-cajas.png` });
await m2.getByRole('button', { name: /Unirme a este turno/ }).click();
await c2.waitForTimeout(1200);
verificar('Se une y ve a ambos cajeros', await m2.getByText('Cajera Dos (usted)').isVisible() && await m2.locator('span', { hasText: /^Cajero$/ }).isVisible());
await c1.waitForTimeout(3500);
verificar('El primer cajero ve a la nueva compañera (refresco automático)', await m1.getByText('Cajera Dos').isVisible());
verificar('Ahora sí puede salir del turno', await m1.getByRole('button', { name: /Salir del turno/ }).isVisible());
await c1.screenshot({ path: `${DIR}/f6-4-turno-compartido.png` });
await m2.getByRole('button', { name: /Salir del turno/ }).click();
await c2.waitForTimeout(1200);
verificar('Al salir vuelve a la lista de cajas', await m2.getByRole('heading', { name: 'Cajas' }).isVisible());

await m1.getByRole('button', { name: /Monto directo/ }).click();
await m1.getByPlaceholder('Ej: 250.00').fill('80');
await m1.getByRole('button', { name: /Ejecutar Cierre/ }).click();
await c1.waitForTimeout(1200);
verificar('Cierra el turno', await m1.getByRole('heading', { name: 'Cajas' }).isVisible());

const admin = await sesion('admin', 'AdminFase5_2026');
await irA(admin, 'Configuración');
const ma = admin.locator('main');
await ma.getByText('Agregar caja').scrollIntoViewIfNeeded();
verificar('Configuración lista las cajas', await ma.getByText('Caja Mostrador').isVisible() && await ma.getByText('Inactiva').isVisible());
await ma.getByPlaceholder(/Nombre de la nueva caja/).fill('Caja Ferretería Norte');
await ma.getByRole('button', { name: /Agregar caja/ }).click();
await admin.waitForTimeout(800);
verificar('Agrega una caja nueva', await ma.getByText('Caja Ferretería Norte creada.').isVisible());
await ma.getByText('Agregar caja').scrollIntoViewIfNeeded();
await admin.screenshot({ path: `${DIR}/f6-5-config-cajas.png` });
await resumen();
