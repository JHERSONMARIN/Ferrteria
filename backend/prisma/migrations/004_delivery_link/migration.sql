-- Fase 4: la entrega nace de una venta; datos de contacto propios y seguimiento de salida y entrega.
-- Borrar un cliente ya no borra en cascada su historial de entregas (antes: ON DELETE CASCADE).

-- DropForeignKey
ALTER TABLE "entregas" DROP CONSTRAINT "entregas_clienteId_fkey";

-- AlterTable
ALTER TABLE "entregas" ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "departedAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "ventaId" INTEGER,
ALTER COLUMN "clienteId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "entregas_ventaId_key" ON "entregas"("ventaId");

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Las entregas ya completadas toman como fecha de entrega su última actualización.
UPDATE "entregas" SET "deliveredAt" = "updatedAt" WHERE "status" = 'ENTREGADO';
