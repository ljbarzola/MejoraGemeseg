-- Ajustes de Ventas por empresa (IDs de Google Ads, tabla de landings...).
-- Es el MISMO SQL que crea VentasSchemaService al arrancar (sales-pipeline.schema.ts):
-- el despliegue no corre migraciones. Idempotente.
CREATE TABLE IF NOT EXISTS "SalesSetting" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesSetting_companyId_key_key" ON "SalesSetting"("companyId", "key");
DO $$ BEGIN
  ALTER TABLE "SalesSetting" ADD CONSTRAINT "SalesSetting_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
