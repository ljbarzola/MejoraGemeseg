/**
 * Tablas de las bitácoras de guardianía. (La tabla AgentRun, el registro de
 * actividad de los agentes, la crea el módulo de agentes: agents/agent-run.schema.ts;
 * las dos columnas de horario de CPCodigoTurno se aseguran en PrismaService:
 * prisma/cp-codigo-turno-horas.schema.ts.)
 *
 * Mismo mecanismo que novedad-app.schema.ts / cotizador.schema.ts: el despliegue
 * no corre migraciones, así que CPBitacorasModule lo ejecuta al arrancar. Es el
 * MISMO SQL de prisma/migrations/20261020_cp_bitacoras/migration.sql. Cada
 * sentencia es idempotente y va en su propia llamada. Todas las tablas son
 * nuevas: nada previo las lee.
 */
export const CP_BITACORAS_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "CPBitacora" (
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
  )`,
  `CREATE INDEX IF NOT EXISTS "CPBitacora_companyId_puestoId_idx" ON "CPBitacora"("companyId", "puestoId")`,
  `CREATE INDEX IF NOT EXISTS "CPBitacora_companyId_fechaDesde_idx" ON "CPBitacora"("companyId", "fechaDesde")`,

  `CREATE TABLE IF NOT EXISTS "CPBitacoraRegistro" (
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
  )`,
  `CREATE INDEX IF NOT EXISTS "CPBitacoraRegistro_bitacoraId_idx" ON "CPBitacoraRegistro"("bitacoraId")`,

  `CREATE TABLE IF NOT EXISTS "CPBitacoraNovedad" (
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
  )`,
  `CREATE INDEX IF NOT EXISTS "CPBitacoraNovedad_bitacoraId_idx" ON "CPBitacoraNovedad"("bitacoraId")`,
  `CREATE INDEX IF NOT EXISTS "CPBitacoraNovedad_fecha_idx" ON "CPBitacoraNovedad"("fecha")`,

  `CREATE TABLE IF NOT EXISTS "CPBitacoraHallazgo" (
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
  )`,
  `CREATE INDEX IF NOT EXISTS "CPBitacoraHallazgo_bitacoraId_idx" ON "CPBitacoraHallazgo"("bitacoraId")`,
];
