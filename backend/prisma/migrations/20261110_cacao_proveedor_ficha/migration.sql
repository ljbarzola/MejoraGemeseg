-- 2026-11-10: ficha completa del proveedor de cacao y sus documentos adjuntos.
-- Idempotente. El despliegue NO corre migraciones, pero el servidor lo aplica solo al arrancar
-- (cacao-config.schema.ts); este archivo es el registro / para quien lo aplique a mano.

ALTER TABLE IF EXISTS "CacaoSupplier" ADD COLUMN IF NOT EXISTS "idType" TEXT;
ALTER TABLE IF EXISTS "CacaoSupplier" ADD COLUMN IF NOT EXISTS "idNumber" TEXT;
ALTER TABLE IF EXISTS "CacaoSupplier" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE IF EXISTS "CacaoSupplier" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE IF EXISTS "CacaoSupplier" ADD COLUMN IF NOT EXISTS "bankAccountType" TEXT;
ALTER TABLE IF EXISTS "CacaoSupplier" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT;
ALTER TABLE IF EXISTS "CacaoSupplier" ADD COLUMN IF NOT EXISTS "bankAccountHolder" TEXT;
ALTER TABLE IF EXISTS "CacaoSupplier" ADD COLUMN IF NOT EXISTS "rating" INTEGER;

CREATE TABLE IF NOT EXISTS "CacaoSupplierDocument" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "fileKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "uploadedBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CacaoSupplierDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CacaoSupplierDocument_supplierId_idx" ON "CacaoSupplierDocument" ("supplierId");
