-- 2026-10-01: Contratación Pública — entregas de documentos de otras áreas
-- para el informe mensual de cada entidad.
--
-- Aditiva y sin pérdida de datos: solo crea 3 tablas nuevas, sus índices y
-- FKs. Idempotente (IF NOT EXISTS / DO $$), se puede correr más de una vez y
-- con la base en uso. El código viejo no las conoce, así que aplicarla antes
-- de desplegar no rompe nada.

CREATE TABLE IF NOT EXISTS "CPSolicitudMensual" (
    "id" SERIAL NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "enviadaAt" TIMESTAMP(3),
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPSolicitudMensual_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPEntregaDocumento" (
    "id" SERIAL NOT NULL,
    "solicitudId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "departmentId" INTEGER,
    "fechaLimite" DATE NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "origen" TEXT,
    "url" TEXT,
    "motivoRechazo" TEXT,
    "entregadoPorId" INTEGER,
    "entregadoPorNombre" TEXT,
    "entregadoAt" TIMESTAMP(3),
    "revisadoPorId" INTEGER,
    "revisadoPorNombre" TEXT,
    "revisadoAt" TIMESTAMP(3),
    "ultimoRecordatorioAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPEntregaDocumento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPEntregaResponsable" (
    "id" SERIAL NOT NULL,
    "entregaId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "CPEntregaResponsable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CPSolicitudMensual_companyId_idx" ON "CPSolicitudMensual"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "CPSolicitudMensual_entidadId_anio_mes_key" ON "CPSolicitudMensual"("entidadId", "anio", "mes");
CREATE INDEX IF NOT EXISTS "CPEntregaDocumento_solicitudId_idx" ON "CPEntregaDocumento"("solicitudId");
CREATE INDEX IF NOT EXISTS "CPEntregaDocumento_estado_fechaLimite_idx" ON "CPEntregaDocumento"("estado", "fechaLimite");
CREATE INDEX IF NOT EXISTS "CPEntregaResponsable_userId_idx" ON "CPEntregaResponsable"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CPEntregaResponsable_entregaId_userId_key" ON "CPEntregaResponsable"("entregaId", "userId");

DO $$ BEGIN
  ALTER TABLE "CPSolicitudMensual" ADD CONSTRAINT "CPSolicitudMensual_entidadId_fkey" FOREIGN KEY ("entidadId") REFERENCES "CPEntidadPublica"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CPSolicitudMensual" ADD CONSTRAINT "CPSolicitudMensual_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CPEntregaDocumento" ADD CONSTRAINT "CPEntregaDocumento_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "CPSolicitudMensual"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CPEntregaDocumento" ADD CONSTRAINT "CPEntregaDocumento_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CPEntregaResponsable" ADD CONSTRAINT "CPEntregaResponsable_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "CPEntregaDocumento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CPEntregaResponsable" ADD CONSTRAINT "CPEntregaResponsable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
