-- Teléfono opcional de cada persona (lo usa el encabezado del PDF del Cotizador).
-- En producción la columna se crea sola al arrancar el servidor (PrismaService);
-- este archivo es solo la referencia del cambio.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
