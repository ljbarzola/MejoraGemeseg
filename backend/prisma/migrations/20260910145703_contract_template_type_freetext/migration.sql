-- AlterTable
-- Convierte el enum ContractType a texto libre sin perder los valores ya
-- guardados (el generador de migraciones no puede castear automáticamente
-- un enum a texto en una columna NOT NULL con datos, así que se hace a mano).
ALTER TABLE "ContractTemplate" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;

-- DropEnum
DROP TYPE "ContractType";
