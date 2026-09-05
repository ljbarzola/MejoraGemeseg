-- Sprint 3 (aprobacion/rechazo documental) + Sprint 4 (cuerpo de plantilla de contrato).
-- Escrita de forma idempotente porque en Cloud SQL estas migraciones se aplican a
-- mano y deben poder re-ejecutarse tras un fallo parcial.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "ContractTemplate" ADD COLUMN IF NOT EXISTS "content" TEXT;

-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "reviewReason" TEXT;
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "reviewedBy" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DocumentReview" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER,
    "cedula" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "DocumentReviewStatus" NOT NULL,
    "reason" TEXT,
    "companyId" INTEGER NOT NULL,
    "reviewedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DocumentReview_companyId_cedula_idx" ON "DocumentReview"("companyId", "cedula");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: SetNull para que el historial sobreviva al borrado del documento
DO $$ BEGIN
  ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "EmployeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
