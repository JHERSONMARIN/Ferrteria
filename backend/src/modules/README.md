# Módulos del backend

El código se organiza por **negocio**, no por tipo de archivo: todo lo de un tema vive en su carpeta.
Los módulos se migran de a uno desde `src/routes` y `src/services` (ver el documento de arquitectura,
secciones 6 y 9.2). Mientras dure la migración conviven las dos formas.

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
  obtiene del mismo esquema (`z.infer`).

## Núcleo y rubro

Cada módulo indica al inicio de su `index.ts` si es del **núcleo** (igual para cualquier comercio) o
propio de **ferretería**. Lo propio del rubro es lo que un paquete de rubro podrá reemplazar o extender.
