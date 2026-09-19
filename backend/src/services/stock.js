// Operaciones de stock atómicas por sucursal. Disponible = stock - reserved (reserved: pedidos sin
// despachar). Cada operación es un UPDATE condicional sobre la fila de la sucursal: si otra transacción
// tomó las unidades antes, no se actualiza ninguna fila y se informa el disponible real. Después se
// ajusta el total de la empresa (productos.stock/reserved) con la misma cantidad, en la misma
// transacción, así el total siempre es la suma de las sucursales. El orden (sucursal y luego producto)
// es el mismo en todas las operaciones para que las transacciones concurrentes no se bloqueen entre sí.
// Las fechas se escriben en UTC porque la sesión de PostgreSQL está en hora de Lima.

import { roundQuantity } from '../utils/quantities.js';

export class StockError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

async function insufficientStock(tx, productId, branchId) {
  const product = await tx.producto.findUnique({ where: { id: productId }, select: { name: true, active: true } });
  if (!product || !product.active) return new StockError('El producto no existe o no está activo.');
  const row = await tx.branchStock.findUnique({
    where: { branchId_productoId: { branchId, productoId: productId } },
    select: { stock: true, reserved: true },
  });
  const available = row ? Math.max(row.stock - row.reserved, 0) : 0;
  return new StockError(`Stock insuficiente para ${product.name}. Disponible: ${available}.`);
}

const branchStockAfter = async (tx, productId, branchId) =>
  (await tx.branchStock.findUnique({ where: { branchId_productoId: { branchId, productoId: productId } }, select: { stock: true } })).stock;

async function adjustProductTotals(tx, productId, stockDelta, reservedDelta) {
  await tx.$executeRaw`
    UPDATE "productos" SET "stock" = "stock" + ${stockDelta}, "reserved" = "reserved" + ${reservedDelta},
      "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE "id" = ${productId}`;
}

// Venta inmediata o salida manual: descuenta del disponible de la sucursal. Devuelve el stock de la sucursal.
export async function takeAvailableStock(tx, productId, qty, branchId) {
  const updated = await tx.$executeRaw`
    UPDATE "branch_stock" SET "stock" = "stock" - ${qty}
    WHERE "branchId" = ${branchId} AND "productoId" = ${productId} AND "stock" - "reserved" >= ${qty}
      AND EXISTS (SELECT 1 FROM "productos" WHERE "id" = ${productId} AND "active" = true)`;
  if (updated === 0) throw await insufficientStock(tx, productId, branchId);
  await adjustProductTotals(tx, productId, -qty, 0);
  return branchStockAfter(tx, productId, branchId);
}

// Compra, entrada manual o transferencia recibida: suma al stock de la sucursal (crea la fila si no
// existía). Devuelve el stock de la sucursal.
export async function addStock(tx, productId, qty, branchId) {
  const [row] = await tx.$queryRaw`
    INSERT INTO "branch_stock" ("branchId", "productoId", "stock") VALUES (${branchId}, ${productId}, ${qty})
    ON CONFLICT ("branchId", "productoId") DO UPDATE SET "stock" = "branch_stock"."stock" + EXCLUDED."stock"
    RETURNING "stock"::float8 AS stock`;
  await adjustProductTotals(tx, productId, qty, 0);
  return row.stock;
}

// Pedido: aparta unidades de la sucursal sin sacarlas todavía del almacén.
export async function reserveStock(tx, productId, qty, branchId) {
  const updated = await tx.$executeRaw`
    UPDATE "branch_stock" SET "reserved" = "reserved" + ${qty}
    WHERE "branchId" = ${branchId} AND "productoId" = ${productId} AND "stock" - "reserved" >= ${qty}
      AND EXISTS (SELECT 1 FROM "productos" WHERE "id" = ${productId} AND "active" = true)`;
  if (updated === 0) throw await insufficientStock(tx, productId, branchId);
  await adjustProductTotals(tx, productId, 0, qty);
}

// Despacho de un pedido: las unidades reservadas salen del almacén de la sucursal.
export async function consumeReservedStock(tx, productId, qty, branchId) {
  const updated = await tx.$executeRaw`
    UPDATE "branch_stock" SET "stock" = "stock" - ${qty}, "reserved" = "reserved" - ${qty}
    WHERE "branchId" = ${branchId} AND "productoId" = ${productId} AND "reserved" >= ${qty} AND "stock" >= ${qty}`;
  if (updated === 0) {
    throw new StockError('El stock reservado del pedido no coincide con el almacén. Revise el producto en Kardex.');
  }
  await adjustProductTotals(tx, productId, -qty, -qty);
  return branchStockAfter(tx, productId, branchId);
}

// Pedido anulado o vencido: devuelve las unidades apartadas al disponible de la sucursal. Se libera
// en el total exactamente lo que se liberó en la sucursal, para que sigan cuadrando.
export async function releaseReservedStock(tx, productId, qty, branchId) {
  const [row] = await tx.$queryRaw`
    SELECT "reserved"::float8 AS reserved FROM "branch_stock"
    WHERE "branchId" = ${branchId} AND "productoId" = ${productId} FOR UPDATE`;
  const released = row ? roundQuantity(Math.min(qty, row.reserved)) : 0;
  if (released <= 0) return;
  await tx.$executeRaw`
    UPDATE "branch_stock" SET "reserved" = "reserved" - ${released}
    WHERE "branchId" = ${branchId} AND "productoId" = ${productId}`;
  await adjustProductTotals(tx, productId, 0, -released);
}

// Sucursal principal: la primera activa. Recibe el stock de productos que aún no tienen fila.
export async function mainBranchId(db) {
  const branch = await db.branch.findFirst({ where: { active: true }, orderBy: { id: 'asc' }, select: { id: true } });
  return branch?.id ?? 1;
}

// Red de seguridad al arrancar: productos creados por otra vía (datos de demostración, scripts) sin
// fila de stock por sucursal reciben una en la principal con su stock actual.
export async function ensureBranchStockRows(db) {
  const branchId = await mainBranchId(db);
  const inserted = await db.$executeRaw`
    INSERT INTO "branch_stock" ("branchId", "productoId", "stock", "reserved")
    SELECT ${branchId}, p."id", p."stock", p."reserved" FROM "productos" p
    WHERE NOT EXISTS (SELECT 1 FROM "branch_stock" b WHERE b."productoId" = p."id")`;
  if (inserted > 0) console.log(`[stock] ${inserted} producto(s) sin stock por sucursal asignados a la sucursal principal.`);
}
