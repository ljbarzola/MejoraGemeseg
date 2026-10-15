-- Hechos de conversión (lead cualificado / convertido) que se avisan a Google Ads.
-- Es el MISMO SQL que crea VentasSchemaService al arrancar (sales-pipeline.schema.ts):
-- el despliegue no corre migraciones. Idempotente.
CREATE TABLE IF NOT EXISTS "SalesConversionEvent" (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesConversionEvent_opportunityId_kind_key" ON "SalesConversionEvent"("opportunityId", "kind");
CREATE INDEX IF NOT EXISTS "SalesConversionEvent_companyId_status_idx" ON "SalesConversionEvent"("companyId", "status");
DO $$ BEGIN
  ALTER TABLE "SalesConversionEvent" ADD CONSTRAINT "SalesConversionEvent_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
