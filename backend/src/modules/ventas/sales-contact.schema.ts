import { fk } from './sales-agreement.schema';

/**
 * Tabla de contactos (Fase 2 del CRM, 2026-10-18): varias personas por cada
 * empresa/persona del Directorio, cada una con varios teléfonos y correos
 * etiquetados (guardados como Json, no tablas hijas: ver el comentario del
 * modelo en schema.prisma).
 *
 * Mismo patrón y misma razón que sales-agreement.schema.ts y
 * sales-pipeline.schema.ts: el despliegue NO corre migraciones, así que la
 * tabla se crea sola al arrancar (ver VentasSchemaService). Va DESPUÉS de
 * SALES_PIPELINE_DDL: usa "SalesClient".
 */
export const SALES_CONTACT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "SalesContact" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "salesClientId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phones" JSONB NOT NULL DEFAULT '[]',
    "emails" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesContact_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "SalesContact_companyId_salesClientId_idx" ON "SalesContact"("companyId", "salesClientId")`,
  fk('SalesContact', 'companyId', 'Company', 'CASCADE'),
  fk('SalesContact', 'salesClientId', 'SalesClient', 'CASCADE'),
];
