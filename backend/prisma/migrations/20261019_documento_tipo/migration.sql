-- Documentación: tipo de cada documento (Contrato, Garantía, Otro...).
-- Solo referencia: el mismo SQL se aplica solo al arrancar (sales-agreement.schema.ts, SALES_CONTRACT_COLUMNS_DDL).
ALTER TABLE "SalesContract" ADD COLUMN IF NOT EXISTS "documentType" TEXT;
ALTER TABLE "SalesContract" ADD COLUMN IF NOT EXISTS "documentTypeOther" TEXT;
