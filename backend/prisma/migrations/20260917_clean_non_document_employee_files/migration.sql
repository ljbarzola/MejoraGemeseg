-- Limpieza única de datos: archivos internos del propio sistema (ficha
-- personal, trazas de Reclutamiento/IA) que quedaron guardados como
-- EmployeeDocument por un bug de sync (sin exclusión en Personal
-- Administrativo, y solo Datos_Personales.json excluido en Guardias) —
-- aparecían como "documento no identificado" en el checklist de cumplimiento.
-- El sync solo hace upsert, nunca borra, así que las filas ya creadas no se
-- limpian solas al corregir el código — ver
-- backend/src/modules/personal/constants/employee-document-exclusions.ts.
--
-- Puramente de datos derivados del sync de Drive (no hay contenido propio del
-- usuario ni FKs entrantes que dependan de estas filas) — seguro de aplicar
-- con la base en uso.
DELETE FROM "EmployeeDocument"
WHERE "fileName" IN (
  'Datos_Personales.json',
  'candidato.json',
  'analisis-ia.json',
  'analisis-ia-pendiente.json'
);
