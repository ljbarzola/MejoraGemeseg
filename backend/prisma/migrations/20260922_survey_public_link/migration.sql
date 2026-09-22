-- Encuestas con enlace público (2026-09-22).
--
-- Hasta ahora una encuesta solo podía llegar a usuarios con cuenta en la app.
-- Con esto, RRHH puede además generar un enlace tipo formulario que cualquiera
-- responde sin login (proveedores, clientes, postulantes). Si se quiere saber
-- quién respondió, se agrega como una pregunta más de la encuesta.
--
-- Aditiva y sin pérdida de datos: se puede aplicar con la base en uso.
ALTER TABLE "Survey"
  ADD COLUMN IF NOT EXISTS "publicToken" TEXT,
  ADD COLUMN IF NOT EXISTS "publicEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "Survey_publicToken_key" ON "Survey"("publicToken");

-- respondentId pasa a ser opcional: null = respuesta llegada por el enlace
-- público. El UNIQUE (surveyId, respondentId) sigue existiendo y en Postgres
-- no bloquea filas con NULL, así que varias respuestas públicas conviven,
-- mientras un usuario con cuenta sigue respondiendo una sola vez.
ALTER TABLE "SurveyResponse" ALTER COLUMN "respondentId" DROP NOT NULL;
