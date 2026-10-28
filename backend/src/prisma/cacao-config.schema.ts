// Línea blanca del módulo Cacao: calidades por empresa y ajustes por empresa. El despliegue no
// corre migraciones, así que se aseguran al arrancar, igual que cacao-liquidaciones.schema.ts.
// Todo es idempotente y aditivo: un despliegue anterior sigue funcionando con la columna y la
// tabla creadas (el único cambio que no es aditivo es reemplazar el índice único global del
// nombre de la calidad por uno por empresa, que es más permisivo). Los bloques DO evitan que
// el arranque falle en una base que aún no tenga la tabla CacaoQuality. Mismo SQL que
// prisma/migrations/20261023_cacao_linea_blanca/migration.sql.
export const CACAO_CONFIG_DDL = [
  'ALTER TABLE IF EXISTS "CacaoQuality" ADD COLUMN IF NOT EXISTS "companyId" INTEGER',
  // Las calidades que ya existen pasan a la empresa de los lotes que las usan...
  `DO $$ BEGIN
     IF to_regclass('"CacaoQuality"') IS NOT NULL AND to_regclass('"CacaoLot"') IS NOT NULL THEN
       UPDATE "CacaoQuality" q SET "companyId" = l."companyId"
       FROM (SELECT DISTINCT ON ("qualityId") "qualityId", "companyId" FROM "CacaoLot" ORDER BY "qualityId", "id") l
       WHERE q."id" = l."qualityId" AND q."companyId" IS NULL;
     END IF;
   END $$`,
  // ...y las que nadie usa, a la única empresa que tiene Cacao habilitado (si hay una sola).
  `DO $$ BEGIN
     IF to_regclass('"CacaoQuality"') IS NOT NULL AND to_regclass('"CompanySection"') IS NOT NULL THEN
       UPDATE "CacaoQuality"
       SET "companyId" = (SELECT MIN("companyId") FROM "CompanySection" WHERE "section" = 'CACAO')
       WHERE "companyId" IS NULL
         AND (SELECT COUNT(DISTINCT "companyId") FROM "CompanySection" WHERE "section" = 'CACAO') = 1;
     END IF;
   END $$`,
  'DROP INDEX IF EXISTS "CacaoQuality_name_key"',
  `DO $$ BEGIN
     IF to_regclass('"CacaoQuality"') IS NOT NULL THEN
       CREATE UNIQUE INDEX IF NOT EXISTS "CacaoQuality_companyId_name_key" ON "CacaoQuality" ("companyId", "name");
     END IF;
   END $$`,
  // El código de lote era único en toda la base: dos empresas chocaban en su primer lote del año.
  'DROP INDEX IF EXISTS "CacaoLot_code_key"',
  `DO $$ BEGIN
     IF to_regclass('"CacaoLot"') IS NOT NULL THEN
       CREATE UNIQUE INDEX IF NOT EXISTS "CacaoLot_companyId_code_key" ON "CacaoLot" ("companyId", "code");
     END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS "CacaoSetting" (
     "id" SERIAL NOT NULL,
     "companyId" INTEGER NOT NULL,
     "key" TEXT NOT NULL,
     "value" TEXT NOT NULL,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "CacaoSetting_pkey" PRIMARY KEY ("id")
   )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "CacaoSetting_companyId_key_key" ON "CacaoSetting" ("companyId", "key")',
  // Motivos de rechazo y anulación por empresa (2026-10-27). Tabla nueva: solo la lee código nuevo.
  `CREATE TABLE IF NOT EXISTS "CacaoMotivo" (
     "id" SERIAL NOT NULL,
     "companyId" INTEGER NOT NULL,
     "tipo" TEXT NOT NULL,
     "nombre" TEXT NOT NULL,
     "activo" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "CacaoMotivo_pkey" PRIMARY KEY ("id")
   )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "CacaoMotivo_companyId_tipo_nombre_key" ON "CacaoMotivo" ("companyId", "tipo", "nombre")',
  // Datos del ticket de pesaje en la recepción (2026-10-27). Columnas nuevas, opcionales y sin
  // valor por defecto: el despliegue anterior sigue funcionando con ellas creadas.
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "ticketNumber" TEXT',
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "weighingProfile" TEXT',
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "driverName" TEXT',
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "vehiclePlate" TEXT',
  // Cierre de una entrega sin liquidar (2026-10-27): quién, cuándo y por qué.
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3)',
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "closedBy" INTEGER',
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "closeReason" TEXT',
  // Anular una recepción y un embarque (2026-10-27): quién, cuándo y por qué.
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3)',
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "voidedBy" INTEGER',
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "voidReason" TEXT',
  'ALTER TABLE IF EXISTS "CacaoShipment" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)',
  'ALTER TABLE IF EXISTS "CacaoShipment" ADD COLUMN IF NOT EXISTS "cancelledBy" INTEGER',
  'ALTER TABLE IF EXISTS "CacaoShipment" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT',
  // Puntos de acopio (2026-10-28). Tabla nueva y columna opcional en la recepción: el despliegue
  // anterior sigue funcionando con ellas creadas.
  `CREATE TABLE IF NOT EXISTS "CacaoPunto" (
     "id" SERIAL NOT NULL,
     "companyId" INTEGER NOT NULL,
     "nombre" TEXT NOT NULL,
     "direccion" TEXT,
     "activo" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "CacaoPunto_pkey" PRIMARY KEY ("id")
   )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "CacaoPunto_companyId_nombre_key" ON "CacaoPunto" ("companyId", "nombre")',
  'ALTER TABLE IF EXISTS "CacaoReception" ADD COLUMN IF NOT EXISTS "puntoId" INTEGER',
  // Solicitudes de pago con autorización (2026-10-28). Tabla nueva: solo la lee código nuevo.
  `CREATE TABLE IF NOT EXISTS "CacaoPaymentRequest" (
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
   )`,
  'CREATE INDEX IF NOT EXISTS "CacaoPaymentRequest_companyId_status_idx" ON "CacaoPaymentRequest" ("companyId", "status")',
  'CREATE INDEX IF NOT EXISTS "CacaoPaymentRequest_payableId_idx" ON "CacaoPaymentRequest" ("payableId")',
  // El número de ticket no se repite dentro de una empresa (Postgres deja varias filas con NULL).
  `DO $$ BEGIN
     IF to_regclass('"CacaoReception"') IS NOT NULL THEN
       CREATE UNIQUE INDEX IF NOT EXISTS "CacaoReception_companyId_ticketNumber_key" ON "CacaoReception" ("companyId", "ticketNumber");
     END IF;
   END $$`,
];
