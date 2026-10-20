/**
 * Columnas nuevas en "ClientVisit" (2026-10-19): la visita de Planificación y Campo se conecta al CRM
 * (cliente del Directorio, oportunidad y ubicación en el mapa). Esa tabla YA existe en producción, así
 * que van en la transacción aparte que corre antes del resto (ver VentasSchemaService.agregarColumnasNuevas):
 * Prisma pide toda columna que conoce en cada consulta. Aditivas, nulas e idempotentes; las visitas
 * de antes quedan con todo en NULL.
 */
export const SALES_VISIT_COLUMNS_DDL: string[] = [
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "salesClientId" INTEGER`,
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "opportunityId" INTEGER`,
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationName" TEXT`,
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationAddress" TEXT`,
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationLat" DOUBLE PRECISION`,
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationLng" DOUBLE PRECISION`,
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationCity" TEXT`,
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationProvince" TEXT`,
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "locationOsmId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "ClientVisit_salesClientId_idx" ON "ClientVisit"("salesClientId")`,
];
