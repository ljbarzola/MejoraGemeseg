/**
 * Crea la tabla "TaskReminder" si no existe (recordatorios por tarea).
 *
 * Mismo motivo y mismo patrón que users/user-preference.schema.ts: el despliegue
 * no corre migraciones, así que la tabla se asegura sola al arrancar. Cada
 * sentencia es idempotente y va en una llamada aparte (el adaptador de Prisma no
 * garantiza varias sentencias en una sola consulta).
 */
export const TASK_REMINDER_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "TaskReminder" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "TaskReminder_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TaskReminder_taskId_daysBefore_key" ON "TaskReminder"("taskId", "daysBefore")`,
  `DO $$ BEGIN
    ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
];
