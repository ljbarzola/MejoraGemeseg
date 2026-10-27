-- Solo registro: el despliegue no corre migraciones; esta tabla se crea al arrancar
-- (src/prisma/cacao-config.schema.ts). Mismo SQL.
CREATE TABLE IF NOT EXISTS "CacaoMotivo" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "tipo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CacaoMotivo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CacaoMotivo_companyId_tipo_nombre_key" ON "CacaoMotivo" ("companyId", "tipo", "nombre");
