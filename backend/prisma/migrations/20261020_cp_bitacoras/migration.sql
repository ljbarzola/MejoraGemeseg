-- 2026-10-18: Bitacoras de guardia (Contratacion Publica) y registro de actividad de agentes.
--   * 2 columnas opcionales en CPCodigoTurno (horaInicio/horaFin del turno).
--   * 4 tablas de bitacoras y la tabla AgentRun.
-- Aditiva e idempotente. El despliegue NO corre migraciones, pero el servidor crea todo
-- esto solo al arrancar (prisma.service.ts, bitacoras.schema.ts, agent-run.schema.ts);
-- este archivo es el registro / para quien lo aplique a mano.

ALTER TABLE "CPCodigoTurno" ADD COLUMN IF NOT EXISTS "horaInicio" TEXT;

ALTER TABLE "CPCodigoTurno" ADD COLUMN IF NOT EXISTS "horaFin" TEXT;

CREATE TABLE IF NOT EXISTS "CPBitacora" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "puestoId" INTEGER NOT NULL,
    "puestoNombre" TEXT NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "contratoNumero" TEXT NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "entidadNombre" TEXT NOT NULL,
    "subidoPorId" INTEGER NOT NULL,
    "subidoPorNombre" TEXT NOT NULL,
    "archivoKey" TEXT,
    "archivoNombre" TEXT,
    "archivoTipo" TEXT,
    "origenLectura" TEXT NOT NULL DEFAULT 'IA',
    "estadoLectura" TEXT NOT NULL DEFAULT 'SIN_LECTURA',
    "mensajeLectura" TEXT,
    "puestoLeido" TEXT,
    "observaciones" TEXT,
    "fechas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "fechaDesde" DATE,
    "fechaHasta" DATE,
    "resultado" TEXT NOT NULL DEFAULT 'SIN_REVISAR',
    "revisadaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CPBitacora_pkey" PRIMARY KEY ("id")
  );

CREATE INDEX IF NOT EXISTS "CPBitacora_companyId_puestoId_idx" ON "CPBitacora"("companyId", "puestoId");

CREATE INDEX IF NOT EXISTS "CPBitacora_companyId_fechaDesde_idx" ON "CPBitacora"("companyId", "fechaDesde");

CREATE TABLE IF NOT EXISTS "CPBitacoraRegistro" (
    "id" SERIAL NOT NULL,
    "bitacoraId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "guardiaLeido" TEXT NOT NULL,
    "cedula" TEXT,
    "guardiaNombre" TEXT,
    "coincidencia" DOUBLE PRECISION,
    "horaEntrada" TEXT,
    "horaSalida" TEXT,
    "legible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CPBitacoraRegistro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CPBitacoraRegistro_bitacoraId_fkey" FOREIGN KEY ("bitacoraId") REFERENCES "CPBitacora"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

CREATE INDEX IF NOT EXISTS "CPBitacoraRegistro_bitacoraId_idx" ON "CPBitacoraRegistro"("bitacoraId");

CREATE TABLE IF NOT EXISTS "CPBitacoraNovedad" (
    "id" SERIAL NOT NULL,
    "bitacoraId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "hora" TEXT,
    "guardiaLeido" TEXT,
    "texto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'OTRO',
    "gravedad" TEXT NOT NULL DEFAULT 'BAJA',
    "orden" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CPBitacoraNovedad_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CPBitacoraNovedad_bitacoraId_fkey" FOREIGN KEY ("bitacoraId") REFERENCES "CPBitacora"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

CREATE INDEX IF NOT EXISTS "CPBitacoraNovedad_bitacoraId_idx" ON "CPBitacoraNovedad"("bitacoraId");

CREATE INDEX IF NOT EXISTS "CPBitacoraNovedad_fecha_idx" ON "CPBitacoraNovedad"("fecha");

CREATE TABLE IF NOT EXISTS "CPBitacoraHallazgo" (
    "id" SERIAL NOT NULL,
    "bitacoraId" INTEGER NOT NULL,
    "fecha" DATE,
    "tipo" TEXT NOT NULL,
    "severidad" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "nota" TEXT,
    "resueltoPorNombre" TEXT,
    "resueltoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CPBitacoraHallazgo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CPBitacoraHallazgo_bitacoraId_fkey" FOREIGN KEY ("bitacoraId") REFERENCES "CPBitacora"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

CREATE INDEX IF NOT EXISTS "CPBitacoraHallazgo_bitacoraId_idx" ON "CPBitacoraHallazgo"("bitacoraId");

CREATE TABLE IF NOT EXISTS "AgentRun" (
    "id" SERIAL NOT NULL,
    "agentId" INTEGER,
    "agentNombre" TEXT NOT NULL,
    "agentScope" TEXT,
    "companyId" INTEGER,
    "userId" INTEGER,
    "userNombre" TEXT,
    "accion" TEXT NOT NULL,
    "resumen" TEXT,
    "entidadTipo" TEXT,
    "entidadId" INTEGER,
    "modelo" TEXT,
    "tokensEntrada" INTEGER,
    "tokensSalida" INTEGER,
    "duracionMs" INTEGER,
    "exito" BOOLEAN NOT NULL,
    "error" TEXT,
    "detalle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
  );

CREATE INDEX IF NOT EXISTS "AgentRun_agentId_createdAt_idx" ON "AgentRun"("agentId", "createdAt");

CREATE INDEX IF NOT EXISTS "AgentRun_companyId_createdAt_idx" ON "AgentRun"("companyId", "createdAt");
