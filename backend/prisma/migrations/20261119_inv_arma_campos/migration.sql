-- Referencia (2026-11-19): el despliegue no corre migraciones; estas columnas se crean al arrancar
-- con src/prisma/inv-arma-campos.schema.ts. Solo aditivas y opcionales.
ALTER TABLE "InvArma" ADD COLUMN IF NOT EXISTS "categoria" TEXT;
ALTER TABLE "InvArma" ADD COLUMN IF NOT EXISTS "municiones" INTEGER;
ALTER TABLE "InvArma" ADD COLUMN IF NOT EXISTS "ciudad" TEXT;
ALTER TABLE "InvArma" ADD COLUMN IF NOT EXISTS "uso" TEXT;
