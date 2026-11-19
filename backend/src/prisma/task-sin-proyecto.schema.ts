// Tareas «Sin proyecto» (2026-11-18). El despliegue no corre migraciones y Prisma pide
// todas las columnas de Task en cada consulta, así que esto se asegura al arrancar,
// antes de cualquier otro módulo. Es aditivo: `projectId` pasa a aceptar nulos y
// `createdById` (quién creó la tarea, para saber quién ve una tarea sin proyecto) es
// una columna nueva y opcional. Las tareas existentes no cambian.
export const TASK_SIN_PROYECTO_DDL = [
  'ALTER TABLE "Task" ALTER COLUMN "projectId" DROP NOT NULL',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "createdById" INTEGER',
];
