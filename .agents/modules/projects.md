# Modulo: Projects

## Descripcion
Gestion de proyectos con tablero Kanban y tareas.

## Endpoints
- `POST /projects` - Crear proyecto + admin auto-OWNER
- `GET /projects` - Listar proyectos (filtrado por membresia)
- `GET /projects/admin/stats` - Estadisticas admin
- `GET /projects/:id` - Detalle de proyecto
- `GET /projects/:id/tasks` - Tareas de un proyecto
- `POST /projects/:id/tasks` - Crear tarea
- `GET /projects/:id/members` - Miembros del proyecto
- `POST /projects/:id/members` - Agregar miembro (OWNER/ADMIN)
- `DELETE /projects/:id/members/:userId` - Quitar miembro
- `PATCH /projects/:id/members/:userId/role` - Cambiar rol

## Reglas
- Cualquier usuario autenticado puede crear proyectos
- OWNER y MEMBER pueden editar el proyecto
- Solo OWNER o ADMIN pueden eliminar proyectos
- Admin es OWNER automatico de todos los proyectos de su empresa
- OWNER no puede quitar al ultimo OWNER ni eliminarse a si mismo

## Tasks
- `GET /tasks/:id` - Detalle de tarea
- `PATCH /tasks/:id` - Actualizar tarea
- `DELETE /tasks/:id` - Eliminar tarea
- Estados: TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELLED
- Prioridades: LOW, MEDIUM, HIGH, URGENT
