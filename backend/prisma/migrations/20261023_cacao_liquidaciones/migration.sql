-- 2026-10-23: Cacao. Aprobación de liquidaciones, desglose por lote y trazabilidad/anulación
-- de pagos y cobros.
--   * CacaoSettlement: decidedBy, decidedAt, decisionReason, dueDays.
--   * CacaoSettlementLot: humidityPct, impurityPct, qualityPunishment, netKg, amount.
--   * CacaoPayment: createdBy, voidedAt, voidedBy, voidReason.
-- Aditiva e idempotente, todo opcional. El despliegue NO corre migraciones, pero el servidor
-- crea las columnas solo al arrancar (prisma.service.ts, cacao-liquidaciones.schema.ts);
-- este archivo es el registro / para quien lo aplique a mano.

ALTER TABLE IF EXISTS "CacaoSettlement" ADD COLUMN IF NOT EXISTS "decidedBy" INTEGER;
ALTER TABLE IF EXISTS "CacaoSettlement" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3);
ALTER TABLE IF EXISTS "CacaoSettlement" ADD COLUMN IF NOT EXISTS "decisionReason" TEXT;
ALTER TABLE IF EXISTS "CacaoSettlement" ADD COLUMN IF NOT EXISTS "dueDays" INTEGER;

ALTER TABLE IF EXISTS "CacaoSettlementLot" ADD COLUMN IF NOT EXISTS "humidityPct" DOUBLE PRECISION;
ALTER TABLE IF EXISTS "CacaoSettlementLot" ADD COLUMN IF NOT EXISTS "impurityPct" DOUBLE PRECISION;
ALTER TABLE IF EXISTS "CacaoSettlementLot" ADD COLUMN IF NOT EXISTS "qualityPunishment" DOUBLE PRECISION;
ALTER TABLE IF EXISTS "CacaoSettlementLot" ADD COLUMN IF NOT EXISTS "netKg" DOUBLE PRECISION;
ALTER TABLE IF EXISTS "CacaoSettlementLot" ADD COLUMN IF NOT EXISTS "amount" DOUBLE PRECISION;

ALTER TABLE IF EXISTS "CacaoPayment" ADD COLUMN IF NOT EXISTS "createdBy" INTEGER;
ALTER TABLE IF EXISTS "CacaoPayment" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE IF EXISTS "CacaoPayment" ADD COLUMN IF NOT EXISTS "voidedBy" INTEGER;
ALTER TABLE IF EXISTS "CacaoPayment" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;
