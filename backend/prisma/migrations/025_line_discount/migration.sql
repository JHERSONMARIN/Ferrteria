-- Descuento por línea: cada línea guarda lo que se le descontó y su subtotal ya descontado
-- (subtotal = cantidad × precio − descuento). ventas.discount pasa a ser todo lo descontado en la venta:
-- las líneas más el descuento sobre el total. Las ventas anteriores no tienen descuentos por línea.

-- AlterTable
ALTER TABLE "detalle_ventas" ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0;
