-- Referencia (2026-11-24): el despliegue no corre migraciones; estas columnas se crean al arrancar
-- con src/prisma/custodia-campo.schema.ts. Solo aditivas, con valor por defecto o nulas.
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "custodio3Name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "custodio3Cedula" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "custodio4Name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "custodio4Cedula" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "clienteId" INTEGER;
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "rutaId" INTEGER;
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "patrulla" TEXT;
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "ciudadSalida" TEXT;
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "ciudadLlegada" TEXT;
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "guia" JSONB NOT NULL DEFAULT '{}';
-- Las tablas CustodiaConfig, CustodiaFirmaCliente, CustodiaRuta, CustodiaRutaPunto, CustodiaCampo y
-- CustodiaEnvio las crea src/modules/custodias/custodias.schema.ts al arrancar.
-- Fase 2 (celular del custodio): celular asignado y custodio a cargo.
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "dispositivoId" INTEGER;
ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "custodioACargo" TEXT;
-- Las tablas CustodiaDispositivo, CustodiaDispositivoCodigo, CustodiaPin, CustodiaSesion, CustodiaEvento,
-- CustodiaFoto, CustodiaFirma y CustodiaEnlaceFotos, y la columna CustodiaConfig.diasEnlaceFotos, las crea
-- src/modules/custodias/custodias.schema.ts al arrancar.
