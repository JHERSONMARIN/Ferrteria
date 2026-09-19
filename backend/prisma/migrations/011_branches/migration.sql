-- Fase 6: sucursales/almacenes con stock por sucursal. Todo lo existente pasa a la sucursal
-- "Principal" (id 1). productos.stock/reserved quedan como total de la empresa.

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- Las fechas se guardan en UTC (la sesión de PostgreSQL está en hora de Lima).
INSERT INTO "branches" ("id", "name", "createdAt", "updatedAt")
VALUES (1, 'Principal', NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC');
SELECT setval(pg_get_serial_sequence('"branches"', 'id'), 1);

-- AlterTable: usuarios y cajas conservan el valor por defecto; ventas, compras y kardex deben indicarlo.
ALTER TABLE "usuarios" ADD COLUMN "branchId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "cash_registers" ADD COLUMN "branchId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ventas" ADD COLUMN "branchId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ventas" ALTER COLUMN "branchId" DROP DEFAULT;
ALTER TABLE "movimientos_kardex" ADD COLUMN "branchId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "movimientos_kardex" ALTER COLUMN "branchId" DROP DEFAULT;
ALTER TABLE "compras" ADD COLUMN "branchId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "compras" ALTER COLUMN "branchId" DROP DEFAULT;

-- CreateTable
CREATE TABLE "branch_stock" (
    "id" SERIAL NOT NULL,
    "stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "branchId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,

    CONSTRAINT "branch_stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_stock_productoId_idx" ON "branch_stock"("productoId");
CREATE UNIQUE INDEX "branch_stock_branchId_productoId_key" ON "branch_stock"("branchId", "productoId");

-- Todo el stock actual está en la sucursal Principal.
INSERT INTO "branch_stock" ("branchId", "productoId", "stock", "reserved")
SELECT 1, "id", "stock", "reserved" FROM "productos";

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_kardex" ADD CONSTRAINT "movimientos_kardex_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compras" ADD CONSTRAINT "compras_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
