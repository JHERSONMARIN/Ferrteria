# Frontend de FerreSys

React 18 + Vite, en TypeScript estricto. Las direcciones son reales (`/vender`, `/caja`, `/productos`…,
con React Router) y los datos del servidor se piden con TanStack Query.

## Carpetas

```
src/
  main.tsx          Arranque: TanStack Query, el router y los estilos.
  app/              La aplicación: sesión, inicio de sesión, menú, encabezado, buscador (Ctrl+K) y las
                    pantallas (screens.ts: id → dirección, título e ícono).
  api/              client.ts (fetch con errores tipados), queryClient.ts (claves compartidas) y
                    queries.ts (datos que usan varias pantallas: productos, clientes, caja, sucursales…).
  shared/           Lo que no es de una función: componentes base (ui/), impresión del ticket (print/),
                    escáner (scanner/), importación de planillas (import/), constantes y utilidades.
  features/<función>/
                    Una carpeta por función, con los mismos nombres de negocio que los módulos del backend:
                    ventas, caja, catalogo, inventario, compras, entregas, clientes, personal, reportes,
                    auditoria, configuracion. Cada una tiene sus pantallas (*Page.tsx) y, en components/,
                    sus ventanas y piezas. Lo que solo usa una función vive en su carpeta.
```

## Reglas

- **Datos de la API**: se tipan con `@ferresys/contracts` (`packages/contracts`), el mismo contrato que
  cumple el backend. Si un campo cambia en el servidor, la pantalla deja de compilar.
- **Pedir datos**: con `useQuery` y una clave de `queryKeys`. Después de guardar, se invalida la clave de
  lo que cambió (por ejemplo, vender invalida productos, clientes y el estado de caja) y todas las
  pantallas que la usan se actualizan solas. Las colas de caja, despacho y entregas usan
  `refetchInterval`; no hay `setInterval` ni eventos de ventana para esto.
- **Ventanas (modales)**: van en `components/` de su función y guardan su propio formulario. La pantalla
  solo decide cuándo se abren y qué hacer al guardar.
- **Imports**: con la extensión (`./cart.ts`, `./PosPage.tsx`).
- `npm run typecheck` verifica los tipos (también corre en `npm test` desde la raíz). La imagen se
  construye desde la raíz del repositorio para incluir los contratos (ver `Dockerfile.dockerignore`).
- **Rubro**: las palabras que dependen del rubro ("ferretería", "productos"…) salen de `useVocabulary()`
  (`shared/industry/`), que las toma de la configuración; no se escriben a mano. Las pantallas propias de
  un rubro (control de vencimientos en farmacia) se agregan cuando exista el primero: se muestran según el
  `industry` que devuelve `/api/settings`.
