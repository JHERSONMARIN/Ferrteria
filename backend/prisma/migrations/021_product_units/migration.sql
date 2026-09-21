-- Varias presentaciones de venta por producto (paquete, ciento, kilo…).

-- CreateTable
CREATE TABLE "product_units" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "factor" DECIMAL(12,3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "wholesalePrice" DECIMAL(12,2),
    "code" TEXT,
    "allowsFractions" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productoId" INTEGER NOT NULL,

    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_units_code_key" ON "product_units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_productoId_name_key" ON "product_units"("productoId", "name");

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Una presentación contiene una cantidad positiva de la unidad base.
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_factor_positive" CHECK ("factor" > 0);

-- AlterTable
ALTER TABLE "detalle_ventas" ADD COLUMN "unitId" INTEGER,
ADD COLUMN "unitName" TEXT,
ADD COLUMN "unitFactor" DECIMAL(12,3) NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "detalle_cotizaciones" ADD COLUMN "unitId" INTEGER,
ADD COLUMN "unitName" TEXT,
ADD COLUMN "unitFactor" DECIMAL(12,3) NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "detalle_ventas" ADD CONSTRAINT "detalle_ventas_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "product_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_cotizaciones" ADD CONSTRAINT "detalle_cotizaciones_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "product_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
