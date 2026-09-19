-- Fase 5: dinero (2 decimales) y cantidades (3 decimales, para vender por metro o kilo) como
-- DECIMAL exacto en lugar de Float/Int. La conversión es en el lugar y no pierde datos.

-- AlterTable
ALTER TABLE "productos" ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "reserved" SET DEFAULT 0,
ALTER COLUMN "reserved" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "minStock" SET DEFAULT 10,
ALTER COLUMN "minStock" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "clientes" ALTER COLUMN "maxCredit" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ventas" ALTER COLUMN "mixCash" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "mixDigital" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "detalle_ventas" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "movimientos_kardex" ALTER COLUMN "qty" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "stockAfter" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "detalle_entregas" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "creditos_cliente" ALTER COLUMN "debtTotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "maxCredit" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "abonos_credito" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "cajas_chicas" ALTER COLUMN "montoInicial" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "ventasEfectivo" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "ventasDigital" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "montoCierreConteo" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "diferencia" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "compras" ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "detalle_compras" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "cotizaciones" ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "detalle_cotizaciones" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2);

