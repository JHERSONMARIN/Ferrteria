-- Fase 6: series de comprobante por sucursal. Las series existentes quedan en la sucursal Principal.

-- AlterTable
ALTER TABLE "document_series" ADD COLUMN "branchId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "document_series" ALTER COLUMN "branchId" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "document_series_branchId_documentType_idx" ON "document_series"("branchId", "documentType");

-- AddForeignKey
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
