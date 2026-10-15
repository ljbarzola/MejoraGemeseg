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
];
