-- Solo registro: el despliegue no corre migraciones; estas columnas se crean al arrancar
-- (src/prisma/cacao-config.schema.ts). Mismo SQL.
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "voidedBy" INTEGER;
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;
ALTER TABLE IF EXISTS "CacaoShipment" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE IF EXISTS "CacaoShipment" ADD COLUMN IF NOT EXISTS "cancelledBy" INTEGER;
ALTER TABLE IF EXISTS "CacaoShipment" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
