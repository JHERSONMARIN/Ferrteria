# @ferresys/contracts

Lo que el servidor recibe y responde, escrito una sola vez y usado por los dos lados:

- **Respuestas** (solo tipos): el backend declara que cumple el contrato con
  `res.json(x satisfies Sendable<Pedido>)` y el frontend tipa lo que pide: `api.get<Pedido[]>('/pedidos')`.
- **Peticiones** (esquemas Zod): el backend valida el cuerpo con el esquema (`parseInput(DirectSaleBody,
  req.body, …)`) y el frontend tipa lo que envía con el tipo que sale del mismo esquema
  (`DirectSaleRequest = z.input<typeof DirectSaleBody>`). Un campo nuevo se agrega en un solo lugar.

Si alguien cambia un campo en el servidor sin cambiar el contrato, el backend deja de compilar; si cambia el
contrato, dejan de compilar las pantallas que usan ese campo. `npm test` corre los dos chequeos de tipos.

## Reglas

- Un archivo por módulo del backend (`sales.ts`, `catalog.ts`…), con los mismos nombres de campos que viajan
  por la red (algunos en castellano, como `numDoc` o `detalles`, porque así los usa la API).
- Los esquemas se llaman como el cuerpo que validan (`CreateBranchBody`, `PurchaseBody`) y su tipo de
  entrada termina en `Request`. Los mensajes de error van en cada esquema, en español: llegan al usuario.
- Un esquema valida **la forma** (tipos, largos, valores permitidos). Lo que depende de la base o de la
  licencia (que el producto exista, que el plan lo incluya) lo revisa el backend en `application/`.
- `z` se importa de `./zod.ts`, que también trae los ayudantes `id` y `optionalId`. El backend importa `z`
  de `@ferresys/contracts/zod`: así hay una sola copia de Zod.
- **El frontend importa siempre con `import type`**: las pantallas no cargan Zod (el servidor valida).
- Las fechas viajan como texto ISO (`IsoDate`). Del lado del servidor, `Sendable<T>` admite `Date` donde el
  contrato dice texto, porque `res.json()` las convierte.

## Cómo corre

Node 22 ejecuta los `.ts` de este paquete directamente: el enlace `file:` apunta a `packages/contracts`, que
no está dentro de `node_modules`. Zod se instala en el propio paquete (`npm ci --prefix packages/contracts`,
lo hacen las imágenes del backend y del frontend); en una copia nueva del repositorio hay que correrlo una vez.
