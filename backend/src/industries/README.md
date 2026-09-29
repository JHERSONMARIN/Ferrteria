# Rubros

El núcleo comercial (`src/modules/`) es igual para cualquier comercio. Lo propio de un rubro vive aquí, en un
paquete por rubro (documento de arquitectura, sección 3.4). Cada empresa tiene un solo rubro, que viene en
su licencia (`INDUSTRY`, catálogo en `packages/shared/industries.js`).

```
industries/
  hooks.ts        Los puntos de enganche: qué puede hacer un paquete y con qué datos.
  registry.ts     Un paquete por rubro y cómo los llama el núcleo.
  index.ts        El paquete de esta empresa. Es lo único que importan los módulos.
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

## Sumar un rubro

1. Agregarlo al catálogo en `packages/shared/industries.js` (y su tipo en `industries.d.ts`).
2. Crear `industries/<rubro>/index.ts` con sus enganches y registrarlo en `PACKAGES` (`registry.ts`); el
   typecheck avisa si falta.
3. Probar los enganches sin base de datos, con un `Tx` falso, como en `registry.test.ts`.
