# Rubros

El núcleo comercial (`src/modules/`) es igual para cualquier comercio. Lo propio de un rubro vive aquí, en un
paquete por rubro (documento de arquitectura, sección 3.4). Cada empresa tiene un solo rubro, que viene en
su licencia (`INDUSTRY`, catálogo en `packages/shared/industries.js`).

```
industries/
  hooks.ts        Los puntos de enganche: qué puede hacer un paquete y con qué datos.
  registry.ts     Un paquete por rubro y cómo los llama el núcleo.
  index.ts        El paquete de esta empresa. Es lo único que importan los módulos.
  http.ts         Rutas propias de cada rubro (/api/rubro/...). Solo lo importa server.ts.
  ferreteria/     El paquete de ferretería.
```

## Qué puede hacer un paquete

Un enganche corre **dentro de la transacción** del paso del núcleo, y solo puede:

- **rechazar** el paso, lanzando un `AppError` con un mensaje para el usuario (no vender un producto vencido);
- **guardar sus propios datos** (a qué lote corresponde una entrada de stock).

No cambia precios, cantidades ni estados. Si un rubro necesita eso, la regla es del núcleo y se hace
configurable allí. Por eso las presentaciones (caja x 12, blíster x 10) y la venta fraccionada (metro,
tableta) son del núcleo: cada producto las configura.

Además de sus enganches, el paquete da su **vocabulario** (`business`, `product`…): `/api/settings` lo
entrega y las pantallas lo usan en vez de escribir "ferretería" o "producto" a mano.

| Enganche | Dónde lo llama el núcleo |
|---|---|
| `beforeSale` | Venta directa del POS y pedido nuevo, con los precios ya calculados y antes de guardar. |
| `onStockMovement` | Cada entrada o salida física: compra, movimiento manual, transferencia (salida y entrada), venta y despacho. Las reservas de un pedido no cuentan: el stock sigue en el local. |

## Campos propios del rubro

Un rubro que necesita más datos en una entidad del núcleo no agrega columnas sueltas al modelo de todos:
los guarda en la columna JSON `industryData` de esa entidad (hoy, los productos). El paquete declara su
esquema Zod en `fields.product`, y el núcleo lo valida al crear o editar (`parseProductData`). Sin esquema,
como en ferretería, solo se acepta vacío (`RUBRO_DATOS_INVALIDOS`): nada se guarda sin que el paquete lo
haya validado.

Una línea que entra al stock (compra o ingreso manual) también puede traer datos del rubro: el paquete
los valida con `fields.stockEntry` y llegan a `onStockMovement` en `movement.data`.

Lo que tiene varias filas por producto (los lotes de farmacia, con su cantidad y vencimiento) no es un
campo: el paquete trae sus propias tablas (sección del paquete al final de `prisma/schema.prisma`) y las
llena desde `onStockMovement`.

## Farmacia

- Productos: registro sanitario, principio activo, laboratorio, «requiere receta» y «controlado» (un
  controlado siempre pide receta).
- Lotes (`farmacia_lotes`): solo los identificados. Lo que no tiene lote es el stock de la sucursal menos la
  suma de sus lotes, así el stock inicial y las importaciones no descuadran nada.
- Salidas: primero lo que vence antes (FEFO) y al final lo que no tiene lote. Una venta no toma lotes
  vencidos (`FARMACIA_STOCK_VENCIDO`); una salida manual o una transferencia sí, empezando por lo vencido.
  Una transferencia lleva los mismos lotes a la sucursal de destino.
- Ventas (`beforeSale`): si el carrito tiene productos con receta pide el número; con un controlado, también
  el médico (con su CMP) y el paciente (`FARMACIA_RECETA`). La receta queda en `ventas.industryData`, de
  donde sale el libro de controlados. Lo vencido no cuenta como disponible: si no alcanza lo vigente, la
  venta o el pedido se rechaza diciendo cuánto hay vigente y cuánto vencido.
- Rutas (`farmacia/routes.ts`): `GET /api/rubro/vencimientos?days=` (inventario o movimientos) y
  `GET /api/rubro/controlados?from=&to=` (solo el administrador). En otros rubros no existen (404).

## Sumar un rubro

1. Agregarlo al catálogo en `packages/shared/industries.js` (y su tipo en `industries.d.ts`).
2. Crear `industries/<rubro>/index.ts` con sus enganches y registrarlo en `PACKAGES` (`registry.ts`); el
   typecheck avisa si falta.
3. Probar los enganches sin base de datos, con un `Tx` falso, como en `registry.test.ts`.
