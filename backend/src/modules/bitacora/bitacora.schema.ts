/**
 * Crea las tablas "BitacoraEvento" y "BitacoraConsulta" si no existen.
 *
 * Mismo motivo y mismo patrón que auth/session-cutoff.schema.ts: el despliegue no
 * corre migraciones, así que las tablas se aseguran solas al arrancar. Son
 * tablas nuevas (no columnas de una tabla existente), por lo que solo las lee
 * el código nuevo y un servidor anterior sigue funcionando sin ellas. Cada
 * sentencia es idempotente y va en una llamada aparte; es el MISMO SQL de
 * prisma/migrations/20261027_bitacora_equipo/migration.sql (solo referencia).
 */
export const BITACORA_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "BitacoraEvento" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER,
    "fuente" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "ruta" TEXT,
    "entidadId" INTEGER,
    "nombre" TEXT,
    "externalId" TEXT,
    "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BitacoraEvento_pkey" PRIMARY KEY ("id")
  )`,
  // 2026-10-29: tramos de la extensión del navegador. Columna nueva, nula y aditiva:
  // un servidor anterior sigue funcionando sin ella (es una tabla propia de la Bitácora).
  `ALTER TABLE "BitacoraEvento" ADD COLUMN IF NOT EXISTS "minutos" INTEGER`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BitacoraEvento_fuente_externalId_key" ON "BitacoraEvento"("fuente", "externalId")`,
  `CREATE INDEX IF NOT EXISTS "BitacoraEvento_userId_ocurridoEn_idx" ON "BitacoraEvento"("userId", "ocurridoEn")`,
  `CREATE INDEX IF NOT EXISTS "BitacoraEvento_companyId_ocurridoEn_idx" ON "BitacoraEvento"("companyId", "ocurridoEn")`,
  `DO $$ BEGIN
    ALTER TABLE "BitacoraEvento" ADD CONSTRAINT "BitacoraEvento_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  `CREATE TABLE IF NOT EXISTS "BitacoraActivacion" (
    "userId" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "desde" TIMESTAMP(3),
    "activadaPorId" INTEGER,
    "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BitacoraActivacion_pkey" PRIMARY KEY ("userId")
  )`,
  `DO $$ BEGIN
    ALTER TABLE "BitacoraActivacion" ADD CONSTRAINT "BitacoraActivacion_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "BitacoraActivacion" ADD CONSTRAINT "BitacoraActivacion_activadaPorId_fkey"
      FOREIGN KEY ("activadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  `CREATE TABLE IF NOT EXISTS "BitacoraConsulta" (
    "id" SERIAL NOT NULL,
    "consultorId" INTEGER NOT NULL,
    "personaId" INTEGER NOT NULL,
    "fecha" TEXT NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BitacoraConsulta_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "BitacoraConsulta_personaId_ocurridoEn_idx" ON "BitacoraConsulta"("personaId", "ocurridoEn")`,
  `DO $$ BEGIN
    ALTER TABLE "BitacoraConsulta" ADD CONSTRAINT "BitacoraConsulta_consultorId_fkey"
      FOREIGN KEY ("consultorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "BitacoraConsulta" ADD CONSTRAINT "BitacoraConsulta_personaId_fkey"
      FOREIGN KEY ("personaId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  // Extensión del navegador: horario por empresa, código de vinculación y vínculos.
  `CREATE TABLE IF NOT EXISTS "BitacoraHorario" (
    "companyId" INTEGER NOT NULL,
    "dias" TEXT NOT NULL,
    "inicio" TEXT NOT NULL,
    "fin" TEXT NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoPorId" INTEGER,
    CONSTRAINT "BitacoraHorario_pkey" PRIMARY KEY ("companyId")
  )`,
  `CREATE TABLE IF NOT EXISTS "BitacoraExtensionCodigo" (
    "userId" INTEGER NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BitacoraExtensionCodigo_pkey" PRIMARY KEY ("userId")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BitacoraExtensionCodigo_codigoHash_key" ON "BitacoraExtensionCodigo"("codigoHash")`,
  `DO $$ BEGIN
    ALTER TABLE "BitacoraExtensionCodigo" ADD CONSTRAINT "BitacoraExtensionCodigo_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  `CREATE TABLE IF NOT EXISTS "BitacoraExtensionVinculo" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "nombreEquipo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" TIMESTAMP(3),
    "revocadoEn" TIMESTAMP(3),
    CONSTRAINT "BitacoraExtensionVinculo_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BitacoraExtensionVinculo_tokenHash_key" ON "BitacoraExtensionVinculo"("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "BitacoraExtensionVinculo_userId_idx" ON "BitacoraExtensionVinculo"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "BitacoraExtensionVinculo" ADD CONSTRAINT "BitacoraExtensionVinculo_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
];
