-- Fase 3: estados de venta, modo de trabajo de la empresa y stock reservado.

CREATE TYPE "SaleStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'DISPATCHED', 'CANCELLED');
CREATE TYPE "SaleFlowMode" AS ENUM ('DIRECT', 'SEPARATE_CASHIER', 'STAGED');

ALTER TABLE "productos" ADD COLUMN "reserved" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ventas"
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "dispatchedById" INTEGER,
  ADD COLUMN "cotizacionId" INTEGER,
  ALTER COLUMN "numDoc" DROP NOT NULL;

-- El estado pasa de texto libre a enum conservando los datos: las ventas existentes
-- ("COMPLETADO") ya fueron cobradas y entregadas, es decir, están despachadas.
ALTER TABLE "ventas" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ventas" ALTER COLUMN "status" TYPE "SaleStatus"
  USING (CASE WHEN "status" IN ('ANULADO', 'ANULADA', 'CANCELADO') THEN 'CANCELLED' ELSE 'DISPATCHED' END)::"SaleStatus";
ALTER TABLE "ventas" ALTER COLUMN "status" SET DEFAULT 'DISPATCHED';

UPDATE "ventas" SET "paidAt" = "createdAt", "dispatchedAt" = "createdAt" WHERE "status" = 'DISPATCHED';

ALTER TABLE "business_settings" ADD COLUMN "saleFlowMode" "SaleFlowMode" NOT NULL DEFAULT 'DIRECT';

CREATE INDEX "ventas_status_idx" ON "ventas"("status");

ALTER TABLE "ventas" ADD CONSTRAINT "ventas_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
