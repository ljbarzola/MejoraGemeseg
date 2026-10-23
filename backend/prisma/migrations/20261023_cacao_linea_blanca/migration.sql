-- 2026-10-23: Cacao en línea blanca. Calidades por empresa y ajustes por empresa.
--   * CacaoQuality.companyId (opcional) y unicidad del nombre por empresa en vez de global.
--   * Tabla CacaoSetting (plazos de pago y cobro por empresa).
-- Idempotente. El despliegue NO corre migraciones, pero el servidor lo aplica solo al arrancar
-- (prisma.service.ts, cacao-config.schema.ts); este archivo es el registro / para quien lo aplique a mano.

ALTER TABLE IF EXISTS "CacaoQuality" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

-- Las calidades existentes pasan a la empresa de los lotes que las usan...
UPDATE "CacaoQuality" q SET "companyId" = l."companyId"
FROM (SELECT DISTINCT ON ("qualityId") "qualityId", "companyId" FROM "CacaoLot" ORDER BY "qualityId", "id") l
WHERE q."id" = l."qualityId" AND q."companyId" IS NULL;

-- ...y las que nadie usa, a la única empresa que tiene Cacao habilitado (si hay una sola).
UPDATE "CacaoQuality"
SET "companyId" = (SELECT MIN("companyId") FROM "CompanySection" WHERE "section" = 'CACAO')
WHERE "companyId" IS NULL
  AND (SELECT COUNT(DISTINCT "companyId") FROM "CompanySection" WHERE "section" = 'CACAO') = 1;

DROP INDEX IF EXISTS "CacaoQuality_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CacaoQuality_companyId_name_key" ON "CacaoQuality" ("companyId", "name");

-- El código de lote era único en toda la base: pasa a ser único por empresa.
DROP INDEX IF EXISTS "CacaoLot_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CacaoLot_companyId_code_key" ON "CacaoLot" ("companyId", "code");

CREATE TABLE IF NOT EXISTS "CacaoSetting" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CacaoSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CacaoSetting_companyId_key_key" ON "CacaoSetting" ("companyId", "key");
