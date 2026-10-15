/**
 * Crea las tablas del contrato comercial de Ventas si no existen: "SalesService"
 * (catálogo de servicios), "SalesAgreement" (el contrato), "SalesAgreementService"
 * (servicios de cada contrato) y "SalesAgreementDocument" (documentos de
 * Documentación colgados del contrato).
 *
 * Por qué existe: el despliegue (cloudbuild.yaml + Dockerfile) NO corre
 * migraciones, así que una tabla nueva solo aparece si alguien aplica el SQL a
 * mano ANTES de desplegar. Mismo problema y mismo arreglo que "UserPreference"
 * (ver users/user-preference.schema.ts): el servicio se arregla solo al
 * arrancar. Por eso los documentos se enlazan con una tabla aparte y no con una
 * columna nueva en "SalesContract": una columna que Prisma conoce y la base no
 * tiene rompe TODA consulta a esa tabla.
 *
 * Es el MISMO SQL de prisma/migrations/20261007_sales_agreements/migration.sql
 * (queda como registro/para quien aplique migraciones a mano). Cada sentencia
 * es idempotente. Una sentencia por llamada porque el adaptador de Prisma no
 * garantiza varias sentencias en una sola consulta.
 *
 * No es un mecanismo general de migraciones: no copiar este patrón para tablas
 * que no lo necesiten.
 */
export const fk = (table: string, col: string, ref: string, onDelete: string) =>
  `DO $$ BEGIN
    ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${col}_fkey"
      FOREIGN KEY ("${col}") REFERENCES "${ref}"("id") ON DELETE ${onDelete} ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`;

export const SALES_AGREEMENT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "SalesService" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesService_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SalesService_companyId_name_key" ON "SalesService"("companyId", "name")`,
  `CREATE INDEX IF NOT EXISTS "SalesService_companyId_idx" ON "SalesService"("companyId")`,
  fk('SalesService', 'companyId', 'Company', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "SalesAgreement" (
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
  )`,
  `CREATE INDEX IF NOT EXISTS "SalesAgreement_companyId_status_idx" ON "SalesAgreement"("companyId", "status")`,
  `CREATE INDEX IF NOT EXISTS "SalesAgreement_salesClientId_idx" ON "SalesAgreement"("salesClientId")`,
  `CREATE INDEX IF NOT EXISTS "SalesAgreement_companyId_endDate_idx" ON "SalesAgreement"("companyId", "endDate")`,
  fk('SalesAgreement', 'companyId', 'Company', 'CASCADE'),
  fk('SalesAgreement', 'salesClientId', 'SalesClient', 'CASCADE'),
  fk('SalesAgreement', 'renewedFromId', 'SalesAgreement', 'SET NULL'),

  `CREATE TABLE IF NOT EXISTS "SalesAgreementService" (
    "agreementId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    CONSTRAINT "SalesAgreementService_pkey" PRIMARY KEY ("agreementId", "serviceId")
  )`,
  `CREATE INDEX IF NOT EXISTS "SalesAgreementService_serviceId_idx" ON "SalesAgreementService"("serviceId")`,
  fk('SalesAgreementService', 'agreementId', 'SalesAgreement', 'CASCADE'),
  fk('SalesAgreementService', 'serviceId', 'SalesService', 'CASCADE'),

  `CREATE TABLE IF NOT EXISTS "SalesAgreementDocument" (
    "contractId" INTEGER NOT NULL,
    "agreementId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesAgreementDocument_pkey" PRIMARY KEY ("contractId")
  )`,
  `CREATE INDEX IF NOT EXISTS "SalesAgreementDocument_agreementId_idx" ON "SalesAgreementDocument"("agreementId")`,
  fk('SalesAgreementDocument', 'contractId', 'SalesContract', 'CASCADE'),
  fk('SalesAgreementDocument', 'agreementId', 'SalesAgreement', 'CASCADE'),
];
