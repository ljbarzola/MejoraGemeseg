-- Solo registro: el despliegue no corre migraciones; estas columnas se crean al arrancar
-- (src/prisma/cacao-config.schema.ts). Mismo SQL.
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "ticketNumber" TEXT;
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "weighingProfile" TEXT;
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "driverName" TEXT;
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "vehiclePlate" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CacaoReception_companyId_ticketNumber_key" ON "CacaoReception" ("companyId", "ticketNumber");
