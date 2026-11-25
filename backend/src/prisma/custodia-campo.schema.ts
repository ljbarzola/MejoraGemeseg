// Guía digital de las custodias en campo (2026-11-24, Fase 1). `Custodia` ya existe en producción
// y el despliegue no corre migraciones; Prisma pide TODAS las columnas del modelo en cada consulta,
// así que las columnas nuevas se aseguran aquí, antes de que arranque cualquier otro módulo. Son
// solo aditivas, con valor por defecto o nulas: un deploy anterior sigue funcionando con ellas.
//
// Se protege con `to_regclass` porque en una base nueva la tabla la crea el esquema de Prisma
// (`db push`) DESPUÉS de este paso; ahí las columnas ya vienen en el modelo.
export const CUSTODIA_CAMPO_DDL = [
  `DO $$ BEGIN
    IF to_regclass('"Custodia"') IS NOT NULL THEN
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
      ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "dispositivoId" INTEGER;
      ALTER TABLE "Custodia" ADD COLUMN IF NOT EXISTS "custodioACargo" TEXT;
    END IF;
  END $$`,
];

// Numeración de las guías y manejo de celulares desvinculados (2026-11-24). Las tablas de celulares las crea
// `CustodiasSchemaService`; por eso este bloque NO corre en `PrismaService` sino en `CustodiasCampoSchemaService`,
// que espera a que existan. Todo aditivo y nulo: un deploy anterior sigue funcionando.
export const CUSTODIA_CAMPO_APARTE_DDL = [
  // Prefijo de la numeración de guías de cada empresa (sin fila = las 3 primeras letras del nombre de la empresa).
  `CREATE TABLE IF NOT EXISTS "CustodiaNumeracion" (
    "companyId" INTEGER NOT NULL,
    "prefijo" TEXT NOT NULL,
    "actualizadoEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "CustodiaNumeracion_pkey" PRIMARY KEY ("companyId")
  )`,
  // «Vincular de nuevo»: el código apunta al celular que se reactiva (null = celular nuevo).
  `DO $$ BEGIN
    IF to_regclass('"CustodiaDispositivoCodigo"') IS NOT NULL THEN
      ALTER TABLE "CustodiaDispositivoCodigo" ADD COLUMN IF NOT EXISTS "dispositivoId" INTEGER;
    END IF;
  END $$`,
  // «Quitar de la lista»: el celular desvinculado deja de mostrarse, pero los viajes siguen mostrando su nombre.
  `DO $$ BEGIN
    IF to_regclass('"CustodiaDispositivo"') IS NOT NULL THEN
      ALTER TABLE "CustodiaDispositivo" ADD COLUMN IF NOT EXISTS "archivadoEn" TIMESTAMPTZ;
    END IF;
  END $$`,
];
