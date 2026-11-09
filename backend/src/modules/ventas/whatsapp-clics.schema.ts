/**
 * Clics en el botón de WhatsApp de las landings (2026-10-30). Un clic NO es un
 * posible cliente: solo se convierte en lead cuando el operador confirma que
 * llegó el mensaje con su código («Inició conversación»). Por eso viven en una
 * tabla aparte y no en "SalesLead".
 *
 * Mismo patrón que sales-pipeline.schema.ts: el despliegue no corre migraciones,
 * así que la tabla se crea al arrancar (VentasSchemaService). Tabla nueva, sin
 * modelo en schema.prisma (se lee con SQL, como AuthAttempt): no hay columnas
 * nuevas sobre tablas que producción ya tenga. Todo es idempotente.
 */
export const SALES_WHATSAPP_CLICK_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "SalesWhatsappClick" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "trackingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLIC',
    "utmSource" TEXT NOT NULL DEFAULT 'direct',
    "utmMedium" TEXT NOT NULL DEFAULT 'none',
    "utmCampaign" TEXT NOT NULL DEFAULT 'none',
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "landingPage" TEXT,
    "serviceName" TEXT,
    "serviceGroup" TEXT,
    "pageUrl" TEXT,
    "whatsappNumber" TEXT,
    "leadId" INTEGER,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationAt" TIMESTAMP(3),
    "conversationBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesWhatsappClick_pkey" PRIMARY KEY ("id")
  )`,
  // A qué número de WhatsApp (de qué vendedor) fue el clic. Columna añadida antes del primer despliegue: el ALTER
  // cubre las bases locales que ya tenían la tabla.
  `ALTER TABLE "SalesWhatsappClick" ADD COLUMN IF NOT EXISTS "whatsappNumber" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SalesWhatsappClick_companyId_trackingId_key" ON "SalesWhatsappClick"("companyId", "trackingId")`,
  `CREATE INDEX IF NOT EXISTS "SalesWhatsappClick_companyId_clickedAt_idx" ON "SalesWhatsappClick"("companyId", "clickedAt")`,
  `CREATE INDEX IF NOT EXISTS "SalesWhatsappClick_leadId_idx" ON "SalesWhatsappClick"("leadId")`,
];
