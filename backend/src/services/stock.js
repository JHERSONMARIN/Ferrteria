// Operaciones de stock atómicas. Disponible = stock - reserved (reserved: pedidos sin despachar).
// Cada operación es un único UPDATE condicional: si otra transacción tomó las unidades antes,
// no se actualiza ninguna fila y se informa el disponible real. Los valores van como parámetros.

export class StockError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

async function insufficientStock(tx, productId) {
  const product = await tx.producto.findUnique({
    where: { id: productId },
    select: { name: true, stock: true, reserved: true, active: true },
  });
  if (!product || !product.active) return new StockError('El producto no existe o no está activo.');
  const available = Math.max(product.stock - product.reserved, 0);
  return new StockError(`Stock insuficiente para ${product.name}. Disponible: ${available}.`);
}

const stockAfter = async (tx, productId) =>
  (await tx.producto.findUnique({ where: { id: productId }, select: { stock: true } })).stock;

// Venta inmediata: descuenta del stock disponible.
export async function takeAvailableStock(tx, productId, qty) {
  const updated = await tx.$executeRaw`
    UPDATE "productos" SET "stock" = "stock" - ${qty}, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE "id" = ${productId} AND "active" = true AND "stock" - "reserved" >= ${qty}`;
  if (updated === 0) throw await insufficientStock(tx, productId);
  return stockAfter(tx, productId);
}

// Pedido: aparta unidades sin sacarlas todavía del almacén.
export async function reserveStock(tx, productId, qty) {
  const updated = await tx.$executeRaw`
    UPDATE "productos" SET "reserved" = "reserved" + ${qty}, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE "id" = ${productId} AND "active" = true AND "stock" - "reserved" >= ${qty}`;
  if (updated === 0) throw await insufficientStock(tx, productId);
}

// Despacho de un pedido: las unidades reservadas salen del almacén.
export async function consumeReservedStock(tx, productId, qty) {
  const updated = await tx.$executeRaw`
    UPDATE "productos" SET "stock" = "stock" - ${qty}, "reserved" = "reserved" - ${qty}, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE "id" = ${productId} AND "reserved" >= ${qty} AND "stock" >= ${qty}`;
  if (updated === 0) {
    throw new StockError('El stock reservado del pedido no coincide con el almacén. Revise el producto en Kardex.');
  }
  return stockAfter(tx, productId);
}

// Pedido anulado o vencido: devuelve las unidades apartadas al disponible.
export async function releaseReservedStock(tx, productId, qty) {
  await tx.$executeRaw`
    UPDATE "productos" SET "reserved" = GREATEST("reserved" - ${qty}, 0), "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE "id" = ${productId}`;
}
