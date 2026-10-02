-- 2026-10-02: preferencias personales de interfaz por usuario (ej. columnas
-- visibles de la tabla de Clientes de Ventas).
--
-- Aditiva y sin perdida de datos: crea 1 tabla nueva con su indice unico y su
-- FK. Idempotente (IF NOT EXISTS / DO $$), se puede correr mas de una vez y con
-- la base en uso. El codigo viejo no conoce la tabla, asi que aplicarla ANTES
-- de desplegar no rompe nada.

CREATE TABLE IF NOT EXISTS "UserPreference" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPreference_userId_key_key" ON "UserPreference"("userId", "key");

DO $$ BEGIN
    ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
