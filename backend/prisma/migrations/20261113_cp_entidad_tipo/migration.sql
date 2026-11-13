-- Solo referencia: la columna se crea al arrancar (src/prisma/cp-informe-datos.schema.ts), porque los despliegues no corren migraciones.
ALTER TABLE "CPEntidadPublica" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'PUBLICA';
