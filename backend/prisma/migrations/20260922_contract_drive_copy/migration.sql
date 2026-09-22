-- Copia en Google Drive de los documentos generados desde RRHH > Documentación
-- (2026-09-22). El disco del servidor en Cloud Run es efímero, así que el PDF
-- entregado solo sobrevive si queda en Drive. Al pedirlo se sirve desde ahí;
-- regenerarlo es el último recurso, porque si la plantilla cambió después,
-- regenerar produciría un documento DISTINTO al que se entregó y firmó.
--
-- Carpeta fija en código (RRHH_DOCUMENTOS en hardcoded-drive-folders.ts).
-- No confundir con los contratos de VENTAS, que es otro subsistema.
--
-- Aditiva y sin pérdida de datos: los contratos ya generados quedan con estas
-- columnas en NULL y se siguen sirviendo desde disco o regenerando, como hasta ahora.
ALTER TABLE "Contract"
  ADD COLUMN IF NOT EXISTS "driveFileId" TEXT,
  ADD COLUMN IF NOT EXISTS "driveUrl" TEXT;
