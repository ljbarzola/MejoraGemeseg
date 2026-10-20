-- Visitas de Planificación y Campo conectadas al CRM: cliente del Directorio, oportunidad y ubicación.
-- Solo de referencia: el servidor crea estas columnas al arrancar (VentasSchemaService / SALES_VISIT_COLUMNS_DDL)
-- porque el despliegue no corre migraciones. Aditivo y nulo: no toca ninguna fila existente.
ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "salesClientId" INTEGER;
ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "opportunityId" INTEGER;
ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationName" TEXT;
ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationAddress" TEXT;
ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationLat" DOUBLE PRECISION;
ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationLng" DOUBLE PRECISION;
ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationCity" TEXT;
ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationProvince" TEXT;
ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationOsmId" TEXT;
CREATE INDEX IF NOT EXISTS "ClientVisit_salesClientId_idx" ON "ClientVisit"("salesClientId");
