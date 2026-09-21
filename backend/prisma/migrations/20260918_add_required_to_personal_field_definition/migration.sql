-- "Campos requeridos" (paralelo a "documentos requeridos" de DocumentType):
-- marca un PersonalFieldDefinition como requerido para que la Ficha Personal
-- (GuardiaFichaModal / AdministrativoDetalleModal) muestre un asterisco rojo
-- junto al label y una insignia "N campos requeridos sin completar".
--
-- Puramente informativo en el frontend: NUNCA bloquea guardar la ficha, y NO
-- se mezcla con compliancePercent (esa métrica mide documentos, esta mide
-- campos propios, ver ComplianceChecklist.tsx / AdministrativoDetalleModal.tsx).
--
-- Aditiva y sin pérdida de datos: se puede aplicar con la base en uso.
ALTER TABLE "PersonalFieldDefinition"
  ADD COLUMN IF NOT EXISTS "required" BOOLEAN NOT NULL DEFAULT false;
