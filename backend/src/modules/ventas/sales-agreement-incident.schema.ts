import { fk } from './sales-agreement.schema';

/**
 * Registro de incidentes y conversación de salida POR CONTRATO (2026-10-18).
 *
 * Antes esto se anotaba en el Historial de la ficha del cliente (SalesClientActivity). La
 * usuaria decidió que pertenece al contrato: un incidente ocurre durante la vigencia de UN
 * contrato, y la conversación de salida es lo que dijo el cliente al terminar ese contrato.
 *
 * Mismo patrón que sales-contact.schema.ts: el despliegue NO corre migraciones, así que la
 * tabla se crea sola al arrancar (ver VentasSchemaService). Va DESPUÉS de SALES_AGREEMENT_DDL.
 */
export const SALES_AGREEMENT_INCIDENT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "SalesAgreementIncident" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "agreementId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesAgreementIncident_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "SalesAgreementIncident_companyId_agreementId_idx" ON "SalesAgreementIncident"("companyId", "agreementId")`,
  fk('SalesAgreementIncident', 'companyId', 'Company', 'CASCADE'),
  fk('SalesAgreementIncident', 'agreementId', 'SalesAgreement', 'CASCADE'),
];
