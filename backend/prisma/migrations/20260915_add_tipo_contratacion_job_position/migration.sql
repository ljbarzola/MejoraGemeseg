-- Destino de contratación de una vacante: a qué sección entra el postulante
-- cuando RRHH lo marca como contratado (ver DriveService.contratarCandidato).
--
--   GUARDIA        -> carpeta raíz de Guardias (FolderConfig 'CUMPLIMIENTO'),
--                     bucket "Sin Asignar".
--   ADMINISTRATIVO -> carpeta raíz de Personal Administrativo (FolderConfig
--                     'PERSONAL_ADMIN'), renombrando la carpeta a
--                     "Nombre - Puesto" (ese bucket no guarda la cédula).
--
-- El DEFAULT 'GUARDIA' es deliberado: preserva el comportamiento que tenía
-- contratar antes de que existiera esta columna, cuando siempre creaba un
-- guardia. Las vacantes ya existentes no cambian de conducta al aplicar esto.
--
-- Aditiva y sin pérdida de datos: se puede aplicar con la base en uso.
ALTER TABLE "JobPosition"
  ADD COLUMN IF NOT EXISTS "tipoContratacion" TEXT NOT NULL DEFAULT 'GUARDIA';
