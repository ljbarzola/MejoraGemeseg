-- ============================================
-- MIGRATION: Personal - tabla JobPosition (Sprint 1)
-- Fecha: 2026-09-04
-- Base de datos: gemeseg (PostgreSQL)
-- El modelo ya existia solo en schema.prisma; esta migracion
-- lo versiona para Cloud SQL. Idempotente (IF NOT EXISTS).
-- ============================================

CREATE TABLE IF NOT EXISTS "JobPosition" (
    "id"                 SERIAL PRIMARY KEY,
    "puesto"             TEXT NOT NULL,
    "descripcion"        TEXT,
    "camposRequeridos"   TEXT[] NOT NULL,
    "archivosRequeridos" TEXT[] NOT NULL,
    "driveFileId"        TEXT,
    "companyId"          INTEGER NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "JobPosition_companyId_idx" ON "JobPosition"("companyId");

DO $$ BEGIN
    ALTER TABLE "JobPosition" ADD CONSTRAINT "JobPosition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
