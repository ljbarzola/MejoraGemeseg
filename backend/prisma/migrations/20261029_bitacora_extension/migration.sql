-- Extensión del navegador de la Bitácora. Solo referencia: las tablas y la columna
-- se crean solas al arrancar (src/modules/bitacora/bitacora.schema.ts), el
-- despliegue no corre migraciones.

ALTER TABLE "BitacoraEvento" ADD COLUMN IF NOT EXISTS "minutos" INTEGER;

CREATE TABLE IF NOT EXISTS "BitacoraHorario" (
  "companyId" INTEGER NOT NULL,
  "dias" TEXT NOT NULL,
  "inicio" TEXT NOT NULL,
  "fin" TEXT NOT NULL,
  "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoPorId" INTEGER,
  CONSTRAINT "BitacoraHorario_pkey" PRIMARY KEY ("companyId")
);

CREATE TABLE IF NOT EXISTS "BitacoraExtensionCodigo" (
  "userId" INTEGER NOT NULL,
  "codigoHash" TEXT NOT NULL,
  "expiraEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BitacoraExtensionCodigo_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BitacoraExtensionCodigo_codigoHash_key" ON "BitacoraExtensionCodigo"("codigoHash");
DO $$ BEGIN
  ALTER TABLE "BitacoraExtensionCodigo" ADD CONSTRAINT "BitacoraExtensionCodigo_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BitacoraExtensionVinculo" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "nombreEquipo" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoUso" TIMESTAMP(3),
  "revocadoEn" TIMESTAMP(3),
  CONSTRAINT "BitacoraExtensionVinculo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BitacoraExtensionVinculo_tokenHash_key" ON "BitacoraExtensionVinculo"("tokenHash");
CREATE INDEX IF NOT EXISTS "BitacoraExtensionVinculo_userId_idx" ON "BitacoraExtensionVinculo"("userId");
DO $$ BEGIN
  ALTER TABLE "BitacoraExtensionVinculo" ADD CONSTRAINT "BitacoraExtensionVinculo_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
