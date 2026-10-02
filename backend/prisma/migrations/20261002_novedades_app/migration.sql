-- 2026-10-02: Sistemas -> Novedades de la app (aviso manual de cambios, se
-- entrega por la campana de notificaciones a quienes tienen acceso a los
-- modulos afectados).
--
-- Aditiva y sin perdida de datos: crea 1 tabla nueva con su indice. Idempotente
-- (IF NOT EXISTS), se puede correr mas de una vez y con la base en uso. El
-- codigo viejo no conoce la tabla, asi que aplicarla ANTES de desplegar no
-- rompe nada.

CREATE TABLE IF NOT EXISTS "NovedadApp" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "secciones" TEXT[],
    "createdById" INTEGER NOT NULL,
    "createdByNombre" TEXT NOT NULL,
    "destinatarios" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NovedadApp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NovedadApp_createdAt_idx" ON "NovedadApp"("createdAt");
