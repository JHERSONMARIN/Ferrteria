-- Campos que agrega el paquete de rubro de la empresa (registro sanitario en farmacia…). Los valida el
-- paquete (backend/src/industries); el núcleo solo los guarda. Los productos existentes quedan sin datos.

-- AlterTable
ALTER TABLE "productos" ADD COLUMN "industryData" JSONB NOT NULL DEFAULT '{}';
