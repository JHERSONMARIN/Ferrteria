# Pruebas de FerreSys

Suite de punta a punta: prueba la API y la interfaz contra una instancia real, levantada en un entorno
aislado que no toca las empresas ni el stack de desarrollo.

## Correrlas

Requisitos: Docker, Python 3 y Node 20 o más. La primera vez, instalar Playwright y su navegador:

```bash
cd tests
npm install
npx playwright install chromium
```

Luego, desde la raíz del proyecto:

```bash
npm test                               # todo: API e interfaz (unos 6 minutos)
npm run test:api                       # solo API (unos 3 minutos)
python3 tests/run.py sucursales        # solo las cadenas que incluyen ese archivo
python3 tests/run.py --sin-build       # no reconstruye las imágenes (si el código no cambió)
python3 tests/run.py --mantener        # deja el entorno levantado para revisarlo
```

Termina con código 0 si todo pasa y 1 si algo falla, así que sirve igual en un servidor de integración.

## Qué hace

1. Levanta `tests/docker-compose.yml`: PostgreSQL con los datos en memoria, backend y web, en
   `http://127.0.0.1:23990` (se cambia con `TEST_WEB_PORT`).
2. Antes de cada **cadena** borra la base: la empresa queda recién creada, con el administrador `admin`
   y la clave temporal `ClaveTemporal2026`.
3. Corre en orden las pruebas de la cadena. Dentro de una cadena comparten la base: cada prueba parte
   de lo que dejó la anterior (usuarios, productos, turnos de caja).
4. Muestra cada falla y guarda la salida completa de cada prueba en `tests/.salida/` (las capturas de
   pantalla, en `tests/.salida/capturas/`).
5. Al terminar baja el entorno.

Las cadenas están en `CADENAS`, en `tests/run.py`.

## Organización

| Carpeta | Qué contiene |
|---|---|
| `api/` | Pruebas en Python contra la API (sin dependencias externas). `lib.py` tiene lo común: sesiones, SQL, stock y cajas. |
| `ui/` | Pruebas de pantalla con Playwright. `lib.mjs` tiene lo común: iniciar sesión, navegar por el menú, confirmar ventanas. |

| Tema | API | Interfaz |
|---|---|---|
| Sesiones, contraseñas, permisos y licencia | `seguridad.py` | `seguridad.mjs` |
| Registro, códigos de error y versión | `observabilidad.py` | |
| Pedidos, cobro, despacho y reservas de stock | `pedidos_por_estados.py` | `pedidos_por_estados.mjs` |
| Envíos a domicilio y repartidores | `envios.py` | `envios.mjs` |
| Fracciones, precios mayoristas y descuentos | `cantidades_y_precios.py` | `cantidades_y_precios.mjs` |
| Modo de trabajo por sucursal | `modo_por_sucursal.py` | |
| Auditoría | `auditoria.py` | `auditoria.mjs` |
| Cajas físicas y turnos compartidos | `caja_compartida.py` | `caja_compartida.mjs` |
| Reportes | `reportes.py` | `reportes.mjs` |
| Sucursales y stock por sucursal | `sucursales.py` | `sucursales.mjs`, `una_sucursal.mjs` |
| Transferencias | `transferencias.py` | `transferencias.mjs` |
| Series de comprobante por sucursal | `series_sucursal.py` | `series_sucursal.mjs` |

## Agregar una prueba

- **API**: un archivo en `api/` que empiece con `from lib import *`, use `verificar(nombre, condición,
  detalle)` y termine con `resumen()`.
- **Interfaz**: un archivo en `ui/` que importe lo necesario de `./lib.mjs` y termine con
  `await resumen()`.
- Agregarlo a una cadena en `tests/run.py`: al final de una existente si necesita sus datos, o en una
  cadena nueva si parte de una empresa vacía.

Si cambia un comportamiento a propósito, se actualiza la prueba en el mismo commit que el cambio.

Toda prueba de API verifica además, al terminar, que cada respuesta de error que recibió traiga
`codigo` y `requestId` (ver `backend/src/utils/errors.js`).
