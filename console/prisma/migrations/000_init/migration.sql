-- Consola de VALETEC: usuarios, empresas administradas e historial.

-- CreateTable
CREATE TABLE "console_users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "pass" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "console_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_companies" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "managed_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_audit" (
    "id" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "slug" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "userId" INTEGER,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "console_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "console_users_user_key" ON "console_users"("user");

-- CreateIndex
CREATE UNIQUE INDEX "managed_companies_slug_key" ON "managed_companies"("slug");

-- CreateIndex
CREATE INDEX "console_audit_createdAt_idx" ON "console_audit"("createdAt");

