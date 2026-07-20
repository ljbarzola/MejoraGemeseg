-- ============================================
-- MIGRATION: Módulo de Inventario de Cacao v1.5.0
-- Fecha: 2026-07-20
-- Base de datos: gemeseg (PostgreSQL)
-- ============================================

BEGIN;

-- ============================================
-- 1. TABLA: CacaoUnitConfig
-- Configuración de unidades de medida por empresa
-- ============================================
CREATE TABLE IF NOT EXISTS "CacaoUnitConfig" (
    "id"          SERIAL PRIMARY KEY,
    "name"        TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kgPerUnit"   DOUBLE PRECISION NOT NULL,
    "isDefault"   BOOLEAN NOT NULL DEFAULT false,
    "companyId"   INTEGER NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. CAMPOS NUEVOS: CacaoReception
-- unitOfMeasure: unidad en que se registró la entrada
-- ============================================
DO $$ BEGIN
    ALTER TABLE "CacaoReception" ADD COLUMN "unitOfMeasure" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================
-- 3. CAMPOS NUEVOS: CacaoLot
-- differential: diferencial pactado ($/T) que viaja con el lote
-- ============================================
DO $$ BEGIN
    ALTER TABLE "CacaoLot" ADD COLUMN "differential" DOUBLE PRECISION;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================
-- 4. CAMPOS NUEVOS: CacaoShipment
-- unitOfMeasure: unidad de venta
-- totalWeightKg: peso total en kg (convertido)
-- salePricePerKg: precio de venta por kg
-- ============================================
DO $$ BEGIN
    ALTER TABLE "CacaoShipment" ADD COLUMN "unitOfMeasure" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "CacaoShipment" ADD COLUMN "totalWeightKg" DOUBLE PRECISION;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "CacaoShipment" ADD COLUMN "salePricePerKg" DOUBLE PRECISION;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================
-- 5. CAMPOS NUEVOS: CacaoShipmentLot
-- unitOfMeasure: unidad en que se registró la cantidad
-- quantityKg: cantidad en kg (convertido)
-- ============================================
DO $$ BEGIN
    ALTER TABLE "CacaoShipmentLot" ADD COLUMN "unitOfMeasure" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "CacaoShipmentLot" ADD COLUMN "quantityKg" DOUBLE PRECISION;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================
-- 6. CAMPOS NUEVOS: CacaoKardex
-- referenceUnit: unidad original de la transacción
-- ============================================
DO $$ BEGIN
    ALTER TABLE "CacaoKardex" ADD COLUMN "referenceUnit" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================
-- 7. DATOS SEMILLA: Unidades de medida Mikacao (companyId: 2)
-- ============================================
INSERT INTO "CacaoUnitConfig" ("name", "displayName", "kgPerUnit", "isDefault", "companyId", "createdAt", "updatedAt")
VALUES
    ('SACO_MICHOACAN', 'Saco Michoacán (90 kg)', 90, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SACO_ESTANDAR', 'Saco Estándar (69 kg)', 69, false, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SACO_PERSONALIZADO', 'Saco Personalizado', 62, false, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- ============================================
-- 8. ACTUALIZAR RECEPCIONES EXISTENTES
-- Asignar unitOfMeasure = 'KG' a recepciones sin unidad
-- (los datos existentes fueron ingresados en kilogramos)
-- ============================================
UPDATE "CacaoReception" SET "unitOfMeasure" = 'KG' WHERE "unitOfMeasure" IS NULL;

-- ============================================
-- 9. ACTUALIZAR EMBARQUES EXISTENTES
-- Asignar valores por defecto a embarques existentes
-- ============================================
UPDATE "CacaoShipment"
SET "unitOfMeasure" = 'KG',
    "totalWeightKg" = "totalWeight",
    "salePricePerKg" = "salePrice"
WHERE "unitOfMeasure" IS NULL;

-- ============================================
-- 10. ACTUALIZAR LOTES DE EMBARQUE EXISTENTES
-- Asignar valores por defecto
-- ============================================
UPDATE "CacaoShipmentLot"
SET "unitOfMeasure" = 'KG',
    "quantityKg" = "quantity"
WHERE "unitOfMeasure" IS NULL;

-- ============================================
-- 11. ACTUALIZAR KARDEX EXISTENTE
-- Asignar referenceUnit = 'KG' a movimientos existentes
-- ============================================
UPDATE "CacaoKardex" SET "referenceUnit" = 'KG' WHERE "referenceUnit" IS NULL;

COMMIT;

-- ============================================
-- VERIFICACIÓN
-- ============================================
SELECT 'CacaoUnitConfig' AS tabla, COUNT(*) AS registros FROM "CacaoUnitConfig"
UNION ALL
SELECT 'CacaoReception (unitOfMeasure)', COUNT(*) FROM "CacaoReception" WHERE "unitOfMeasure" IS NOT NULL
UNION ALL
SELECT 'CacaoLot (differential)', COUNT(*) FROM "CacaoLot" WHERE "differential" IS NOT NULL
UNION ALL
SELECT 'CacaoShipment (unitOfMeasure)', COUNT(*) FROM "CacaoShipment" WHERE "unitOfMeasure" IS NOT NULL
UNION ALL
SELECT 'CacaoKardex (referenceUnit)', COUNT(*) FROM "CacaoKardex" WHERE "referenceUnit" IS NOT NULL;
