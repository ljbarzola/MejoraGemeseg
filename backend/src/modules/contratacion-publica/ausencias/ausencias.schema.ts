/**
 * Tabla de las faltas de guardias registradas al momento («No llegó», desde Hoy en los puestos).
 * Mismo mecanismo que bitacoras.schema.ts: el despliegue no corre migraciones, así que
 * CPAusenciasModule lo ejecuta al arrancar. Es el MISMO SQL de
 * prisma/migrations/20261106_cp_ausencias/migration.sql. Tabla nueva: nada previo la lee.
 */
export const CP_AUSENCIAS_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "CPAusencia" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "puestoId" INTEGER NOT NULL,
    "puestoNombre" TEXT NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "contratoNumero" TEXT NOT NULL,
    "entidadNombre" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "cedula" TEXT NOT NULL,
    "guardiaNombre" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "hora" TEXT,
    "nota" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'POR_CUBRIR',
    "reemplazoCedula" TEXT,
    "reemplazoNombre" TEXT,
    "anulacionNota" TEXT,
    "registradaPorId" INTEGER NOT NULL,
    "registradaPorNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CPAusencia_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CPAusencia_companyId_fecha_idx" ON "CPAusencia"("companyId", "fecha")`,
  `CREATE INDEX IF NOT EXISTS "CPAusencia_puestoId_fecha_idx" ON "CPAusencia"("puestoId", "fecha")`,
];
