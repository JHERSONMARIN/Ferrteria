-- Tablas de la Fase 1 (configuración de empresa y series).
-- Idempotente: algunas bases ya las recibieron por "prisma db push" antes de adoptar migraciones.

-- CreateTable
CREATE TABLE IF NOT EXISTS "business_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "taxId" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "currencySymbol" TEXT NOT NULL DEFAULT 'S/',
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "ticketFooter" TEXT,
    "enabledModules" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "document_series" (
    "id" SERIAL NOT NULL,
    "documentType" "TipoComprobante" NOT NULL,
    "series" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "document_series_series_key" ON "document_series"("series");

