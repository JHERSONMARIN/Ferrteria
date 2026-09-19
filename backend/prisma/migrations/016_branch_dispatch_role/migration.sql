-- Quién despacha en cada sucursal (vendedor, cajero o almacén). Null = según el modo de trabajo.

-- CreateEnum
CREATE TYPE "DispatchRole" AS ENUM ('SELLER', 'CASHIER', 'WAREHOUSE');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN "dispatchRole" "DispatchRole";
