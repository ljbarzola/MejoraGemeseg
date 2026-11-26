/**
 * Tablas del módulo Marketing (Fase 1: plan completo + borradores).
 *
 * El despliegue no corre migraciones, así que se aseguran al arrancar con
 * sentencias idempotentes, igual que bitacora.schema.ts. Son tablas nuevas:
 * un servidor anterior sigue funcionando sin ellas.
 */
export const MARKETING_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "MarketingCampaign" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "idea" TEXT NOT NULL,
    "objetivo" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingCampaign_companyId_createdAt_idx" ON "MarketingCampaign"("companyId", "createdAt")`,

  `CREATE TABLE IF NOT EXISTS "MarketingPlan" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "resumen" TEXT,
    "publico" TEXT,
    "mercado" TEXT,
    "canales" TEXT,
    "calendario" TEXT,
    "kpis" TEXT,
    "presupuesto" TEXT,
    "advertencias" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingPlan_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingPlan_campaignId_idx" ON "MarketingPlan"("campaignId")`,

  `CREATE TABLE IF NOT EXISTS "MarketingPiece" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" TEXT,
    "titulo" TEXT,
    "contenido" TEXT NOT NULL,
    "origen" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "aprobadoPorId" INTEGER,
    "aprobadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingPiece_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingPiece_campaignId_idx" ON "MarketingPiece"("campaignId")`,
  // Fase 2: archivo de creatividad real (imagen) generado por Vertex.
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "archivoUrl" TEXT`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "mimeType" TEXT`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "archivoNombre" TEXT`,

  // Entrevista previa al plan (JSON [{pregunta, respuesta}]), medición (JSON) y fecha de cada pieza.
  `ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "entrevista" TEXT`,
  `ALTER TABLE "MarketingPlan" ADD COLUMN IF NOT EXISTS "medicion" TEXT`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "semana" INTEGER`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "dia" TEXT`,

  // Origen del dato de cada pieza, estado del archivo generado (imagen o video) y regla de aprobación.
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "fuenteDato" TEXT`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "estadoArchivo" TEXT`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "operacionArchivo" TEXT`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "errorArchivo" TEXT`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "archivoEn" TIMESTAMP(3)`,
  // Las piezas guardadas con un tipo libre («Publicación visual / Carrusel») pasan a texto, imagen o video.
  // Idempotente: solo toca lo que todavía no es uno de los tres.
  `UPDATE "MarketingPiece" SET "tipo" = CASE
     WHEN "tipo" ~* '(video|reel|tiktok|guion|guión)' THEN 'video'
     WHEN "tipo" ~* '(imagen|visual|carrusel|infograf|foto|banner|ilustr|dise)' THEN 'imagen'
     ELSE 'texto' END
   WHERE "tipo" NOT IN ('texto', 'imagen', 'video')`,

  `CREATE TABLE IF NOT EXISTS "MarketingEnvio" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "pieceId" INTEGER NOT NULL,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "motivo" TEXT,
    "creadoPorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingEnvio_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingEnvio_campaignId_idx" ON "MarketingEnvio"("campaignId")`,

  `CREATE TABLE IF NOT EXISTS "MarketingSetting" (
    "companyId" INTEGER NOT NULL,
    "tono" TEXT,
    "servicios" TEXT,
    "canalesPermitidos" TEXT,
    "aprobadorRol" TEXT,
    "consentimiento" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingSetting_pkey" PRIMARY KEY ("companyId")
  )`,
  // Va DESPUÉS del CREATE: en una base nueva, alterarla antes fallaba y cortaba el resto.
  `ALTER TABLE "MarketingSetting" ADD COLUMN IF NOT EXISTS "aprobadorDistinto" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "MarketingSetting" ADD COLUMN IF NOT EXISTS "competidores" TEXT`,

  // Campaña completa: canales elegidos (JSON de claves del catálogo + extras), presupuesto, inicio y origen.
  `ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "canales" TEXT`,
  `ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "presupuestoMensual" NUMERIC(12,2)`,
  `ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "fechaInicio" DATE`,
  `ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "origen" TEXT`,
  // Fecha real de cada pieza (calendario) y comentarios dados a la IA para rehacer la imagen.
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "fechaPublicacion" DATE`,
  `ALTER TABLE "MarketingPiece" ADD COLUMN IF NOT EXISTS "feedbackImagen" TEXT`,
  // Publicación: cuándo se programó, cuándo salió, en qué modo (DEMO / MANUAL / REAL).
  `ALTER TABLE "MarketingEnvio" ADD COLUMN IF NOT EXISTS "programadoPara" TIMESTAMP(3)`,
  `ALTER TABLE "MarketingEnvio" ADD COLUMN IF NOT EXISTS "publicadoEn" TIMESTAMP(3)`,
  `ALTER TABLE "MarketingEnvio" ADD COLUMN IF NOT EXISTS "modo" TEXT`,

  // Estado de conexión de cada canal por empresa: NO_CONECTADO, DEMO, SOLICITADO, CONECTADO.
  `CREATE TABLE IF NOT EXISTS "MarketingConexion" (
    "companyId" INTEGER NOT NULL,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'NO_CONECTADO',
    "cuenta" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingConexion_pkey" PRIMARY KEY ("companyId", "canal")
  )`,

  // Pedidos de la empresa al equipo que da el servicio: un canal que no está en el catálogo,
  // conectar una cuenta o «cuéntanos tu necesidad».
  `CREATE TABLE IF NOT EXISTS "MarketingRequerimiento" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" TEXT,
    "detalle" TEXT NOT NULL,
    "campaignId" INTEGER,
    "estado" TEXT NOT NULL DEFAULT 'NUEVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingRequerimiento_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingRequerimiento_companyId_idx" ON "MarketingRequerimiento"("companyId", "createdAt")`,

  // Campañas que propone el agente a partir de los datos de Ventas; una persona las acepta o descarta.
  `CREATE TABLE IF NOT EXISTS "MarketingPropuesta" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "objetivo" TEXT,
    "porque" TEXT,
    "senal" TEXT,
    "canales" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "campaignId" INTEGER,
    "decididoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingPropuesta_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingPropuesta_companyId_idx" ON "MarketingPropuesta"("companyId", "estado")`,

  // Radar de competencia: el último informe por empresa (JSON) con sus fuentes.
  `CREATE TABLE IF NOT EXISTS "MarketingRadar" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "contenido" TEXT NOT NULL,
    "fuentes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingRadar_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingRadar_companyId_idx" ON "MarketingRadar"("companyId", "createdAt")`,

  // Nombre corto de la campaña (lo escribe la IA a partir de la idea; la idea queda intacta).
  `ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "nombre" TEXT`,

  // Recursos de marca: sitio web, redes, herramientas y el resumen que la IA hace del sitio.
  `ALTER TABLE "MarketingSetting" ADD COLUMN IF NOT EXISTS "sitioWeb" TEXT`,
  `ALTER TABLE "MarketingSetting" ADD COLUMN IF NOT EXISTS "redesSociales" TEXT`,
  `ALTER TABLE "MarketingSetting" ADD COLUMN IF NOT EXISTS "herramientas" TEXT`,
  `ALTER TABLE "MarketingSetting" ADD COLUMN IF NOT EXISTS "resumenWeb" TEXT`,

  // Archivos de la marca (logo, fotos, videos, documentos). El contenido vive en StoredFile
  // (clave marketing/recursos/<archivoNombre>); aquí solo el registro.
  `CREATE TABLE IF NOT EXISTS "MarketingRecurso" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL CHECK ("tipo" IN ('LOGO', 'FOTO', 'VIDEO', 'DOCUMENTO')),
    "nombre" TEXT NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "MarketingRecurso_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MarketingRecurso_companyId_idx" ON "MarketingRecurso"("companyId", "tipo")`,
];
