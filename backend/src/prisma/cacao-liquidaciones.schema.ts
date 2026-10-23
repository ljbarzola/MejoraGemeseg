// Aprobación de liquidaciones, desglose por lote y trazabilidad/anulación de pagos del
// módulo Cacao. Son tablas que producción ya tiene (baseline) y que Prisma pide completas
// en cada consulta; el despliegue no corre migraciones, así que se aseguran al arrancar,
// igual que user-phone.schema.ts. Todo es aditivo y opcional: un despliegue anterior sigue
// funcionando con las columnas creadas. IF EXISTS evita que el arranque falle en una base
// que aún no tenga estas tablas. Mismo SQL que
// prisma/migrations/20261023_cacao_liquidaciones/migration.sql.
export const CACAO_LIQUIDACIONES_DDL = [
  'ALTER TABLE IF EXISTS "CacaoSettlement" ADD COLUMN IF NOT EXISTS "decidedBy" INTEGER',
  'ALTER TABLE IF EXISTS "CacaoSettlement" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3)',
  'ALTER TABLE IF EXISTS "CacaoSettlement" ADD COLUMN IF NOT EXISTS "decisionReason" TEXT',
  'ALTER TABLE IF EXISTS "CacaoSettlement" ADD COLUMN IF NOT EXISTS "dueDays" INTEGER',
  'ALTER TABLE IF EXISTS "CacaoSettlementLot" ADD COLUMN IF NOT EXISTS "humidityPct" DOUBLE PRECISION',
  'ALTER TABLE IF EXISTS "CacaoSettlementLot" ADD COLUMN IF NOT EXISTS "impurityPct" DOUBLE PRECISION',
  'ALTER TABLE IF EXISTS "CacaoSettlementLot" ADD COLUMN IF NOT EXISTS "qualityPunishment" DOUBLE PRECISION',
  'ALTER TABLE IF EXISTS "CacaoSettlementLot" ADD COLUMN IF NOT EXISTS "netKg" DOUBLE PRECISION',
  'ALTER TABLE IF EXISTS "CacaoSettlementLot" ADD COLUMN IF NOT EXISTS "amount" DOUBLE PRECISION',
  'ALTER TABLE IF EXISTS "CacaoPayment" ADD COLUMN IF NOT EXISTS "createdBy" INTEGER',
  'ALTER TABLE IF EXISTS "CacaoPayment" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3)',
  'ALTER TABLE IF EXISTS "CacaoPayment" ADD COLUMN IF NOT EXISTS "voidedBy" INTEGER',
  'ALTER TABLE IF EXISTS "CacaoPayment" ADD COLUMN IF NOT EXISTS "voidReason" TEXT',
];
