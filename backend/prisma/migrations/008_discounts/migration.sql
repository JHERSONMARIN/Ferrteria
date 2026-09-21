-- Fase 5: descuento sobre el total de la venta, con tope por rol configurable.

-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN     "maxDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountById" INTEGER;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_discountById_fkey" FOREIGN KEY ("discountById") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
