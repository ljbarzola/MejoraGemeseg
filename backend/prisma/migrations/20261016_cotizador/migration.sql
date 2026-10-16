-- Cotizador de Ventas y CRM. Mismo SQL que src/modules/ventas/cotizador.schema.ts (que lo ejecuta al arrancar).
-- Todas las sentencias son idempotentes (IF NOT EXISTS) y solo crean tablas NUEVAS.
CREATE TABLE IF NOT EXISTS "CotProduct" (
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
  );
CREATE UNIQUE INDEX IF NOT EXISTS "CotProduct_companyId_code_key" ON "CotProduct"("companyId", "code");
CREATE INDEX IF NOT EXISTS "CotProduct_companyId_kind_isActive_idx" ON "CotProduct"("companyId", "kind", "isActive");
DO $$ BEGIN
    ALTER TABLE "CotProduct" ADD CONSTRAINT "CotProduct_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
CREATE TABLE IF NOT EXISTS "CotInstallService" (
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
  );
CREATE UNIQUE INDEX IF NOT EXISTS "CotInstallService_companyId_code_key" ON "CotInstallService"("companyId", "code");
CREATE INDEX IF NOT EXISTS "CotInstallService_companyId_isActive_idx" ON "CotInstallService"("companyId", "isActive");
DO $$ BEGIN
    ALTER TABLE "CotInstallService" ADD CONSTRAINT "CotInstallService_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
CREATE TABLE IF NOT EXISTS "CotCounter" (
    "companyId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL,
    CONSTRAINT "CotCounter_pkey" PRIMARY KEY ("companyId", "kind")
  );
DO $$ BEGIN
    ALTER TABLE "CotCounter" ADD CONSTRAINT "CotCounter_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
CREATE TABLE IF NOT EXISTS "CotQuoteSequence" (
    "companyId" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL,
    CONSTRAINT "CotQuoteSequence_pkey" PRIMARY KEY ("companyId")
  );
DO $$ BEGIN
    ALTER TABLE "CotQuoteSequence" ADD CONSTRAINT "CotQuoteSequence_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
CREATE TABLE IF NOT EXISTS "CotKit" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "components" JSONB NOT NULL DEFAULT '[]',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CotKit_pkey" PRIMARY KEY ("id")
  );
CREATE INDEX IF NOT EXISTS "CotKit_companyId_idx" ON "CotKit"("companyId");
DO $$ BEGIN
    ALTER TABLE "CotKit" ADD CONSTRAINT "CotKit_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
DO $$ BEGIN
    ALTER TABLE "CotKit" ADD CONSTRAINT "CotKit_createdBy_fkey"
      FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
CREATE TABLE IF NOT EXISTS "CotTemplate" (
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
  );
CREATE INDEX IF NOT EXISTS "CotTemplate_companyId_idx" ON "CotTemplate"("companyId");
DO $$ BEGIN
    ALTER TABLE "CotTemplate" ADD CONSTRAINT "CotTemplate_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
DO $$ BEGIN
    ALTER TABLE "CotTemplate" ADD CONSTRAINT "CotTemplate_createdBy_fkey"
      FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
CREATE TABLE IF NOT EXISTS "CotQuote" (
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
  );
CREATE UNIQUE INDEX IF NOT EXISTS "CotQuote_companyId_quoteNumber_key" ON "CotQuote"("companyId", "quoteNumber");
CREATE INDEX IF NOT EXISTS "CotQuote_companyId_ownerId_idx" ON "CotQuote"("companyId", "ownerId");
CREATE INDEX IF NOT EXISTS "CotQuote_companyId_status_idx" ON "CotQuote"("companyId", "status");
DO $$ BEGIN
    ALTER TABLE "CotQuote" ADD CONSTRAINT "CotQuote_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
DO $$ BEGIN
    ALTER TABLE "CotQuote" ADD CONSTRAINT "CotQuote_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
CREATE TABLE IF NOT EXISTS "CotQuoteShare" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "sharedWithId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CotQuoteShare_pkey" PRIMARY KEY ("id")
  );
CREATE UNIQUE INDEX IF NOT EXISTS "CotQuoteShare_quoteId_sharedWithId_key" ON "CotQuoteShare"("quoteId", "sharedWithId");
CREATE INDEX IF NOT EXISTS "CotQuoteShare_companyId_sharedWithId_idx" ON "CotQuoteShare"("companyId", "sharedWithId");
DO $$ BEGIN
    ALTER TABLE "CotQuoteShare" ADD CONSTRAINT "CotQuoteShare_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
DO $$ BEGIN
    ALTER TABLE "CotQuoteShare" ADD CONSTRAINT "CotQuoteShare_quoteId_fkey"
      FOREIGN KEY ("quoteId") REFERENCES "CotQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
DO $$ BEGIN
    ALTER TABLE "CotQuoteShare" ADD CONSTRAINT "CotQuoteShare_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
DO $$ BEGIN
    ALTER TABLE "CotQuoteShare" ADD CONSTRAINT "CotQuoteShare_sharedWithId_fkey"
      FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
CREATE TABLE IF NOT EXISTS "CotEditGrant" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "editorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CotEditGrant_pkey" PRIMARY KEY ("id")
  );
CREATE UNIQUE INDEX IF NOT EXISTS "CotEditGrant_ownerId_editorId_key" ON "CotEditGrant"("ownerId", "editorId");
CREATE INDEX IF NOT EXISTS "CotEditGrant_companyId_editorId_idx" ON "CotEditGrant"("companyId", "editorId");
DO $$ BEGIN
    ALTER TABLE "CotEditGrant" ADD CONSTRAINT "CotEditGrant_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
DO $$ BEGIN
    ALTER TABLE "CotEditGrant" ADD CONSTRAINT "CotEditGrant_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
DO $$ BEGIN
    ALTER TABLE "CotEditGrant" ADD CONSTRAINT "CotEditGrant_editorId_fkey"
      FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
