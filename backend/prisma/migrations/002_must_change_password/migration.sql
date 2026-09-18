-- Obliga a cambiar las claves temporales en el primer ingreso.
ALTER TABLE "usuarios" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
