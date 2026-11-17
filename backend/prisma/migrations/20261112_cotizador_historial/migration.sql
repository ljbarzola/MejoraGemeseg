-- Solo de referencia (el deploy no corre migraciones): la tabla se crea al arrancar
-- desde src/modules/ventas/cotizador.schema.ts (COTIZADOR_DDL). Historial de cambios
-- del catálogo del Cotizador, 2026-11-12.
CREATE TABLE IF NOT EXISTS "CotCambio" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "entidad" TEXT NOT NULL,
  "entidadId" INTEGER NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL DEFAULT '',
  "accion" TEXT NOT NULL,
  "campo" TEXT NOT NULL DEFAULT '',
  "valorAntes" TEXT,
  "valorDespues" TEXT,
  "userId" INTEGER,
  "userNombre" TEXT NOT NULL DEFAULT '',
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CotCambio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CotCambio_companyId_creadoEn_idx" ON "CotCambio"("companyId", "creadoEn");
CREATE INDEX IF NOT EXISTS "CotCambio_companyId_codigo_idx" ON "CotCambio"("companyId", "codigo");
ALTER TABLE "CotCambio" ADD CONSTRAINT "CotCambio_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CotCambio" ADD CONSTRAINT "CotCambio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
