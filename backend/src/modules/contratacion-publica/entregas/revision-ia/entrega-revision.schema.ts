/**
 * Tabla de lo que dijo el Agente Revisor de Entregas de cada documento entregado.
 * El despliegue no corre migraciones: EntregaRevisorService lo ejecuta al arrancar. Es el MISMO
 * SQL de prisma/migrations/20261109_cp_entrega_revision_ia/migration.sql. Tabla nueva:
 * nada previo la lee, y se borra sola con el documento (ON DELETE CASCADE).
 */
export const CP_ENTREGA_REVISION_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "CPEntregaRevisionIA" (
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
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CPEntregaRevisionIA_entregaId_key" ON "CPEntregaRevisionIA"("entregaId")`,
  `CREATE INDEX IF NOT EXISTS "CPEntregaRevisionIA_companyId_idx" ON "CPEntregaRevisionIA"("companyId")`,
];
