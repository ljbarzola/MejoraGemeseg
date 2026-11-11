-- 2026-11-10: rango de precio esperado por calidad de cacao ($/kg, opcional).
-- Idempotente. El despliegue NO corre migraciones, pero el servidor lo aplica solo al arrancar
-- (cacao-config.schema.ts); este archivo es el registro / para quien lo aplique a mano.

ALTER TABLE IF EXISTS "CacaoQuality" ADD COLUMN IF NOT EXISTS "minPrice" DOUBLE PRECISION;
ALTER TABLE IF EXISTS "CacaoQuality" ADD COLUMN IF NOT EXISTS "maxPrice" DOUBLE PRECISION;
