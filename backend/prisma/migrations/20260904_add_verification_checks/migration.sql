-- ============================================
-- MIGRATION: Personal Sprint 2 - tabla VerificationCheck
-- Fecha: 2026-09-04
-- Base de datos: gemeseg (PostgreSQL)
-- Registro de verificaciones asistidas SICOSEP/SUT/IESS
-- (el spike concluyó que el scraping automatizado no es viable).
-- Idempotente (IF NOT EXISTS).
-- ============================================

CREATE TABLE IF NOT EXISTS "VerificationCheck" (
    "id"          SERIAL PRIMARY KEY,
    "cedula"      TEXT NOT NULL,
    "platform"    TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'PENDIENTE',
    "notes"       TEXT,
    "verifiedBy"  INTEGER NOT NULL,
    "verifiedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId"   INTEGER NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "VerificationCheck_companyId_cedula_idx" ON "VerificationCheck"("companyId", "cedula");

DO $$ BEGIN
    ALTER TABLE "VerificationCheck" ADD CONSTRAINT "VerificationCheck_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "VerificationCheck" ADD CONSTRAINT "VerificationCheck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
