-- AlterTable
ALTER TABLE "GuardiaFichaPersonal" ADD COLUMN     "camposPersonalizados" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "PersonalFieldDefinition" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GUARDIA',
    "category" TEXT NOT NULL DEFAULT 'PERSONAL',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdministrativeStaffFicha" (
    "id" SERIAL NOT NULL,
    "cedula" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "departamento" TEXT,
    "fechaIngreso" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "tipoContrato" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "contactoEmergenciaNombre" TEXT,
    "contactoEmergenciaTelefono" TEXT,
    "salarioAcordado" DOUBLE PRECISION,
    "camposPersonalizados" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdministrativeStaffFicha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CedulaMergeLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "cedulaOrigen" TEXT NOT NULL,
    "cedulaDestino" TEXT NOT NULL,
    "nombreDestino" TEXT NOT NULL,
    "resumen" JSONB NOT NULL,
    "mergedBy" INTEGER NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CedulaMergeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonalFieldDefinition_companyId_idx" ON "PersonalFieldDefinition"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalFieldDefinition_companyId_scope_key_key" ON "PersonalFieldDefinition"("companyId", "scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeStaffFicha_companyId_cedula_key" ON "AdministrativeStaffFicha"("companyId", "cedula");

-- CreateIndex
CREATE INDEX "CedulaMergeLog_companyId_idx" ON "CedulaMergeLog"("companyId");

-- AddForeignKey
ALTER TABLE "PersonalFieldDefinition" ADD CONSTRAINT "PersonalFieldDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeStaffFicha" ADD CONSTRAINT "AdministrativeStaffFicha_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CedulaMergeLog" ADD CONSTRAINT "CedulaMergeLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CedulaMergeLog" ADD CONSTRAINT "CedulaMergeLog_mergedBy_fkey" FOREIGN KEY ("mergedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
