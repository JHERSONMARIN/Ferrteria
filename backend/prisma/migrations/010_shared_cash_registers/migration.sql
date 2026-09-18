-- Fase 6: cajas físicas con turnos compartidos entre varios cajeros.

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "paidById" INTEGER;

-- AlterTable
ALTER TABLE "cajas_chicas" ADD COLUMN     "cashRegisterId" INTEGER;

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_session_members" (
    "id" SERIAL NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "sessionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "cash_session_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_name_key" ON "cash_registers"("name");

-- CreateIndex
CREATE INDEX "cash_session_members_sessionId_idx" ON "cash_session_members"("sessionId");

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas_chicas" ADD CONSTRAINT "cajas_chicas_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_session_members" ADD CONSTRAINT "cash_session_members_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cajas_chicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_session_members" ADD CONSTRAINT "cash_session_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no expresa (índices parciales):
-- una caja tiene a lo más un turno abierto...
CREATE UNIQUE INDEX "cajas_chicas_one_open_per_register" ON "cajas_chicas"("cashRegisterId") WHERE "estado" = 'ABIERTA';
-- ...y un usuario está en a lo más un turno abierto.
CREATE UNIQUE INDEX "cash_session_members_one_open_per_user" ON "cash_session_members"("userId") WHERE "leftAt" IS NULL;

-- Caja inicial de toda empresa.
INSERT INTO "cash_registers" ("name", "updatedAt") VALUES ('Caja Principal', CURRENT_TIMESTAMP);

-- Los turnos existentes pasan a tener como único cajero a quien los abrió. Los abiertos siguen
-- funcionando sin caja asignada hasta que se cierren.
INSERT INTO "cash_session_members" ("sessionId", "userId", "joinedAt", "leftAt")
SELECT "id", "usuarioId", "createdAt", CASE WHEN "estado" = 'ABIERTA' THEN NULL ELSE COALESCE("closedAt", "createdAt") END
FROM "cajas_chicas";

-- Hasta ahora cobraba siempre el dueño de la caja.
UPDATE "ventas" v SET "paidById" = c."usuarioId" FROM "cajas_chicas" c WHERE v."cajaId" = c."id";
