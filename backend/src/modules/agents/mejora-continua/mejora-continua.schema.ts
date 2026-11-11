/**
 * Tablas del Agente de Mejora Continua (Sistemas → Mejora continua, 2026-11-11).
 *
 * - AgentPropuesta: el «libro» de propuestas. Es la memoria del agente (qué se
 *   aprobó, qué se rechazó y por qué) y la fuente del resumen del viernes.
 * - AgentMejoraInforme: lo que acompaña a cada corrida (alertas de riesgo y
 *   aprendizaje del lunes; mejorado / faltó / rechazado del viernes).
 *
 * Mismo mecanismo que agent-run.schema.ts: el despliegue no corre migraciones,
 * así que MejoraContinuaService las crea al arrancar. Tablas nuevas, sin claves
 * foráneas: nada previo las lee, así que no hay riesgo si un despliegue anterior
 * sigue vivo. No tienen modelo en schema.prisma a propósito (se consultan con SQL
 * parametrizado) para no tocar el cliente de Prisma mientras hay otras ramas en curso.
 */
export const MEJORA_CONTINUA_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "AgentPropuesta" (
    "id" SERIAL NOT NULL,
    "semana" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "queSeAutomatiza" TEXT,
    "decisionHumana" TEXT,
    "plan" JSONB NOT NULL DEFAULT '[]',
    "impacto" TEXT,
    "esfuerzo" TEXT,
    "riesgo" TEXT,
    "lineaBlanca" BOOLEAN NOT NULL DEFAULT false,
    "evidencia" TEXT,
    "dependeDe" TEXT,
    "porQueAhora" TEXT,
    "comoProbarBarato" TEXT,
    "horasAhorradasMes" DOUBLE PRECISION,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "motivo" TEXT,
    "comentarioCambios" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "historial" JSONB NOT NULL DEFAULT '[]',
    "companyId" INTEGER,
    "decididoPorId" INTEGER,
    "decididoPorNombre" TEXT,
    "decididoEn" TIMESTAMP(3),
    "hechaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPropuesta_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentPropuesta_semana_idx" ON "AgentPropuesta"("semana")`,
  `CREATE INDEX IF NOT EXISTS "AgentPropuesta_estado_idx" ON "AgentPropuesta"("estado")`,
  `CREATE TABLE IF NOT EXISTS "AgentMejoraInforme" (
    "id" SERIAL NOT NULL,
    "semana" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "companyId" INTEGER,
    "contenido" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentMejoraInforme_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentMejoraInforme_semana_tipo_idx" ON "AgentMejoraInforme"("semana", "tipo")`,
];
