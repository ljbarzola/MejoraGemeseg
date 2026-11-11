// Datos que el informe mensual de Contratación Pública necesita y hoy no existen
// (2026-11-10): del contrato, quién lo administra en la entidad y cómo se compró; de cada
// puesto, dónde queda. Columnas nuevas de tablas que producción ya tiene, y Prisma las pide en
// cada consulta: se aseguran al arrancar, como cp-codigo-turno-horas.schema.ts. Todas son
// opcionales (un despliegue anterior sigue funcionando) y sin valor por defecto.
// Mismo SQL que prisma/migrations/20261110_cp_informe_datos/migration.sql (solo referencia).
export const CP_INFORME_DATOS_DDL = [
  'ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "administradorNombre" TEXT',
  'ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "administradorCargo" TEXT',
  'ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "tipoCompra" TEXT',
  // Día en que empieza el ciclo mensual del contrato (24 = del 24 al 23). Sin valor o 1 = mes calendario.
  'ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "diaCorte" INTEGER',
  // Datos de la orden de compra que el informe del Ministerio cita (2026-11-10).
  'ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "fechaEmisionOrden" DATE',
  'ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "fechaAceptacionOrden" DATE',
  'ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "fechaSuscripcionOrden" DATE',
  'ALTER TABLE "CPContrato" ADD COLUMN IF NOT EXISTS "plazoDias" INTEGER',
  'ALTER TABLE "CPPuestoServicio" ADD COLUMN IF NOT EXISTS "canton" TEXT',
  'ALTER TABLE "CPPuestoServicio" ADD COLUMN IF NOT EXISTS "edificio" TEXT',
  'ALTER TABLE "CPPuestoServicio" ADD COLUMN IF NOT EXISTS "ubicacion" TEXT',
  // Varias plantillas de informe por empresa (2026-11-10): cuál usa cada informe (vacío = la primera).
  'ALTER TABLE "CPInformeMensual" ADD COLUMN IF NOT EXISTS "plantillaId" INTEGER',
  `CREATE TABLE IF NOT EXISTS "CPPlantillaInformeArchivo" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "docxPath" TEXT NOT NULL,
    "storedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CPPlantillaInformeArchivo_pkey" PRIMARY KEY ("id")
  )`,
  'CREATE INDEX IF NOT EXISTS "CPPlantillaInformeArchivo_companyId_idx" ON "CPPlantillaInformeArchivo"("companyId")',
];
