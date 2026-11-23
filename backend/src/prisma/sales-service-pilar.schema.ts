// «Pilar» de cada servicio del catálogo de Ventas (2026-11-13): Gemeseg, Megamont o Adasmeg, las tres
// categorías de siempre con el nombre de la empresa (ver ventas-pilares.const.ts).
// `SalesService` ya existe en producción y el despliegue no corre migraciones; Prisma pide TODAS las columnas
// del modelo en cada consulta, así que la columna se asegura aquí, antes de que arranque cualquier otro
// módulo. Es solo aditiva y opcional: un deploy anterior sigue funcionando con la columna ya creada.
//
// Se protege con `to_regclass` porque en una base nueva la tabla la crea VentasSchemaService DESPUÉS de este
// paso; ahí la columna ya viene en su CREATE TABLE.
//
// El relleno solo toca los servicios con pilar nulo (nunca uno ya elegido, ni el «Sin pilar» elegido a
// propósito, que se guarda como texto vacío) y se deduce de la categoría que el servicio ya tenía en su
// descripción. Es idempotente.
export const SALES_SERVICE_PILAR_DDL = [
  `DO $$ BEGIN
    IF to_regclass('"SalesService"') IS NOT NULL THEN
      ALTER TABLE "SalesService" ADD COLUMN IF NOT EXISTS "pilar" TEXT;
      UPDATE "SalesService" SET "pilar" = CASE lower(btrim(translate("description", 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')))
          WHEN 'seguridad fisica' THEN 'GEMESEG'
          WHEN 'monitoreo' THEN 'MEGAMONT'
          WHEN 'soluciones tecnologicas' THEN 'ADASMEG'
        END
      WHERE "pilar" IS NULL
        AND lower(btrim(translate("description", 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')))
            IN ('seguridad fisica', 'monitoreo', 'soluciones tecnologicas');
    END IF;
  END $$`,
];
