// `CotQuote` ya existe en producción y el despliegue no corre migraciones; Prisma pide
// TODAS las columnas del modelo en cada consulta, así que la columna nueva se asegura
// aquí al arrancar (mismo patrón que cot-product-minprice.schema.ts).
// Se protege con `to_regclass` porque en una base nueva la tabla la crea
// VentasSchemaService DESPUÉS de este paso; ahí la columna ya viene en su CREATE TABLE.
export const COT_QUOTE_PILAR_DDL = [
  `DO $$ BEGIN
    IF to_regclass('"CotQuote"') IS NOT NULL THEN
      ALTER TABLE "CotQuote" ADD COLUMN IF NOT EXISTS "pilar" TEXT;
    END IF;
  END $$`,
];
