-- Referencia: el despliegue no corre migraciones; las columnas se aseguran al arrancar (src/prisma/cp-informe-datos.schema.ts).
ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "administradorNombre" TEXT;
ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "administradorCargo" TEXT;
ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "tipoCompra" TEXT;
ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "diaCorte" INTEGER;
ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "fechaEmisionOrden" DATE;
ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "fechaAceptacionOrden" DATE;
ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "fechaSuscripcionOrden" DATE;
ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "plazoDias" INTEGER;
ALTER TABLE "CPPuestoServicio" ADD COLUMN IF NOT EXISTS "canton" TEXT;
ALTER TABLE "CPPuestoServicio" ADD COLUMN IF NOT EXISTS "edificio" TEXT;
ALTER TABLE "CPPuestoServicio" ADD COLUMN IF NOT EXISTS "ubicacion" TEXT;
ALTER TABLE "CPInformeMensual" ADD COLUMN IF NOT EXISTS "plantillaId" INTEGER;
CREATE TABLE IF NOT EXISTS "CPPlantillaInformeArchivo" (
  "id" SERIAL NOT NULL, "companyId" INTEGER NOT NULL, "nombre" TEXT NOT NULL, "docxPath" TEXT NOT NULL, "storedKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CPPlantillaInformeArchivo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CPPlantillaInformeArchivo_companyId_idx" ON "CPPlantillaInformeArchivo"("companyId");
