/**
 * Tablas del cronograma de supervisión (2026-11-10). El despliegue no corre migraciones: SupervisionModule
 * ejecuta este SQL al arrancar (mismo mecanismo que ausencias.schema.ts). Son tablas nuevas que solo lee
 * este código. Mismo SQL que prisma/migrations/20261110_cp_supervision/migration.sql (solo referencia).
 *
 * - Cronograma: un rango de fechas de un contrato (como un horario) con sus puntos de servicio.
 * - Punto: un puesto del contrato con su supervisor asignado, su jornada y los días en que se planea visitar.
 * - Visita: lo que el supervisor registró (independiente del cronograma: se cruza por puesto y día).
 */
export const CP_SUPERVISION_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "CPSupervisionCronograma" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "fechaInicio" DATE NOT NULL,
    "fechaFin" DATE NOT NULL,
    "creadoPorId" INTEGER NOT NULL,
    "creadoPorNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CPSupervisionCronograma_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CPSupervisionCronograma_companyId_contratoId_idx" ON "CPSupervisionCronograma"("companyId", "contratoId")`,
  `CREATE TABLE IF NOT EXISTS "CPSupervisionPunto" (
    "id" SERIAL NOT NULL,
    "cronogramaId" INTEGER NOT NULL,
    "puestoId" INTEGER NOT NULL,
    "puestoNombre" TEXT NOT NULL,
    "supervisorUserId" INTEGER,
    "supervisorNombre" TEXT,
    "jornada" TEXT NOT NULL DEFAULT 'DIURNA/NOCTURNA',
    "orden" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CPSupervisionPunto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CPSupervisionPunto_cronogramaId_fkey" FOREIGN KEY ("cronogramaId")
      REFERENCES "CPSupervisionCronograma"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CPSupervisionPunto_cronogramaId_puestoId_key" ON "CPSupervisionPunto"("cronogramaId", "puestoId")`,
  `CREATE INDEX IF NOT EXISTS "CPSupervisionPunto_supervisorUserId_idx" ON "CPSupervisionPunto"("supervisorUserId")`,
  `CREATE TABLE IF NOT EXISTS "CPSupervisionPlanDia" (
    "puntoId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    CONSTRAINT "CPSupervisionPlanDia_pkey" PRIMARY KEY ("puntoId", "fecha"),
    CONSTRAINT "CPSupervisionPlanDia_puntoId_fkey" FOREIGN KEY ("puntoId")
      REFERENCES "CPSupervisionPunto"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "CPSupervisionVisita" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "puestoId" INTEGER NOT NULL,
    "puestoNombre" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "hora" TEXT NOT NULL,
    "supervisorUserId" INTEGER NOT NULL,
    "supervisorNombre" TEXT NOT NULL,
    "guardiaPresente" TEXT NOT NULL,
    "observacion" TEXT,
    "fotoKey" TEXT,
    "fotoNombre" TEXT,
    "fotoTipo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CPSupervisionVisita_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CPSupervisionVisita_companyId_puestoId_fecha_idx" ON "CPSupervisionVisita"("companyId", "puestoId", "fecha")`,
  `CREATE INDEX IF NOT EXISTS "CPSupervisionVisita_supervisorUserId_fecha_idx" ON "CPSupervisionVisita"("supervisorUserId", "fecha")`,
];
