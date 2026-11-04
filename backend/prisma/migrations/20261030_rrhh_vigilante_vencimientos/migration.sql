-- Vigilante de vencimientos de RRHH: configuración por empresa. Tabla nueva, aditiva e
-- idempotente (el despliegue no corre migraciones: RrhhVigilanteService la crea al arrancar).
CREATE TABLE IF NOT EXISTS "RrhhVigilanteConfig" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "avisarDias" INTEGER[] NOT NULL DEFAULT ARRAY[30, 7, 0],
  "repetirVencidoDias" INTEGER NOT NULL DEFAULT 7,
  "resumenLunes" BOOLEAN NOT NULL DEFAULT true,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RrhhVigilanteConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RrhhVigilanteConfig_companyId_key" ON "RrhhVigilanteConfig"("companyId");
