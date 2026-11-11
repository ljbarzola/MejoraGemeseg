-- 2026-11-10: pesadas (tandas) de una recepción. Un mismo ticket puede pesarse por partes; la
-- recepción guarda la suma y esta tabla el detalle de cada pesada (en kg).
-- Idempotente. El despliegue NO corre migraciones, pero el servidor lo aplica solo al arrancar
-- (cacao-config.schema.ts); este archivo es el registro / para quien lo aplique a mano.

CREATE TABLE IF NOT EXISTS "CacaoReceptionWeighing" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "receptionId" INTEGER NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "grossWeight" DOUBLE PRECISION NOT NULL,
  "tare" DOUBLE PRECISION NOT NULL,
  "netWeight" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CacaoReceptionWeighing_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CacaoReceptionWeighing_receptionId_idx" ON "CacaoReceptionWeighing" ("receptionId");
