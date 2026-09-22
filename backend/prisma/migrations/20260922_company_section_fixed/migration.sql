-- Módulos fijos por empresa (2026-09-22).
--
-- Permite que el administrador de cada empresa marque qué secciones ve TODO
-- el mundo, sin poder negarlas usuario por usuario. Es distinto de las fijas
-- por código (Inicio, Proyectos), que son una decisión de producto igual para
-- todas las empresas.
--
-- Aditiva y sin pérdida de datos: por defecto ninguna sección queda fija, así
-- que los permisos actuales siguen funcionando exactamente igual.
ALTER TABLE "CompanySection"
  ADD COLUMN IF NOT EXISTS "fixedForAll" BOOLEAN NOT NULL DEFAULT false;
