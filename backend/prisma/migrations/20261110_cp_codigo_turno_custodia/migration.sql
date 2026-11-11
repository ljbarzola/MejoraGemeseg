-- Referencia: el despliegue no corre migraciones; la columna se asegura al arrancar (cp-codigo-turno-horas.schema.ts).
ALTER TABLE "CPCodigoTurno" ADD COLUMN IF NOT EXISTS "esCustodia" BOOLEAN NOT NULL DEFAULT false;
