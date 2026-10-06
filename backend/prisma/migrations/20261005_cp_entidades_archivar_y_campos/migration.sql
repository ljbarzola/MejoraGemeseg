-- 2026-10-05: Contratacion Publica, entidades publicas.
--   1) "archivada": ocultar una entidad sin borrarla.
--   2) "camposExtra": valores de los campos que cada empresa define.
--   3) Tabla "CPEntidadCampo": la definicion de esos campos (tipo de entidad,
--      contacto, provincia...).
--
-- Aditiva y sin perdida de datos: 2 columnas con valor por defecto/opcionales
-- y 1 tabla nueva. Idempotente (IF NOT EXISTS / bloque DO), se puede correr
-- mas de una vez y con la base en uso. El codigo viejo no conoce nada de esto,
-- asi que aplicarla ANTES de desplegar no rompe nada. El despliegue NO corre
-- migraciones: hay que aplicarla a mano en Cloud SQL antes de subir a main.

ALTER TABLE "CPEntidadPublica" ADD COLUMN IF NOT EXISTS "archivada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CPEntidadPublica" ADD COLUMN IF NOT EXISTS "camposExtra" JSONB;

CREATE TABLE IF NOT EXISTS "CPEntidadCampo" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "opciones" JSONB,
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPEntidadCampo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CPEntidadCampo_companyId_nombre_key" ON "CPEntidadCampo"("companyId", "nombre");
CREATE INDEX IF NOT EXISTS "CPEntidadCampo_companyId_idx" ON "CPEntidadCampo"("companyId");

DO $$ BEGIN
  ALTER TABLE "CPEntidadCampo" ADD CONSTRAINT "CPEntidadCampo_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
