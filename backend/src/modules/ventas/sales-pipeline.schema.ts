import { fk } from './sales-agreement.schema';

/**
 * Tablas de leads, oportunidades y motivos de Ventas (2026-10-07), más las
 * columnas nuevas de "SalesAgreement". Mismo patrón y mismas razones que
 * sales-agreement.schema.ts: el despliegue NO corre migraciones, así que el
 * servicio se arregla solo al arrancar (ver VentasSchemaService).
 *
 * Es el MISMO SQL de prisma/migrations/20261007_sales_pipeline/migration.sql.
 * Todo es idempotente. No se agrega ninguna columna a una tabla que producción
 * ya tenga: "SalesAgreement" es la única que recibe columnas porque aún no
 * existe en producción (se crea junto con estas).
 *
 * Va DESPUÉS de SALES_AGREEMENT_DDL: usa "SalesService" y "SalesClient".
 */
/**
 * Columnas nuevas en "SalesOpportunity" (2026-10-18, Fase 4: renovaciones). Van en la transacción
 * aparte que corre ANTES del resto (ver VentasSchemaService.agregarColumnasNuevas), aditivas y
 * nulas para que el despliegue anterior siga funcionando.
 */
export const SALES_OPPORTUNITY_COLUMNS_DDL: string[] = [
  `ALTER TABLE "SalesOpportunity" ADD COLUMN IF NOT EXISTS "renewsAgreementId" INTEGER`,
];

export const SALES_PIPELINE_DDL: string[] = [
  // ---- Columnas nuevas de SalesAgreement (la tabla aún no está en producción) ----
  `ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "monthlyValue" DECIMAL(12,2)`,
  `ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "graceDays" INTEGER NOT NULL DEFAULT 30`,
  `ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`,
  `ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "opportunityId" INTEGER`,
  // Servicio recurrente o venta de producto (2026-10-15). Los contratos que ya
  // existen quedan como SERVICIO por el DEFAULT.
  `ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'SERVICIO'`,
  `ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "totalValue" DECIMAL(12,2)`,
  `ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "deliveredAt" DATE`,
  `ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "warrantyUntil" DATE`,

  // ---- Leads ----
  `CREATE TABLE IF NOT EXISTS "SalesLead" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "companyName" TEXT,
    "message" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'MANUAL',
    "campaign" TEXT,
    "externalId" TEXT,
    "contactReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NUEVO',
    "assignedUserId" INTEGER,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "convertedClientId" INTEGER,
    "convertedOpportunityId" INTEGER,
    "triagedAt" TIMESTAMP(3),
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesLead_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SalesLead_companyId_channel_externalId_key" ON "SalesLead"("companyId", "channel", "externalId")`,
  `CREATE INDEX IF NOT EXISTS "SalesLead_companyId_status_idx" ON "SalesLead"("companyId", "status")`,
  fk('SalesLead', 'companyId', 'Company', 'CASCADE'),

  // ---- Oportunidades ----
  `CREATE TABLE IF NOT EXISTS "SalesOpportunity" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "salesClientId" INTEGER NOT NULL,
    "title" TEXT,
    "status" TEXT,
    "outcome" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "quotedAt" DATE,
    "quotedAmount" DECIMAL(12,2),
    "assignedUserId" INTEGER,
    "source" TEXT,
    "referredByUserId" INTEGER,
    "leadId" INTEGER,
    "originType" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesOpportunity_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "SalesOpportunity_companyId_status_idx" ON "SalesOpportunity"("companyId", "status")`,
  `CREATE INDEX IF NOT EXISTS "SalesOpportunity_salesClientId_idx" ON "SalesOpportunity"("salesClientId")`,
  `CREATE INDEX IF NOT EXISTS "SalesOpportunity_companyId_assignedUserId_idx" ON "SalesOpportunity"("companyId", "assignedUserId")`,
  // 2026-10-18 (Fase 4): la oportunidad de renovación apunta al contrato que renueva. Es una
  // columna nueva sobre una tabla que ya existe: en producción la agrega ANTES, aparte, la lista
  // SALES_OPPORTUNITY_COLUMNS_DDL (Prisma pide toda columna que conoce en cada consulta). Aquí se
  // repite solo para una base nueva, donde la tabla se acaba de crear; es idempotente.
  `ALTER TABLE "SalesOpportunity" ADD COLUMN IF NOT EXISTS "renewsAgreementId" INTEGER`,
  `CREATE INDEX IF NOT EXISTS "SalesOpportunity_renewsAgreementId_idx" ON "SalesOpportunity"("renewsAgreementId")`,
  fk('SalesOpportunity', 'companyId', 'Company', 'CASCADE'),
  fk('SalesOpportunity', 'salesClientId', 'SalesClient', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "SalesOpportunityService" (
    "opportunityId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    CONSTRAINT "SalesOpportunityService_pkey" PRIMARY KEY ("opportunityId", "serviceId")
  )`,
  `CREATE INDEX IF NOT EXISTS "SalesOpportunityService_serviceId_idx" ON "SalesOpportunityService"("serviceId")`,
  fk('SalesOpportunityService', 'opportunityId', 'SalesOpportunity', 'CASCADE'),
  fk('SalesOpportunityService', 'serviceId', 'SalesService', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "SalesOpportunityStageChange" (
    "id" SERIAL NOT NULL,
    "opportunityId" INTEGER NOT NULL,
    "salesClientId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "notes" TEXT,
    "changedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacyChangeId" INTEGER,
    CONSTRAINT "SalesOpportunityStageChange_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SalesOpportunityStageChange_legacyChangeId_key" ON "SalesOpportunityStageChange"("legacyChangeId")`,
  `CREATE INDEX IF NOT EXISTS "SalesOpportunityStageChange_opportunityId_createdAt_idx" ON "SalesOpportunityStageChange"("opportunityId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "SalesOpportunityStageChange_companyId_toStatus_createdAt_idx" ON "SalesOpportunityStageChange"("companyId", "toStatus", "createdAt")`,
  fk('SalesOpportunityStageChange', 'opportunityId', 'SalesOpportunity', 'CASCADE'),

  // ---- Motivos ----
  `CREATE TABLE IF NOT EXISTS "SalesReason" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kinds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "requiresComment" BOOLEAN NOT NULL DEFAULT false,
    "isNoInfo" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesReason_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SalesReason_companyId_label_key" ON "SalesReason"("companyId", "label")`,
  `CREATE INDEX IF NOT EXISTS "SalesReason_companyId_idx" ON "SalesReason"("companyId")`,
  fk('SalesReason', 'companyId', 'Company', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "SalesReasonEntry" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "reasonId" INTEGER,
    "reasonLabel" TEXT NOT NULL,
    "comment" TEXT,
    "source" TEXT,
    "leadId" INTEGER,
    "opportunityId" INTEGER,
    "agreementId" INTEGER,
    "salesClientId" INTEGER,
    "detail" JSONB,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesReasonEntry_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "SalesReasonEntry_companyId_kind_createdAt_idx" ON "SalesReasonEntry"("companyId", "kind", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "SalesReasonEntry_salesClientId_idx" ON "SalesReasonEntry"("salesClientId")`,
  `CREATE INDEX IF NOT EXISTS "SalesReasonEntry_opportunityId_idx" ON "SalesReasonEntry"("opportunityId")`,
  `CREATE INDEX IF NOT EXISTS "SalesReasonEntry_agreementId_idx" ON "SalesReasonEntry"("agreementId")`,
  fk('SalesReasonEntry', 'companyId', 'Company', 'CASCADE'),

  // ---- Hechos de conversión para Google Ads (2026-10-15) ----
  `CREATE TABLE IF NOT EXISTS "SalesConversionEvent" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL,
    "opportunityId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "gclid" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesConversionEvent_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SalesConversionEvent_opportunityId_kind_key" ON "SalesConversionEvent"("opportunityId", "kind")`,
  `CREATE INDEX IF NOT EXISTS "SalesConversionEvent_companyId_status_idx" ON "SalesConversionEvent"("companyId", "status")`,
  fk('SalesConversionEvent', 'companyId', 'Company', 'CASCADE'),
  // 2026-10-18: «Lead válido» pasa ANTES de que exista la oportunidad, así que ese hecho no tiene
  // oportunidad. Solo se quita el NOT NULL (no se agrega columna ni se borra nada; idempotente) y la
  // unicidad (oportunidad, tipo) sigue igual para los hechos de siempre; la de «válido» se cuida en código.
  `ALTER TABLE "SalesConversionEvent" ALTER COLUMN "opportunityId" DROP NOT NULL`,

  // ---- Ajustes de Ventas por empresa (2026-10-15) ----
  `CREATE TABLE IF NOT EXISTS "SalesSetting" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesSetting_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SalesSetting_companyId_key_key" ON "SalesSetting"("companyId", "key")`,
  fk('SalesSetting', 'companyId', 'Company', 'CASCADE'),
];

/**
 * Relleno inicial, idempotente: una oportunidad "MIGRADA" por cada cliente que
 * todavía no tiene ninguna, con la etapa, el responsable, la fuente y el
 * referidor del cliente; y una copia de sus cambios de etapa. Los servicios se
 * mapean aparte, en TypeScript (VentasSchemaService), porque salen del Json
 * `extra` del cliente.
 */
export const SALES_PIPELINE_BACKFILL: string[] = [
  `INSERT INTO "SalesOpportunity" (
      "companyId","salesClientId","status","outcome","receivedAt","closedAt",
      "assignedUserId","source","referredByUserId","originType","createdBy","createdAt","updatedAt"
    )
    SELECT c."companyId", c."id", c."status",
      CASE WHEN c."status" = 'ACEPTADO' THEN 'GANADA'
           WHEN c."status" = 'RECHAZADO' THEN 'PERDIDA'
           ELSE NULL END,
      c."createdAt",
      CASE WHEN s."isFinal" THEN c."updatedAt" ELSE NULL END,
      c."assignedUserId", c."extra"->>'fuente', c."referredByUserId", 'MIGRADA',
      c."createdBy", c."createdAt", CURRENT_TIMESTAMP
    FROM "SalesClient" c
    LEFT JOIN "SalesClientStage" s ON s."companyId" = c."companyId" AND s."key" = c."status"
    WHERE NOT EXISTS (SELECT 1 FROM "SalesOpportunity" o WHERE o."salesClientId" = c."id")`,
  `INSERT INTO "SalesOpportunityStageChange" (
      "opportunityId","salesClientId","companyId","fromStatus","toStatus","notes","changedBy","createdAt","legacyChangeId"
    )
    SELECT o."id", ch."salesClientId", ch."companyId", ch."fromStatus", ch."toStatus", ch."notes",
      ch."changedBy", ch."createdAt", ch."id"
    FROM "SalesClientStageChange" ch
    JOIN "SalesOpportunity" o ON o."salesClientId" = ch."salesClientId" AND o."originType" = 'MIGRADA'
    ON CONFLICT ("legacyChangeId") DO NOTHING`,
];
