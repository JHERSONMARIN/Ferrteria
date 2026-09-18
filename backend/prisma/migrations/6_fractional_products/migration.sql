-- Fase 5: productos que se venden fraccionados (hasta 3 decimales).

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "allowsFractions" BOOLEAN NOT NULL DEFAULT false;

