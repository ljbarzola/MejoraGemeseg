-- Solo registro: el despliegue no corre migraciones; estas columnas se crean al arrancar
-- (src/prisma/cacao-config.schema.ts). Mismo SQL.
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "closedBy" INTEGER;
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "closeReason" TEXT;
