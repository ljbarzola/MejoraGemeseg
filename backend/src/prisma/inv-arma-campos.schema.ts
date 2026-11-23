// Categoría, municiones asignadas, ciudad y uso de cada arma del inventario de Operaciones
// (2026-11-19). `InvArma` ya existe en producción y el despliegue no corre migraciones; Prisma
// pide TODAS las columnas del modelo en cada consulta, así que las columnas nuevas se aseguran
// aquí, antes de que arranque cualquier otro módulo. Son solo aditivas y opcionales: un deploy
// anterior sigue funcionando con las columnas ya creadas.
//
// Se protege con `to_regclass` porque en una base nueva la tabla la crea
// OperacionesInventarioModule DESPUÉS de este paso; ahí las columnas ya vienen en su CREATE TABLE.
export const INV_ARMA_CAMPOS_DDL = [
  `DO $$ BEGIN
    IF to_regclass('"InvArma"') IS NOT NULL THEN
      ALTER TABLE "InvArma" ADD COLUMN IF NOT EXISTS "categoria" TEXT;
      ALTER TABLE "InvArma" ADD COLUMN IF NOT EXISTS "municiones" INTEGER;
      ALTER TABLE "InvArma" ADD COLUMN IF NOT EXISTS "ciudad" TEXT;
      ALTER TABLE "InvArma" ADD COLUMN IF NOT EXISTS "uso" TEXT;
    END IF;
  END $$`,
];
