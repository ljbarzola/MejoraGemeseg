/**
 * Tabla AgentRun: el registro de lo que hacen los agentes que trabajan solos
 * (hoy el revisor de bitácoras). Sistemas lo lee en Sistemas → Agentes.
 *
 * Mismo mecanismo que novedad-app.schema.ts: el despliegue no corre
 * migraciones, así que AgentRunService la crea al arrancar. Es el mismo SQL de
 * prisma/migrations/20261020_cp_bitacoras/migration.sql. Tabla nueva: nada
 * previo la lee, así que no hay riesgo si un despliegue anterior sigue vivo.
 */
export const AGENT_RUN_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "AgentRun" (
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
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentRun_agentId_createdAt_idx" ON "AgentRun"("agentId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AgentRun_companyId_createdAt_idx" ON "AgentRun"("companyId", "createdAt")`,
];
