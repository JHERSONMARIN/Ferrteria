# Módulos del backend

El código se organiza por **negocio**, no por tipo de archivo: todo lo de un tema vive en su carpeta
(documento de arquitectura, secciones 6 y 9.2).

| Módulo | Qué contiene | Forma |
|---|---|---|
| `sales` | Venta directa, pedidos por estados, cotizaciones, series de comprobante, quién despacha | Capas |
| `cash` | Cajas físicas, turnos compartidos, arqueo | Capas |
| `inventory` | Stock por sucursal con reservas, kardex, transferencias | Capas |
| `licensing` | Plan contratado: módulos, funciones, límites, vencimiento | Capas |
| `deliveries` | Envíos a domicilio y repartidores | Capas |
| `catalog` | Productos, presentaciones de venta, categorías, importación | Capas |
| `identity` | Inicio de sesión, sesión de cada petición, permisos, personal | Simple |
| `customers` | Clientes, lista de precios, crédito y abonos | Simple |
| `purchasing` | Proveedores y compras | Simple |
| `reports` | Panel de inicio y reportes por período | Simple |
| `audit` | Registro de auditoría y su consulta | Simple |
| `settings` | Configuración de la empresa | Simple |
| `branches` | Sucursales, su modo de trabajo y sus envíos | Simple |

Fuera de los módulos quedan lo transversal: `db.ts` (cliente de Prisma), `lib/validation.ts` (Zod),
`utils/quantities.ts` (redondeo de cantidades y dinero), `config/` y `types/`. `db.js` y `config/modules.js`
siguen en JavaScript a propósito: los scripts de `deploy/` y la consola los leen por esa ruta.

## Módulos con capas (los que mueven dinero, stock o permisos)

```
modules/<modulo>/
  domain/          Reglas y tipos puros. No importa Express, Prisma ni process.env.
                   Se prueba sin base de datos: domain/*.test.ts.
  application/     Casos de uso: el orden de los pasos. Pide lo que necesita (un repositorio,
                   la hora) sin decir cómo se obtiene.
  infrastructure/  El cómo: Prisma, variables de entorno, servicios externos.
  interface/       La puerta HTTP: rutas, validación de la entrada (Zod) y respuestas.
  index.ts         Lo que el resto del sistema puede usar del módulo. Nadie importa sus carpetas internas.
```

Regla de dependencia: `interface → application → domain`; `infrastructure` implementa lo que pide
`application`. El dominio no importa nada de afuera, salvo los errores de `@ferresys/shared/errors`.

Una capa que no tiene nada que poner no se crea: no se escriben archivos vacíos por ceremonia.

## Módulos simples (mantenimiento de datos: categorías, proveedores…)

Una carpeta con sus rutas y, si hace falta, su acceso a datos. Sin capas. Un módulo simple pasa a tener
capas el día que le aparece su primera regla de negocio propia.

## TypeScript

- Node 22 ejecuta los `.ts` directamente; `npm run typecheck` verifica los tipos (corre en `npm test`).
- Los imports entre archivos `.ts` llevan la extensión: `import { x } from './license.ts'`.
- Sin `enum` ni `namespace` (no se pueden borrar sin compilar): se usan uniones de textos y objetos.
- La entrada de datos (cuerpos de peticiones, variables de entorno) se valida con Zod, y el tipo se
  obtiene del mismo esquema (`z.infer`). `z` se importa de `@ferresys/contracts/zod` (una sola copia de Zod).

## Contratos con las pantallas

Lo que responde cada ruta está escrito en `packages/contracts`, y el frontend usa esos mismos tipos. Lo que
**recibe** también: los esquemas Zod de los cuerpos (`CreateBranchBody`, `DirectSaleBody`…) están en el
contrato del módulo; la ruta los aplica con `parseInput` y la capa `application/` recibe datos ya tipados.
Las reglas que necesitan la base (que el producto exista, que haya caja abierta) siguen en `application/`.
Una respuesta se ata a su contrato con `satisfies`:

```ts
res.json({ user: req.user } satisfies Sendable<MeResponse>);
```

Si la respuesta deja de cumplir el contrato, `npm run typecheck` falla aquí; si cambia el contrato, fallan las
pantallas que usan el campo cambiado.

## Núcleo y rubro

Cada módulo indica al inicio de su `index.ts` si es del **núcleo** (igual para cualquier comercio) o
propio de **ferretería**. Lo propio del rubro es lo que un paquete de rubro podrá reemplazar o extender.
Los paquetes de rubro viven en `src/industries/` y se enganchan en pasos concretos de `application/`
(ver su README).
