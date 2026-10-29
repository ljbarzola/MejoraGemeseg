-- Solo REFERENCIA: los despliegues no corren migraciones. Lo mismo se crea al arrancar con
-- CACAO_CONFIG_DDL (backend/src/prisma/cacao-config.schema.ts). Todo es aditivo e idempotente.

-- Puntos de acopio de cada empresa (sucursales donde se recibe el cacao)
CREATE TABLE IF NOT EXISTS "CacaoPunto" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "direccion" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CacaoPunto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CacaoPunto_companyId_nombre_key" ON "CacaoPunto" ("companyId", "nombre");
ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "puntoId" INTEGER;

-- Solicitudes de pago con autorizacion (REQUESTED, AUTHORIZED, PAID, REJECTED, CANCELLED)
CREATE TABLE IF NOT EXISTS "CacaoPaymentRequest" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "payableId" INTEGER NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'TRANSFER',
  "reference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "requestedBy" INTEGER NOT NULL,
  "decidedBy" INTEGER,
  "decidedAt" TIMESTAMP(3),
  "decisionReason" TEXT,
  "paymentId" INTEGER,
  "paidBy" INTEGER,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CacaoPaymentRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CacaoPaymentRequest_companyId_status_idx" ON "CacaoPaymentRequest" ("companyId", "status");
CREATE INDEX IF NOT EXISTS "CacaoPaymentRequest_payableId_idx" ON "CacaoPaymentRequest" ("payableId");
