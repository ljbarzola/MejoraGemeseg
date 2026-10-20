-- Ubicación OPCIONAL de la oportunidad (mapa). Solo de referencia: el servidor crea estas columnas al
-- arrancar (VentasSchemaService / SALES_OPPORTUNITY_COLUMNS_DDL) porque el despliegue no corre migraciones.
-- Aditivo y nulo: no toca ninguna fila existente.
ALTER TABLE "SalesOpportunity" ADD COLUMN IF NOT EXISTS "locationName" TEXT;
ALTER TABLE "SalesOpportunity" ADD COLUMN IF NOT EXISTS "locationAddress" TEXT;
ALTER TABLE "SalesOpportunity" ADD COLUMN IF NOT EXISTS "locationLat" DOUBLE PRECISION;
ALTER TABLE "SalesOpportunity" ADD COLUMN IF NOT EXISTS "locationLng" DOUBLE PRECISION;
ALTER TABLE "SalesOpportunity" ADD COLUMN IF NOT EXISTS "locationCity" TEXT;
ALTER TABLE "SalesOpportunity" ADD COLUMN IF NOT EXISTS "locationProvince" TEXT;
ALTER TABLE "SalesOpportunity" ADD COLUMN IF NOT EXISTS "locationOsmId" TEXT;
