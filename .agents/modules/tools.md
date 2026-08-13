# Modulo: Tools

## Descripcion
Catalogo de herramientas de software y asignacion a usuarios.

## Endpoints
- `GET /tools` - Listar catalogo
- `POST /tools` - Crear herramienta (solo ADMIN)
- `DELETE /tools/:id` - Eliminar herramienta
- `GET /tools/assignments` - Listar asignaciones
- `GET /tools/users` - Usuarios con sus herramientas
- `POST /tools/assign` - Asignar herramienta
- `PATCH /tools/assign/:id` - Actualizar asignacion
- `DELETE /tools/assign/:id` - Eliminar asignacion
- `GET /tools/assign/:id/audit` - Historial de auditoria

## Reglas
- Solo ADMIN puede gestionar herramientas y asignaciones
- Asignaciones multiples de usuarios soportadas
- Auditoria de cada accion (quien asigno/removio, cuando)
- RolesGuard protege todos los endpoints
