/**
 * Metas comerciales (2026-11-13): lo que gerencia espera vender por periodo, de la
 * empresa entera (userId nulo) y de cada vendedor. Sustituye en la práctica a la
 * meta vieja de visitas ("SalesGoal"), que no se toca.
 *
 * Mismo patrón que whatsapp-clics.schema.ts: el despliegue no corre migraciones, así
 * que la tabla se crea al arrancar (VentasSchemaService). Tabla nueva, sin modelo en
 * schema.prisma (se lee con SQL): no hay columnas nuevas sobre tablas que producción
 * ya tenga. Todo es idempotente.
 *
 * "month" vale 0 en las metas anuales para que la llave única funcione sin nulos.
 */
export const SALES_META_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "SalesMeta" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "kind" TEXT NOT NULL,
    "periodKind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL DEFAULT 0,
    "target" DECIMAL(14,2) NOT NULL,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesMeta_pkey" PRIMARY KEY ("id")
  )`,
  // Una sola meta por empresa, persona (0 = global), tipo y periodo.
  `CREATE UNIQUE INDEX IF NOT EXISTS "SalesMeta_unica_idx"
     ON "SalesMeta"("companyId", COALESCE("userId", 0), "kind", "periodKind", "year", "month")`,
  `CREATE INDEX IF NOT EXISTS "SalesMeta_companyId_periodo_idx"
     ON "SalesMeta"("companyId", "periodKind", "year", "month")`,
];
