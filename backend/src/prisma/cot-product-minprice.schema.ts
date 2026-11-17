// Precio mínimo de venta de un producto o servicio del Cotizador (2026-11-12).
// `CotProduct` ya existe en producción y el despliegue no corre migraciones; Prisma pide
// TODAS las columnas del modelo en cada consulta, así que la columna nueva se asegura aquí,
// antes de que arranque cualquier otro módulo. Es solo aditiva y opcional (sin límite
// cuando está vacía): un deploy anterior sigue funcionando con la columna ya creada.
//
// Se protege con `to_regclass` porque en una base nueva la tabla la crea
// VentasSchemaService DESPUÉS de este paso; ahí la columna ya viene en su CREATE TABLE.
export const COT_PRODUCT_MINPRICE_DDL = [
  `DO $$ BEGIN
    IF to_regclass('"CotProduct"') IS NOT NULL THEN
      ALTER TABLE "CotProduct" ADD COLUMN IF NOT EXISTS "minPrice" DECIMAL(15,4);
    END IF;
  END $$`,
];
