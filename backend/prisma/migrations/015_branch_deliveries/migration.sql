-- Envíos a domicilio activables por sucursal, con cualquier modo de trabajo. Las sucursales existentes
-- los mantienen activos (antes dependían solo del módulo Entregas de la empresa).

-- AlterTable
ALTER TABLE "branches" ADD COLUMN "deliveriesEnabled" BOOLEAN NOT NULL DEFAULT true;
