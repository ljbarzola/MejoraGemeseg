import { fk } from './sales-agreement.schema';

/**
 * Tablas del Cotizador de Ventas. Mismo mecanismo que sales-agreement.schema.ts:
 * el despliegue no corre migraciones, así que VentasSchemaService las crea al
 * arrancar (todas `IF NOT EXISTS`, una sentencia por llamada). Es el MISMO SQL de
 * prisma/migrations/20261016_cotizador/migration.sql.
 *
 * Todas las tablas son NUEVAS: no se agrega ninguna columna a una tabla que
 * producción ya tenga. Las claves foráneas viven solo aquí (los modelos Prisma
 * no declaran relaciones con User/Company a propósito).
 */
export const COTIZADOR_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "CotProduct" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "subcategory" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT '',
    "defaultQty" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "monthlyCost" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "annualCost" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "hasProfit" BOOLEAN NOT NULL DEFAULT false,
    "hasInstall" BOOLEAN NOT NULL DEFAULT false,
    "supplier" TEXT NOT NULL DEFAULT '',
    "lastUpdate" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "minPrice" DECIMAL(15,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CotProduct_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CotProduct_companyId_code_key" ON "CotProduct"("companyId", "code")`,
  `CREATE INDEX IF NOT EXISTS "CotProduct_companyId_kind_isActive_idx" ON "CotProduct"("companyId", "kind", "isActive")`,
  fk('CotProduct', 'companyId', 'Company', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "CotInstallService" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "subcategory" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "unitCost" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CotInstallService_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CotInstallService_companyId_code_key" ON "CotInstallService"("companyId", "code")`,
  `CREATE INDEX IF NOT EXISTS "CotInstallService_companyId_isActive_idx" ON "CotInstallService"("companyId", "isActive")`,
  fk('CotInstallService', 'companyId', 'Company', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "CotCounter" (
    "companyId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL,
    CONSTRAINT "CotCounter_pkey" PRIMARY KEY ("companyId", "kind")
  )`,
  fk('CotCounter', 'companyId', 'Company', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "CotQuoteSequence" (
    "companyId" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL,
    CONSTRAINT "CotQuoteSequence_pkey" PRIMARY KEY ("companyId")
  )`,
  fk('CotQuoteSequence', 'companyId', 'Company', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "CotKit" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "components" JSONB NOT NULL DEFAULT '[]',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CotKit_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CotKit_companyId_idx" ON "CotKit"("companyId")`,
  fk('CotKit', 'companyId', 'Company', 'CASCADE'),
  fk('CotKit', 'createdBy', 'User', 'SET NULL'),

  `CREATE TABLE IF NOT EXISTS "CotTemplate" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "clientType" TEXT NOT NULL DEFAULT 'mediana',
    "industry" TEXT NOT NULL DEFAULT 'comercio',
    "client" JSONB NOT NULL DEFAULT '{}',
    "items" JSONB NOT NULL DEFAULT '[]',
    "supplierMargins" JSONB NOT NULL DEFAULT '{}',
    "installMargin" DECIMAL(6,2) NOT NULL DEFAULT 35,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" INTEGER,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CotTemplate_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CotTemplate_companyId_idx" ON "CotTemplate"("companyId")`,
  fk('CotTemplate', 'companyId', 'Company', 'CASCADE'),
  fk('CotTemplate', 'createdBy', 'User', 'SET NULL'),

  `CREATE TABLE IF NOT EXISTS "CotQuote" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "vendorName" TEXT NOT NULL DEFAULT '',
    "quoteNumber" TEXT NOT NULL,
    "quoteDate" DATE NOT NULL,
    "client" JSONB NOT NULL DEFAULT '{}',
    "items" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'borrador',
    "installMargin" DECIMAL(6,2) NOT NULL DEFAULT 35,
    "supplierMargins" JSONB NOT NULL DEFAULT '{}',
    "discountType" TEXT NOT NULL DEFAULT 'none',
    "discountValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "conditions" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CotQuote_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CotQuote_companyId_quoteNumber_key" ON "CotQuote"("companyId", "quoteNumber")`,
  `CREATE INDEX IF NOT EXISTS "CotQuote_companyId_ownerId_idx" ON "CotQuote"("companyId", "ownerId")`,
  `CREATE INDEX IF NOT EXISTS "CotQuote_companyId_status_idx" ON "CotQuote"("companyId", "status")`,
  fk('CotQuote', 'companyId', 'Company', 'CASCADE'),
  fk('CotQuote', 'ownerId', 'User', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "CotQuoteShare" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "sharedWithId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CotQuoteShare_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CotQuoteShare_quoteId_sharedWithId_key" ON "CotQuoteShare"("quoteId", "sharedWithId")`,
  `CREATE INDEX IF NOT EXISTS "CotQuoteShare_companyId_sharedWithId_idx" ON "CotQuoteShare"("companyId", "sharedWithId")`,
  fk('CotQuoteShare', 'companyId', 'Company', 'CASCADE'),
  fk('CotQuoteShare', 'quoteId', 'CotQuote', 'CASCADE'),
  fk('CotQuoteShare', 'ownerId', 'User', 'CASCADE'),
  fk('CotQuoteShare', 'sharedWithId', 'User', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "CotEditGrant" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "editorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CotEditGrant_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CotEditGrant_ownerId_editorId_key" ON "CotEditGrant"("ownerId", "editorId")`,
  `CREATE INDEX IF NOT EXISTS "CotEditGrant_companyId_editorId_idx" ON "CotEditGrant"("companyId", "editorId")`,
  fk('CotEditGrant', 'companyId', 'Company', 'CASCADE'),
  fk('CotEditGrant', 'ownerId', 'User', 'CASCADE'),
  fk('CotEditGrant', 'editorId', 'User', 'CASCADE'),

  // Historial de cambios del catálogo (2026-11-12). Tabla nueva: no toca las existentes.
  `CREATE TABLE IF NOT EXISTS "CotCambio" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "accion" TEXT NOT NULL,
    "campo" TEXT NOT NULL DEFAULT '',
    "valorAntes" TEXT,
    "valorDespues" TEXT,
    "userId" INTEGER,
    "userNombre" TEXT NOT NULL DEFAULT '',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CotCambio_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CotCambio_companyId_creadoEn_idx" ON "CotCambio"("companyId", "creadoEn")`,
  `CREATE INDEX IF NOT EXISTS "CotCambio_companyId_codigo_idx" ON "CotCambio"("companyId", "codigo")`,
  fk('CotCambio', 'companyId', 'Company', 'CASCADE'),
  fk('CotCambio', 'userId', 'User', 'SET NULL'),

  // Límites de precio por empresa (2026-11-12): solo generan avisos en la cotización, no bloquean.
  // Vacío = sin límite.
  `CREATE TABLE IF NOT EXISTS "CotLimites" (
    "companyId" INTEGER NOT NULL,
    "maxDescuentoPct" DECIMAL(6,2),
    "maxDescuentoServiciosPct" DECIMAL(6,2),
    "minGananciaPct" DECIMAL(6,2),
    "updatedBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CotLimites_pkey" PRIMARY KEY ("companyId")
  )`,
  fk('CotLimites', 'companyId', 'Company', 'CASCADE'),
  fk('CotLimites', 'updatedBy', 'User', 'SET NULL'),

  // Enlace de la cotización para el cliente (2026-11-17). Tablas NUEVAS, sin modelo Prisma
  // (se consultan con SQL en cotizador-enlaces.service.ts). Un enlace activo por cotización;
  // desactivarlo lo deja guardado (con sus visitas) y uno nuevo lleva otro código.
  `CREATE TABLE IF NOT EXISTS "CotEnlace" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPor" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desactivadoEn" TIMESTAMP(3),
    "primeraVista" TIMESTAMP(3),
    "ultimaVista" TIMESTAMP(3),
    CONSTRAINT "CotEnlace_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CotEnlace_token_key" ON "CotEnlace"("token")`,
  `CREATE INDEX IF NOT EXISTS "CotEnlace_quoteId_idx" ON "CotEnlace"("quoteId")`,
  fk('CotEnlace', 'companyId', 'Company', 'CASCADE'),
  fk('CotEnlace', 'quoteId', 'CotQuote', 'CASCADE'),
  fk('CotEnlace', 'creadoPor', 'User', 'SET NULL'),

  // Cada vez que alguien abre el enlace. No guarda IP ni nada personal: solo el tipo de equipo,
  // un identificador al azar del navegador (para contar personas distintas) y el tiempo con la página
  // a la vista. Las aperturas del propio equipo (sesión iniciada de la empresa) se marcan "interna".
  `CREATE TABLE IF NOT EXISTS "CotEnlaceVisita" (
    "id" SERIAL NOT NULL,
    "enlaceId" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "visitante" TEXT NOT NULL DEFAULT '',
    "dispositivo" TEXT NOT NULL DEFAULT 'computadora',
    "interna" BOOLEAN NOT NULL DEFAULT false,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoLatido" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "segundos" INTEGER NOT NULL DEFAULT 0,
    "descargoPdf" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CotEnlaceVisita_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CotEnlaceVisita_enlaceId_idx" ON "CotEnlaceVisita"("enlaceId")`,
  fk('CotEnlaceVisita', 'enlaceId', 'CotEnlace', 'CASCADE'),

  // «Me interesa» / «Tengo dudas» que el cliente deja desde la página.
  `CREATE TABLE IF NOT EXISTS "CotEnlaceRespuesta" (
    "id" SERIAL NOT NULL,
    "enlaceId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL DEFAULT '',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CotEnlaceRespuesta_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CotEnlaceRespuesta_enlaceId_idx" ON "CotEnlaceRespuesta"("enlaceId")`,
  fk('CotEnlaceRespuesta', 'enlaceId', 'CotEnlace', 'CASCADE'),

  // Cotización ↔ oportunidad (2026-11-17). Tabla NUEVA, sin modelo Prisma (cotizador-oportunidad.service.ts).
  // Una cotización pertenece a UNA oportunidad; una oportunidad puede tener varias cotizaciones
  // (versiones o alternativas, no son varias oportunidades). El vendedor marca UNA como principal y su
  // total pasa a ser el monto cotizado de la oportunidad. Si se borra la oportunidad o la cotización,
  // el enlace se va con ella.
  `CREATE TABLE IF NOT EXISTS "CotQuoteOportunidad" (
    "quoteId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "opportunityId" INTEGER NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "unidaPor" INTEGER,
    "unidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CotQuoteOportunidad_pkey" PRIMARY KEY ("quoteId")
  )`,
  `CREATE INDEX IF NOT EXISTS "CotQuoteOportunidad_opp_idx" ON "CotQuoteOportunidad"("opportunityId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CotQuoteOportunidad_principal_key" ON "CotQuoteOportunidad"("opportunityId") WHERE "principal"`,
  fk('CotQuoteOportunidad', 'quoteId', 'CotQuote', 'CASCADE'),
  fk('CotQuoteOportunidad', 'companyId', 'Company', 'CASCADE'),
  fk('CotQuoteOportunidad', 'opportunityId', 'SalesOpportunity', 'CASCADE'),
  fk('CotQuoteOportunidad', 'unidaPor', 'User', 'SET NULL'),
];
