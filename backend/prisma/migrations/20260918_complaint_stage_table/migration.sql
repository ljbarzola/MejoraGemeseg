-- Fase 5: reemplaza el enum fijo ComplaintStatus por una tabla editable de
-- etapas (ComplaintStage), configurable por empresa desde la UI, sin perder
-- ninguna queja existente. Secuencia pensada para poder correr con la base
-- en uso (mismo criterio que 20260918_add_required_to_personal_field_definition):
-- 1) crear la tabla nueva (aditivo), 2) sembrar las 5 etapas actuales por
-- cada empresa ya existente (mismos nombres/colores/orden que hoy tiene
-- hardcodeado STAGE_COLOR en ComplaintsManagementPage.tsx), 3) migrar las
-- columnas de enum a texto (cast sin pérdida, cada valor de enum ya es
-- literalmente el mismo texto que se siembra como `key`), 4) recién ahí
-- agregar la FK compuesta contra ComplaintStage (para este punto todas las
-- filas existentes ya calzan). ComplaintStageChange.fromStatus/toStatus se
-- quedan como texto simple SIN FK: es historial, una etapa borrada en el
-- pasado debe poder seguir apareciendo ahí.

-- 1) Tabla nueva (no toca Complaint todavía)
CREATE TABLE IF NOT EXISTS "ComplaintStage" (
  "id"        SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
  "key"       TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "color"     TEXT NOT NULL DEFAULT '#718096',
  "order"     INTEGER NOT NULL DEFAULT 0,
  "isInitial" BOOLEAN NOT NULL DEFAULT false,
  "isFinal"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComplaintStage_companyId_key_key"
  ON "ComplaintStage"("companyId", "key");
CREATE INDEX IF NOT EXISTS "ComplaintStage_companyId_idx"
  ON "ComplaintStage"("companyId");

-- 2) Seed: las 5 etapas actuales, para cada empresa ya existente. ON CONFLICT
-- DO NOTHING hace este bloque re-ejecutable sin duplicar filas.
INSERT INTO "ComplaintStage" ("companyId", "key", "label", "color", "order", "isInitial", "isFinal")
SELECT c.id, s.key, s.label, s.color, s."order", s."isInitial", s."isFinal"
FROM "Company" c
CROSS JOIN (
  VALUES
    ('RECIBIDA',            'Recibida',            '#718096', 0, true,  false),
    ('EN_SENSIBILIZACION',  'En sensibilización',  '#975a16', 1, false, false),
    ('EN_COMUNICACION',     'En comunicación',     '#1d4ed8', 2, false, false),
    ('EN_SOLUCION',         'En solución',         '#6b46c1', 3, false, false),
    ('CERRADA',             'Cerrada',             '#276749', 4, false, true)
) AS s(key, label, color, "order", "isInitial", "isFinal")
ON CONFLICT ("companyId", "key") DO NOTHING;

-- 3) Cambia el tipo de columna de enum a texto (cast sin pérdida: cada valor
-- del enum es literalmente el mismo texto que se sembró como `key` arriba).
ALTER TABLE "Complaint" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Complaint" ALTER COLUMN "status" TYPE TEXT USING status::text;
ALTER TABLE "Complaint" ALTER COLUMN "status" SET DEFAULT 'RECIBIDA';

ALTER TABLE "ComplaintStageChange" ALTER COLUMN "fromStatus" TYPE TEXT USING "fromStatus"::text;
ALTER TABLE "ComplaintStageChange" ALTER COLUMN "toStatus" TYPE TEXT USING "toStatus"::text;

-- 4) FK compuesta Complaint(companyId, status) -> ComplaintStage(companyId, key).
-- Para este punto todas las filas existentes calzan porque el seed del paso 2
-- creó exactamente esas 5 keys por empresa.
ALTER TABLE "Complaint"
  ADD CONSTRAINT "Complaint_companyId_status_fkey"
  FOREIGN KEY ("companyId", "status") REFERENCES "ComplaintStage"("companyId", "key");

-- El enum ComplaintStatus queda huérfano (ya no lo referencia ninguna
-- columna) y se elimina al final.
DROP TYPE IF EXISTS "ComplaintStatus";
