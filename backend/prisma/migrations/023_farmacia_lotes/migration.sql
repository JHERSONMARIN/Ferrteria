-- Paquete de farmacia: lotes con vencimiento por sucursal. En las demás empresas la tabla queda vacía.

-- CreateTable
CREATE TABLE "farmacia_lotes" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expiresAt" DATE NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farmacia_lotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farmacia_lotes_productoId_branchId_lotNumber_expiresAt_key" ON "farmacia_lotes"("productoId", "branchId", "lotNumber", "expiresAt");

-- CreateIndex
CREATE INDEX "farmacia_lotes_branchId_expiresAt_idx" ON "farmacia_lotes"("branchId", "expiresAt");

-- AddForeignKey
ALTER TABLE "farmacia_lotes" ADD CONSTRAINT "farmacia_lotes_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmacia_lotes" ADD CONSTRAINT "farmacia_lotes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
