-- 2026-11-10: marca de consignación en la recepción y peso seco del lote (para la merma de secado).
-- Idempotente. El despliegue NO corre migraciones, pero el servidor lo aplica solo al arrancar
-- (cacao-config.schema.ts); este archivo es el registro / para quien lo aplique a mano.

ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "consigned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "CacaoLot" ADD COLUMN IF NOT EXISTS "dryWeight" DOUBLE PRECISION;
