-- Lo que dijo el Agente Revisor de Entregas de cada documento entregado (Contratación Pública → Por aprobar).
-- Aditiva e idempotente. Solo referencia: el servidor la crea al arrancar (entrega-revision.schema.ts).
CREATE TABLE IF NOT EXISTS "CPEntregaRevisionIA" (
  "id" SERIAL NOT NULL,
  "entregaId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "estado" TEXT NOT NULL,
  "entregadoAt" TIMESTAMP(3),
  "tipoDocumento" TEXT,
  "resumen" TEXT,
  "motivos" JSONB,
  "mensajeRechazo" TEXT,
  "mensaje" TEXT,
  "modelo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CPEntregaRevisionIA_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPEntregaRevisionIA_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "CPEntregaDocumento"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CPEntregaRevisionIA_entregaId_key" ON "CPEntregaRevisionIA"("entregaId");
CREATE INDEX IF NOT EXISTS "CPEntregaRevisionIA_companyId_idx" ON "CPEntregaRevisionIA"("companyId");
