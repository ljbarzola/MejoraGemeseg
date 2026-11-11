-- 2026-11-10: anticipos a proveedores y forma de pago de la liquidación.
--   * CacaoSupplierAdvance: adelantos de dinero a un proveedor (su saldo se calcula, no se guarda).
--   * CacaoSettlement.advanceApplied: anticipo descontado en la liquidación (por defecto 0).
--   * CacaoSettlement.paymentPlan: cómo se pagará lo que queda (lista de {method, amount}).
-- Idempotente. El despliegue NO corre migraciones, pero el servidor lo aplica solo al arrancar
-- (cacao-config.schema.ts); este archivo es el registro / para quien lo aplique a mano.

CREATE TABLE IF NOT EXISTS "CacaoSupplierAdvance" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'TRANSFER',
  "reference" TEXT,
  "note" TEXT,
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "voidedBy" INTEGER,
  "voidReason" TEXT,
  CONSTRAINT "CacaoSupplierAdvance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CacaoSupplierAdvance_supplierId_idx" ON "CacaoSupplierAdvance" ("supplierId");

ALTER TABLE IF EXISTS "CacaoSettlement" ADD COLUMN IF NOT EXISTS "advanceApplied" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS "CacaoSettlement" ADD COLUMN IF NOT EXISTS "paymentPlan" JSONB;
