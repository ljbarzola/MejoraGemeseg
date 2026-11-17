/**
 * Bot de WhatsApp (2026-11-12). Dos tablas nuevas, sin modelo en schema.prisma (se leen con SQL,
 * igual que SalesWhatsappClick): el despliegue no corre migraciones, así que se crean al arrancar
 * (WhatsappBotSchemaService). Todo es idempotente y solo agrega: ninguna columna nueva sobre tablas
 * que producción ya tenga.
 *
 * - WaConversation: una por (empresa, teléfono). Guarda en qué punto va (bot, necesita persona,
 *   atendida por una persona) y cuántos mensajes del cliente nadie ha visto.
 * - WaMessage: TODO el historial (cliente, bot y personas). Las respuestas del bot nacen como
 *   PROPUESTO (modo copiloto) y un humano las aprueba, edita o descarta.
 */
export const WHATSAPP_BOT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "WaConversation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "contactName" TEXT,
    "leadId" INTEGER,
    "estado" TEXT NOT NULL DEFAULT 'BOT',
    "motivoEscalado" TEXT,
    "asignadoA" INTEGER,
    "sinLeer" INTEGER NOT NULL DEFAULT 0,
    "ultimoMensajeEn" TIMESTAMP(3),
    "ultimoEntranteEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaConversation_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WaConversation_companyId_phone_key" ON "WaConversation"("companyId", "phone")`,
  `CREATE INDEX IF NOT EXISTS "WaConversation_companyId_ultimo_idx" ON "WaConversation"("companyId", "ultimoMensajeEn")`,
  `CREATE TABLE IF NOT EXISTS "WaMessage" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "direccion" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "metaId" TEXT,
    "textoOriginalBot" TEXT,
    "respondeAId" INTEGER,
    "creadoPor" INTEGER,
    "simulado" BOOLEAN NOT NULL DEFAULT FALSE,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEn" TIMESTAMP(3),
    CONSTRAINT "WaMessage_pkey" PRIMARY KEY ("id")
  )`,
  // Cotización que calculó el sistema para esta respuesta (datos pedidos + resultado), para que el asesor la revise.
  `ALTER TABLE "WaMessage" ADD COLUMN IF NOT EXISTS "cotizacion" JSONB`,
  `CREATE INDEX IF NOT EXISTS "WaMessage_conversationId_idx" ON "WaMessage"("conversationId", "id")`,
  // Meta reintenta el aviso: el mismo mensaje (wamid) no debe guardarse dos veces.
  `CREATE UNIQUE INDEX IF NOT EXISTS "WaMessage_companyId_metaId_key" ON "WaMessage"("companyId", "metaId") WHERE "metaId" IS NOT NULL`,
];
