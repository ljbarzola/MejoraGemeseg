-- 2026-10-02: Contratacion Publica - historial de cada documento entregado
-- (entrego, rechazo con motivo, volvio a entregar, aprobo).
--
-- Aditiva y sin perdida de datos: crea 1 tabla nueva con su indice y su FK.
-- Idempotente (IF NOT EXISTS / DO $$), se puede correr mas de una vez y con la
-- base en uso. El codigo viejo no la conoce, asi que aplicarla ANTES de
-- desplegar no rompe nada. Los documentos que ya estaban entregados antes de
-- esta fecha no tienen historial (empieza desde el siguiente movimiento).

CREATE TABLE IF NOT EXISTS "CPEntregaHistorial" (
    "id" SERIAL NOT NULL,
    "entregaId" INTEGER NOT NULL,
    "accion" TEXT NOT NULL,
    "motivo" TEXT,
    "origen" TEXT,
    "usuarioId" INTEGER,
    "usuarioNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CPEntregaHistorial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CPEntregaHistorial_entregaId_idx" ON "CPEntregaHistorial"("entregaId");

DO $$ BEGIN
  ALTER TABLE "CPEntregaHistorial" ADD CONSTRAINT "CPEntregaHistorial_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "CPEntregaDocumento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
