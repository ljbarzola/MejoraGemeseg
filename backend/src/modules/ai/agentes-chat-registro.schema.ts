/**
 * Tabla AgentChatRegistro: historial propio de lo que se les pregunta a los agentes de chat
 * (Sistemas → Agentes). Una fila por pregunta respondida, sin claves foráneas: si alguien borra su
 * conversación (ChatMessage se borra en cascada) o su usuario, la fila se queda.
 *
 * Mismo mecanismo que agent-run.schema.ts: el despliegue no corre migraciones, así que
 * AgentesHistorialService la crea al arrancar. Tabla nueva: nada previo la lee, así que no hay riesgo
 * si un despliegue anterior sigue vivo.
 */
export const AGENT_CHAT_REGISTRO_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "AgentChatRegistro" (
    "id" SERIAL NOT NULL,
    "chatMessageId" INTEGER,
    "agentId" INTEGER,
    "agentNombre" TEXT NOT NULL,
    "agentScope" TEXT,
    "companyId" INTEGER,
    "userId" INTEGER,
    "userNombre" TEXT,
    "contexto" TEXT,
    "pregunta" TEXT,
    "respuesta" TEXT NOT NULL,
    "modelo" TEXT,
    "tokens" INTEGER,
    "duracionMs" INTEGER,
    "exito" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "consulta" TEXT,
    "detalle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentChatRegistro_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AgentChatRegistro_chatMessageId_key" ON "AgentChatRegistro"("chatMessageId")`,
  `CREATE INDEX IF NOT EXISTS "AgentChatRegistro_agentId_createdAt_idx" ON "AgentChatRegistro"("agentId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AgentChatRegistro_companyId_createdAt_idx" ON "AgentChatRegistro"("companyId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AgentChatRegistro_userId_createdAt_idx" ON "AgentChatRegistro"("userId", "createdAt")`,
];
