-- Solo referencia: el despliegue no corre migraciones; esto se crea al arrancar
-- (src/prisma/cp-bitacora-turno.schema.ts y src/modules/contratacion-publica/bitacoras/bitacoras.schema.ts).
ALTER TABLE "CPBitacora" ADD COLUMN IF NOT EXISTS "guardiaSaliente" TEXT;
ALTER TABLE "CPBitacora" ADD COLUMN IF NOT EXISTS "guardiaEntrante" TEXT;

CREATE TABLE IF NOT EXISTS "CPBitacoraDotacion" (
  "id" SERIAL NOT NULL,
  "bitacoraId" INTEGER NOT NULL,
  "ambito" TEXT NOT NULL DEFAULT 'SIN_DATO',
  "articulo" TEXT NOT NULL,
  "cantidad" INTEGER,
  "detalle" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CPBitacoraDotacion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBitacoraDotacion_bitacoraId_fkey" FOREIGN KEY ("bitacoraId") REFERENCES "CPBitacora"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CPBitacoraDotacion_bitacoraId_idx" ON "CPBitacoraDotacion"("bitacoraId");

CREATE TABLE IF NOT EXISTS "CPBitacoraArticuloAmbito" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "clave" TEXT NOT NULL,
  "ambito" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CPBitacoraArticuloAmbito_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CPBitacoraArticuloAmbito_companyId_clave_key" ON "CPBitacoraArticuloAmbito"("companyId", "clave");

CREATE TABLE IF NOT EXISTS "CPPuestoDotacion" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "puestoId" INTEGER NOT NULL,
  "bitacoraId" INTEGER,
  "ambito" TEXT NOT NULL DEFAULT 'GEMESEG',
  "articulo" TEXT NOT NULL,
  "cantidad" INTEGER,
  "detalle" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CPPuestoDotacion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CPPuestoDotacion_companyId_puestoId_idx" ON "CPPuestoDotacion"("companyId", "puestoId");
