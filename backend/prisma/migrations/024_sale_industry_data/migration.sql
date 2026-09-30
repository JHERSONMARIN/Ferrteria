-- Datos que agrega el paquete de rubro a una venta o pedido (farmacia: la receta). Los valida el paquete.

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN "industryData" JSONB NOT NULL DEFAULT '{}';
