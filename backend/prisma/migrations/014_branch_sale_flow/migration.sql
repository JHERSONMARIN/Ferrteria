-- Fase 6: el modo de trabajo pasa de la empresa a cada sucursal. Todas las sucursales heredan el modo
-- que tenía la empresa.

-- AlterTable
ALTER TABLE "branches" ADD COLUMN "saleFlowMode" "SaleFlowMode" NOT NULL DEFAULT 'DIRECT';

UPDATE "branches" SET "saleFlowMode" = s."saleFlowMode" FROM "business_settings" s WHERE s."id" = 1;

-- AlterTable
ALTER TABLE "business_settings" DROP COLUMN "saleFlowMode";
