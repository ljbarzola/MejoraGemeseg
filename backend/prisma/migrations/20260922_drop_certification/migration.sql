-- Elimina por completo el módulo de Certificaciones (2026-09-22).
--
-- RRHH nunca lo usó: no había pantalla propia en el frontend, el KPI del
-- dashboard de Personal no se mostraba en ninguna parte y las alertas reales
-- son las de Capacitaciones (Training). Se retiró todo el código
-- (CertificationService, DTOs, endpoints /personal/certifications, wrappers
-- del frontend y referencias en fusión de cédulas) junto con esta migración.
--
-- DESTRUCTIVA: borra los datos existentes de Certification y sus alertas.
-- Confirmado explícitamente por el usuario. CertificationAlert va primero
-- porque tiene la FK hacia Certification.
DROP TABLE IF EXISTS "CertificationAlert";
DROP TABLE IF EXISTS "Certification";
