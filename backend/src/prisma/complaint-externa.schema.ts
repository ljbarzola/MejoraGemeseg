// Quejas externas (formulario público quejas.gemeseg.com, 2026-11-11).
// El despliegue no corre migraciones y Prisma pide TODAS las columnas de Complaint en cada
// consulta: las columnas nuevas se aseguran aquí, al arrancar (ver PrismaService.asegurarColumnas).
// Todo es aditivo: las quejas que ya existen quedan como 'INTERNA' y un deploy anterior
// sigue funcionando con las columnas ya creadas.
export const COMPLAINT_EXTERNA_DDL = [
  `ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "origen" TEXT NOT NULL DEFAULT 'INTERNA'`,
  'ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "tipo" TEXT',
  'ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "sede" TEXT',
  'ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "fechaInduccion" TEXT',
  'ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "contactoNombre" TEXT',
  'ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "contactoEmail" TEXT',
  'ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "contactoTelefono" TEXT',
  'ALTER TABLE "Complaint" ADD COLUMN IF NOT EXISTS "personasInvolucradas" TEXT',
  `CREATE TABLE IF NOT EXISTS "ComplaintPublicOption" (
    "id" SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "ComplaintPublicOption_companyId_kind_label_key" ON "ComplaintPublicOption"("companyId", "kind", "label")',
  'CREATE INDEX IF NOT EXISTS "ComplaintPublicOption_companyId_kind_idx" ON "ComplaintPublicOption"("companyId", "kind")',
  `CREATE TABLE IF NOT EXISTS "ComplaintPublicSetting" (
    "companyId" INTEGER PRIMARY KEY REFERENCES "Company"("id") ON DELETE CASCADE,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];
