/**
 * Tablas del módulo Marketing (Fase 1: plan completo + borradores).
 *
 * El despliegue no corre migraciones, así que se aseguran al arrancar con
 * sentencias idempotentes, igual que bitacora.schema.ts. Son tablas nuevas:
 * un servidor anterior sigue funcionando sin ellas.
 */
export const MARKETING_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "MarketingCampaign" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "idea" TEXT NOT NULL,
    "objetivo" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingCampaign_companyId_createdAt_idx" ON "MarketingCampaign"("companyId", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS "MarketingPlan" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "resumen" TEXT,
    "publico" TEXT,
    "mercado" TEXT,
    "canales" TEXT,
    "calendario" TEXT,
    "kpis" TEXT,
    "presupuesto" TEXT,
    "advertencias" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingPlan_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingPlan_campaignId_idx" ON "MarketingPlan"("campaignId")`,

  `CREATE TABLE IF NOT EXISTS "MarketingPiece" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" TEXT,
    "titulo" TEXT,
    "contenido" TEXT NOT NULL,
    "origen" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "aprobadoPorId" INTEGER,
    "aprobadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingPiece_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingPiece_campaignId_idx" ON "MarketingPiece"("campaignId")`,
  // Fase 2: archivo de creatividad real (imagen) generado por Vertex.
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "archivoUrl" TEXT`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "mimeType" TEXT`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "archivoNombre" TEXT`,

  `CREATE TABLE IF NOT EXISTS "MarketingEnvio" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "pieceId" INTEGER NOT NULL,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "motivo" TEXT,
    "creadoPorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingEnvio_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingEnvio_campaignId_idx" ON "MarketingEnvio"("campaignId")`,

  `CREATE TABLE IF NOT EXISTS "MarketingSetting" (
    "companyId" INTEGER NOT NULL,
    "tono" TEXT,
    "servicios" TEXT,
    "canalesPermitidos" TEXT,
    "aprobadorRol" TEXT,
    "consentimiento" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingSetting_pkey" PRIMARY KEY ("companyId")
  )`,
];
