-- Tipo de contrato: servicio recurrente o venta de producto (solo aditivo).
-- El mismo SQL se aplica solo al arrancar (ventas/sales-pipeline.schema.ts).
ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'SERVICIO';
ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "totalValue" DECIMAL(12,2);
ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "deliveredAt" DATE;
ALTER TABLE "SalesAgreement" ADD COLUMN IF NOT EXISTS "warrantyUntil" DATE;
