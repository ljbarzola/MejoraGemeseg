# Modulo: Users

## Descripcion
Gestion de usuarios del sistema con permisos por seccion.

## Endpoints
- `POST /users` - Crear usuario (solo ADMIN)
- `GET /users` - Listar usuarios (cualquier autenticado)
- `GET /users/me` - Perfil del usuario (con herramientas asignadas)
- `GET /users/stats` - Estadisticas (solo ADMIN)
- `GET /users/:id` - Detalle de usuario (solo ADMIN)
- `PATCH /users/:id` - Actualizar usuario (solo ADMIN)
- `DELETE /users/:id` - Soft delete (solo ADMIN)

## Permisos
- `CompanySection`: controla que secciones puede ver cada empresa
- `UserPermission`: controla canView/canWrite por usuario y seccion
- Super Admin ve todo sin restricciones
- Company Admin gestiona permisos de sus usuarios

## Convenciones
- Contraseña al crear usuario: el admin define la contraseña (no hay default)
- El password se hashea antes de guardar
- Nunca retornar el password hasheado en responses
