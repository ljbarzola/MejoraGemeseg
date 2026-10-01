-- 2026-10-01: Ventas - siguiente paso por cliente (vista "Hoy") y actividades
-- de la ficha del cliente (notas, llamadas, reuniones...).
--
-- Aditiva y sin perdida de datos: agrega 2 columnas opcionales a "SalesClient"
-- y crea 1 tabla nueva con sus indices y FKs. Idempotente (IF NOT EXISTS /
-- DO $$), se puede correr mas de una vez y con la base en uso. El codigo viejo
-- no conoce estas columnas ni la tabla, asi que aplicarla ANTES de desplegar
-- no rompe nada.

ALTER TABLE "SalesClient" ADD COLUMN IF NOT EXISTS "nextActionText" TEXT;
ALTER TABLE "SalesClient" ADD COLUMN IF NOT EXISTS "nextActionDate" DATE;

CREATE TABLE IF NOT EXISTS "SalesClientActivity" (
    "id" SERIAL NOT NULL,
    "salesClientId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "otherLabel" TEXT,
    "text" TEXT NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesClientActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalesClientActivity_salesClientId_createdAt_idx" ON "SalesClientActivity"("salesClientId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesClient_companyId_assignedUserId_nextActionDate_idx" ON "SalesClient"("companyId", "assignedUserId", "nextActionDate");

DO $$ BEGIN
  ALTER TABLE "SalesClientActivity" ADD CONSTRAINT "SalesClientActivity_salesClientId_fkey" FOREIGN KEY ("salesClientId") REFERENCES "SalesClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SalesClientActivity" ADD CONSTRAINT "SalesClientActivity_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SalesClientActivity" ADD CONSTRAINT "SalesClientActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
