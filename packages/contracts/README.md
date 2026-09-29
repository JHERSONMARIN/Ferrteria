# @ferresys/contracts

Lo que el servidor recibe y responde, escrito una sola vez y usado por los dos lados:

- **El backend** declara que sus respuestas cumplen el contrato: `res.json(x satisfies Sendable<Pedido>)`.
- **El frontend** tipa lo que pide: `api.get<Pedido[]>('/pedidos')`.

Si alguien cambia un campo en el servidor sin cambiar el contrato, el backend deja de compilar; si cambia el
contrato, dejan de compilar las pantallas que usan ese campo. `npm test` corre los dos chequeos de tipos.

## Reglas

- **Solo tipos.** Se importa siempre con `import type`. El paquete no exporta código: Node no ejecuta
  TypeScript dentro de `node_modules` y Vite no tiene nada que empaquetar. Una importación de un valor falla
  al compilar, a propósito.
- Un archivo por módulo del backend (`sales.ts`, `catalog.ts`…), con los mismos nombres de campos que viajan
  por la red (algunos en castellano, como `numDoc` o `detalles`, porque así los usa la API).
- Las fechas viajan como texto ISO (`IsoDate`). Del lado del servidor, `Sendable<T>` admite `Date` donde el
  contrato dice texto, porque `res.json()` las convierte.
