-- Elimina por completo el submódulo de Bitácoras de RRHH (2026-09-22).
--
-- El área lo descartó el 2026-09-10 ("no sirve más") y desde entonces no
-- tenía ningún enlace en la aplicación: quedaba la ruta /rrhh/logs, el
-- componente, el servicio y los endpoints, todo inalcanzable. Se retiró todo
-- el código junto con esta migración.
--
-- DESTRUCTIVA: borra las bitácoras y sus plantillas. Confirmado
-- explícitamente por el usuario ("borra todo lo de bitacoras").
-- LogEntry va primero porque tiene la FK hacia LogTemplate.
DROP TABLE IF EXISTS "LogEntry";
DROP TABLE IF EXISTS "LogTemplate";
DROP TYPE IF EXISTS "LogType";
