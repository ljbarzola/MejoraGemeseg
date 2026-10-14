-- Contratos comerciales de Ventas: catálogo de servicios, contrato, sus servicios y documentos.
-- Se aplica sola al arrancar el backend (ventas/sales-agreement.schema.ts); este
-- archivo queda como registro y para quien aplique migraciones a mano.

CREATE TABLE IF NOT EXISTS "SalesService" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesService_companyId_name_key" ON "SalesService"("companyId", "name");

CREATE INDEX IF NOT EXISTS "SalesService_companyId_idx" ON "SalesService"("companyId");

DO $$ BEGIN
  ALTER TABLE "SalesService" ADD CONSTRAINT "SalesService_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SalesAgreement" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "salesClientId" INTEGER NOT NULL,
  "title" TEXT,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVO',
  "renewedFromId" INTEGER,
  "notes" TEXT,
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesAgreement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalesAgreement_companyId_status_idx" ON "SalesAgreement"("companyId", "status");

CREATE INDEX IF NOT EXISTS "SalesAgreement_salesClientId_idx" ON "SalesAgreement"("salesClientId");

CREATE INDEX IF NOT EXISTS "SalesAgreement_companyId_endDate_idx" ON "SalesAgreement"("companyId", "endDate");

DO $$ BEGIN
  ALTER TABLE "SalesAgreement" ADD CONSTRAINT "SalesAgreement_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SalesAgreement" ADD CONSTRAINT "SalesAgreement_salesClientId_fkey"
    FOREIGN KEY ("salesClientId") REFERENCES "SalesClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SalesAgreement" ADD CONSTRAINT "SalesAgreement_renewedFromId_fkey"
    FOREIGN KEY ("renewedFromId") REFERENCES "SalesAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SalesAgreementService" (
  "agreementId" INTEGER NOT NULL,
  "serviceId" INTEGER NOT NULL,
  CONSTRAINT "SalesAgreementService_pkey" PRIMARY KEY ("agreementId", "serviceId")
);

CREATE INDEX IF NOT EXISTS "SalesAgreementService_serviceId_idx" ON "SalesAgreementService"("serviceId");

DO $$ BEGIN
  ALTER TABLE "SalesAgreementService" ADD CONSTRAINT "SalesAgreementService_agreementId_fkey"
    FOREIGN KEY ("agreementId") REFERENCES "SalesAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SalesAgreementService" ADD CONSTRAINT "SalesAgreementService_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "SalesService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SalesAgreementDocument" (
  "contractId" INTEGER NOT NULL,
  "agreementId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesAgreementDocument_pkey" PRIMARY KEY ("contractId")
);

CREATE INDEX IF NOT EXISTS "SalesAgreementDocument_agreementId_idx" ON "SalesAgreementDocument"("agreementId");

DO $$ BEGIN
  ALTER TABLE "SalesAgreementDocument" ADD CONSTRAINT "SalesAgreementDocument_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "SalesContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SalesAgreementDocument" ADD CONSTRAINT "SalesAgreementDocument_agreementId_fkey"
    FOREIGN KEY ("agreementId") REFERENCES "SalesAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
