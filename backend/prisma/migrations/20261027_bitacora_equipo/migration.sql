-- Bitácora del equipo. Solo referencia: las tablas se crean solas al arrancar
-- (src/modules/bitacora/bitacora.schema.ts), el despliegue no corre migraciones.

CREATE TABLE IF NOT EXISTS "BitacoraEvento" (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS "BitacoraEvento_fuente_externalId_key" ON "BitacoraEvento"("fuente", "externalId");
CREATE INDEX IF NOT EXISTS "BitacoraEvento_userId_ocurridoEn_idx" ON "BitacoraEvento"("userId", "ocurridoEn");
CREATE INDEX IF NOT EXISTS "BitacoraEvento_companyId_ocurridoEn_idx" ON "BitacoraEvento"("companyId", "ocurridoEn");
ALTER TABLE "BitacoraEvento" ADD CONSTRAINT "BitacoraEvento_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BitacoraActivacion" (
  "userId" INTEGER NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT false,
  "desde" TIMESTAMP(3),
  "activadaPorId" INTEGER,
  "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BitacoraActivacion_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "BitacoraActivacion" ADD CONSTRAINT "BitacoraActivacion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BitacoraActivacion" ADD CONSTRAINT "BitacoraActivacion_activadaPorId_fkey"
  FOREIGN KEY ("activadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BitacoraConsulta" (
  "id" SERIAL NOT NULL,
  "consultorId" INTEGER NOT NULL,
  "personaId" INTEGER NOT NULL,
  "fecha" TEXT NOT NULL,
  "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BitacoraConsulta_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BitacoraConsulta_personaId_ocurridoEn_idx" ON "BitacoraConsulta"("personaId", "ocurridoEn");
ALTER TABLE "BitacoraConsulta" ADD CONSTRAINT "BitacoraConsulta_consultorId_fkey"
  FOREIGN KEY ("consultorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BitacoraConsulta" ADD CONSTRAINT "BitacoraConsulta_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
