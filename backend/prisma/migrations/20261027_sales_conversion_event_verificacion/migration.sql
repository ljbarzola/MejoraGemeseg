-- Referencia (el despliegue no corre migraciones: estas columnas las agrega VentasSchemaService al arrancar).
-- 2026-10-27: verificación con Google Ads de cada aviso de conversión. Aditivas y nulas.
ALTER TABLE "SalesConversionEvent" ADD COLUMN IF NOT EXISTS "requestId" TEXT;
ALTER TABLE "SalesConversionEvent" ADD COLUMN IF NOT EXISTS "googleStatus" TEXT;
ALTER TABLE "SalesConversionEvent" ADD COLUMN IF NOT EXISTS "checkedAt" TIMESTAMP(3);
