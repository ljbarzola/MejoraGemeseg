-- 2026-10-02: cada entidad publica de Contratacion Publica queda enlazada a su
-- subcarpeta de Google Drive (dentro de la carpeta raiz unica de CP).
--
-- Aditiva y sin perdida de datos: agrega 1 columna opcional. Idempotente
-- (IF NOT EXISTS), se puede correr mas de una vez y con la base en uso. El
-- codigo viejo no conoce la columna, asi que aplicarla ANTES de desplegar no
-- rompe nada.

ALTER TABLE "CPEntidadPublica" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;
