-- Fase 5: lista de precios por cliente (minorista / mayorista) y precio mayorista por producto.

-- CreateEnum
CREATE TYPE "PriceList" AS ENUM ('RETAIL', 'WHOLESALE');

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "wholesalePrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "priceList" "PriceList" NOT NULL DEFAULT 'RETAIL';

