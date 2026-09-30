-- Lote 2026-09-30: Contratación Pública, pipeline/referidos/responsable de
-- clientes de Ventas, notificaciones, sedes (CompanyLocation), Base de
-- Conocimiento del agente, agente por defecto (Agent.isDefault) y permisos
-- por mensaje del chat (ChatMessage.sections).
--
-- Aditiva y sin pérdida de datos: solo agrega tablas, columnas, índices y
-- FKs; lo único que cambia algo existente es SalesClient.email, que pasa a
-- opcional. Idempotente (IF NOT EXISTS / DO $$), se puede correr más de una
-- vez y con la base en uso.
--
-- ORDEN: aplicar ANTES de desplegar el backend nuevo. El código nuevo lee
-- User.locationId y Agent.isDefault en cada login/chat; el código viejo
-- ignora las columnas nuevas, así que aplicarla primero no rompe nada.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locationId" INTEGER;

ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "sections" TEXT;

ALTER TABLE "SalesClientField" ADD COLUMN IF NOT EXISTS "allowOther" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "options" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "SalesClient" ADD COLUMN IF NOT EXISTS "assignedUserId" INTEGER,
ADD COLUMN IF NOT EXISTS "referredByUserId" INTEGER,
ADD COLUMN IF NOT EXISTS "status" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "CompanyLocation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyKnowledgeBase" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" INTEGER,

    CONSTRAINT "CompanyKnowledgeBase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SalesClientStage" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#718096',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesClientStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SalesClientStageChange" (
    "id" SERIAL NOT NULL,
    "salesClientId" INTEGER NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "notes" TEXT,
    "changedBy" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesClientStageChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPEntidadPublica" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "ruc" TEXT,
    "direccion" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPEntidadPublica_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPContrato" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "referenciaProceso" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "valorTotal" DOUBLE PRECISION,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "contratoOrigenId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPContrato_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPContratoAdenda" (
    "id" SERIAL NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "archivoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CPContratoAdenda_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPContratoAdjunto" (
    "id" SERIAL NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT,
    "filePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CPContratoAdjunto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPPuestoServicio" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoTurno" TEXT NOT NULL,
    "cantidadGuardias" INTEGER NOT NULL DEFAULT 1,
    "guardiasSimultaneosRequeridos" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPPuestoServicio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPPatronRotacion" (
    "id" SERIAL NOT NULL,
    "puestoId" INTEGER NOT NULL,
    "tramos" JSONB NOT NULL,
    "coberturaSimultanea" INTEGER NOT NULL DEFAULT 1,
    "ordenGuardias" JSONB NOT NULL,
    "fechaInicioCiclo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPPatronRotacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPPuestoGuardia" (
    "id" SERIAL NOT NULL,
    "puestoId" INTEGER NOT NULL,
    "cedula" TEXT NOT NULL,
    "nombreGuardia" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CPPuestoGuardia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPCodigoTurno" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT,
    "esDescanso" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPCodigoTurno_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPHorarioMensual" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "motivoRechazo" TEXT,
    "enviadoAt" TIMESTAMP(3),
    "aprobadoAt" TIMESTAMP(3),
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPHorarioMensual_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPHorarioCelda" (
    "id" SERIAL NOT NULL,
    "horarioId" INTEGER NOT NULL,
    "puestoId" INTEGER NOT NULL,
    "cedula" TEXT NOT NULL,
    "nombreGuardia" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "codigoTurno" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPHorarioCelda_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPInformeMensual" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "horarioMensualId" INTEGER,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "retroalimentacion" TEXT,
    "conclusiones" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "generatedPdfPath" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPInformeMensual_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPTextoInstitucional" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPTextoInstitucional_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CPPlantillaInforme" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "driveUrl" TEXT,
    "docxPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPPlantillaInforme_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyLocation_companyId_idx" ON "CompanyLocation"("companyId");

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyLocation_companyId_nombre_key" ON "CompanyLocation"("companyId", "nombre");

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyKnowledgeBase_companyId_key" ON "CompanyKnowledgeBase"("companyId");

CREATE INDEX IF NOT EXISTS "Notification_userId_leida_idx" ON "Notification"("userId", "leida");

CREATE INDEX IF NOT EXISTS "SalesClientStage_companyId_idx" ON "SalesClientStage"("companyId");

CREATE UNIQUE INDEX IF NOT EXISTS "SalesClientStage_companyId_key_key" ON "SalesClientStage"("companyId", "key");

CREATE INDEX IF NOT EXISTS "SalesClientStageChange_salesClientId_idx" ON "SalesClientStageChange"("salesClientId");

CREATE INDEX IF NOT EXISTS "CPEntidadPublica_companyId_idx" ON "CPEntidadPublica"("companyId");

CREATE INDEX IF NOT EXISTS "CPContrato_companyId_idx" ON "CPContrato"("companyId");

CREATE INDEX IF NOT EXISTS "CPContrato_entidadId_idx" ON "CPContrato"("entidadId");

CREATE INDEX IF NOT EXISTS "CPContratoAdenda_contratoId_idx" ON "CPContratoAdenda"("contratoId");

CREATE INDEX IF NOT EXISTS "CPContratoAdjunto_contratoId_idx" ON "CPContratoAdjunto"("contratoId");

CREATE INDEX IF NOT EXISTS "CPPuestoServicio_companyId_idx" ON "CPPuestoServicio"("companyId");

CREATE INDEX IF NOT EXISTS "CPPuestoServicio_contratoId_idx" ON "CPPuestoServicio"("contratoId");

CREATE UNIQUE INDEX IF NOT EXISTS "CPPatronRotacion_puestoId_key" ON "CPPatronRotacion"("puestoId");

CREATE INDEX IF NOT EXISTS "CPPuestoGuardia_puestoId_idx" ON "CPPuestoGuardia"("puestoId");

CREATE UNIQUE INDEX IF NOT EXISTS "CPPuestoGuardia_puestoId_cedula_key" ON "CPPuestoGuardia"("puestoId", "cedula");

CREATE INDEX IF NOT EXISTS "CPCodigoTurno_companyId_idx" ON "CPCodigoTurno"("companyId");

CREATE UNIQUE INDEX IF NOT EXISTS "CPCodigoTurno_companyId_codigo_key" ON "CPCodigoTurno"("companyId", "codigo");

CREATE INDEX IF NOT EXISTS "CPHorarioMensual_companyId_idx" ON "CPHorarioMensual"("companyId");

CREATE INDEX IF NOT EXISTS "CPHorarioMensual_contratoId_idx" ON "CPHorarioMensual"("contratoId");

CREATE INDEX IF NOT EXISTS "CPHorarioCelda_horarioId_idx" ON "CPHorarioCelda"("horarioId");

CREATE INDEX IF NOT EXISTS "CPHorarioCelda_puestoId_idx" ON "CPHorarioCelda"("puestoId");

CREATE UNIQUE INDEX IF NOT EXISTS "CPHorarioCelda_horarioId_puestoId_cedula_fecha_key" ON "CPHorarioCelda"("horarioId", "puestoId", "cedula", "fecha");

CREATE UNIQUE INDEX IF NOT EXISTS "CPInformeMensual_horarioMensualId_key" ON "CPInformeMensual"("horarioMensualId");

CREATE INDEX IF NOT EXISTS "CPInformeMensual_companyId_idx" ON "CPInformeMensual"("companyId");

CREATE UNIQUE INDEX IF NOT EXISTS "CPInformeMensual_contratoId_anio_mes_key" ON "CPInformeMensual"("contratoId", "anio", "mes");

CREATE INDEX IF NOT EXISTS "CPTextoInstitucional_companyId_idx" ON "CPTextoInstitucional"("companyId");

CREATE UNIQUE INDEX IF NOT EXISTS "CPTextoInstitucional_companyId_clave_key" ON "CPTextoInstitucional"("companyId", "clave");

CREATE UNIQUE INDEX IF NOT EXISTS "CPPlantillaInforme_companyId_key" ON "CPPlantillaInforme"("companyId");

CREATE INDEX IF NOT EXISTS "SalesClient_companyId_status_idx" ON "SalesClient"("companyId", "status");

CREATE INDEX IF NOT EXISTS "SalesClient_referredByUserId_idx" ON "SalesClient"("referredByUserId");

CREATE INDEX IF NOT EXISTS "SalesClient_assignedUserId_idx" ON "SalesClient"("assignedUserId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_locationId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CompanyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyLocation_companyId_fkey') THEN
    ALTER TABLE "CompanyLocation" ADD CONSTRAINT "CompanyLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyKnowledgeBase_companyId_fkey') THEN
    ALTER TABLE "CompanyKnowledgeBase" ADD CONSTRAINT "CompanyKnowledgeBase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_companyId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesClientStage_companyId_fkey') THEN
    ALTER TABLE "SalesClientStage" ADD CONSTRAINT "SalesClientStage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesClientStageChange_salesClientId_fkey') THEN
    ALTER TABLE "SalesClientStageChange" ADD CONSTRAINT "SalesClientStageChange_salesClientId_fkey" FOREIGN KEY ("salesClientId") REFERENCES "SalesClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesClientStageChange_changedBy_fkey') THEN
    ALTER TABLE "SalesClientStageChange" ADD CONSTRAINT "SalesClientStageChange_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesClientStageChange_companyId_fkey') THEN
    ALTER TABLE "SalesClientStageChange" ADD CONSTRAINT "SalesClientStageChange_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesClient_referredByUserId_fkey') THEN
    ALTER TABLE "SalesClient" ADD CONSTRAINT "SalesClient_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesClient_companyId_status_fkey') THEN
    ALTER TABLE "SalesClient" ADD CONSTRAINT "SalesClient_companyId_status_fkey" FOREIGN KEY ("companyId", "status") REFERENCES "SalesClientStage"("companyId", "key") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesClient_assignedUserId_fkey') THEN
    ALTER TABLE "SalesClient" ADD CONSTRAINT "SalesClient_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPEntidadPublica_companyId_fkey') THEN
    ALTER TABLE "CPEntidadPublica" ADD CONSTRAINT "CPEntidadPublica_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPContrato_companyId_fkey') THEN
    ALTER TABLE "CPContrato" ADD CONSTRAINT "CPContrato_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPContrato_entidadId_fkey') THEN
    ALTER TABLE "CPContrato" ADD CONSTRAINT "CPContrato_entidadId_fkey" FOREIGN KEY ("entidadId") REFERENCES "CPEntidadPublica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPContrato_createdBy_fkey') THEN
    ALTER TABLE "CPContrato" ADD CONSTRAINT "CPContrato_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPContrato_contratoOrigenId_fkey') THEN
    ALTER TABLE "CPContrato" ADD CONSTRAINT "CPContrato_contratoOrigenId_fkey" FOREIGN KEY ("contratoOrigenId") REFERENCES "CPContrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPContratoAdenda_contratoId_fkey') THEN
    ALTER TABLE "CPContratoAdenda" ADD CONSTRAINT "CPContratoAdenda_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "CPContrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPContratoAdjunto_contratoId_fkey') THEN
    ALTER TABLE "CPContratoAdjunto" ADD CONSTRAINT "CPContratoAdjunto_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "CPContrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPPuestoServicio_companyId_fkey') THEN
    ALTER TABLE "CPPuestoServicio" ADD CONSTRAINT "CPPuestoServicio_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPPuestoServicio_contratoId_fkey') THEN
    ALTER TABLE "CPPuestoServicio" ADD CONSTRAINT "CPPuestoServicio_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "CPContrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPPatronRotacion_puestoId_fkey') THEN
    ALTER TABLE "CPPatronRotacion" ADD CONSTRAINT "CPPatronRotacion_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "CPPuestoServicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPPuestoGuardia_puestoId_fkey') THEN
    ALTER TABLE "CPPuestoGuardia" ADD CONSTRAINT "CPPuestoGuardia_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "CPPuestoServicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPCodigoTurno_companyId_fkey') THEN
    ALTER TABLE "CPCodigoTurno" ADD CONSTRAINT "CPCodigoTurno_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPHorarioMensual_companyId_fkey') THEN
    ALTER TABLE "CPHorarioMensual" ADD CONSTRAINT "CPHorarioMensual_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPHorarioMensual_contratoId_fkey') THEN
    ALTER TABLE "CPHorarioMensual" ADD CONSTRAINT "CPHorarioMensual_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "CPContrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPHorarioMensual_createdBy_fkey') THEN
    ALTER TABLE "CPHorarioMensual" ADD CONSTRAINT "CPHorarioMensual_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPHorarioCelda_horarioId_fkey') THEN
    ALTER TABLE "CPHorarioCelda" ADD CONSTRAINT "CPHorarioCelda_horarioId_fkey" FOREIGN KEY ("horarioId") REFERENCES "CPHorarioMensual"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPHorarioCelda_puestoId_fkey') THEN
    ALTER TABLE "CPHorarioCelda" ADD CONSTRAINT "CPHorarioCelda_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "CPPuestoServicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPInformeMensual_companyId_fkey') THEN
    ALTER TABLE "CPInformeMensual" ADD CONSTRAINT "CPInformeMensual_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPInformeMensual_contratoId_fkey') THEN
    ALTER TABLE "CPInformeMensual" ADD CONSTRAINT "CPInformeMensual_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "CPContrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPInformeMensual_horarioMensualId_fkey') THEN
    ALTER TABLE "CPInformeMensual" ADD CONSTRAINT "CPInformeMensual_horarioMensualId_fkey" FOREIGN KEY ("horarioMensualId") REFERENCES "CPHorarioMensual"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPInformeMensual_createdBy_fkey') THEN
    ALTER TABLE "CPInformeMensual" ADD CONSTRAINT "CPInformeMensual_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPTextoInstitucional_companyId_fkey') THEN
    ALTER TABLE "CPTextoInstitucional" ADD CONSTRAINT "CPTextoInstitucional_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CPPlantillaInforme_companyId_fkey') THEN
    ALTER TABLE "CPPlantillaInforme" ADD CONSTRAINT "CPPlantillaInforme_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Agente por defecto: renombra el agente global sembrado y lo marca
-- isDefault (mismo efecto que prisma/rename-default-agent.js). Si no existe,
-- AiService.getDefaultAgentId lo crea solo en el primer mensaje.
UPDATE "Agent" SET "name" = 'Agente Gemeseg', "isDefault" = true
WHERE "createdBy" IS NULL AND "name" IN ('Agente GEMESEG', 'Agente Gemeseg')
  AND NOT EXISTS (SELECT 1 FROM "Agent" WHERE "isDefault" = true);
