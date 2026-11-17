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
  // 2026-10-20: el check-in compara el GPS con el lugar de la visita (ver checkin.util.ts).
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "checkInResult" TEXT`,
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "checkInDistanceM" INTEGER`,
  // 2026-11-17 (asesor comercial): por qué no se cumplió una visita planificada (texto de la lista fija
  // de VISITA_MOTIVOS_NO_CUMPLIDA o lo que se escribió en «Otro»). Antes iba suelto dentro de las notas.
  `ALTER TABLE "ClientVisit" ADD COLUMN IF NOT EXISTS "cancelMotivo" TEXT`,
  `CREATE INDEX IF NOT EXISTS "ClientVisit_salesClientId_idx" ON "ClientVisit"("salesClientId")`,
];
