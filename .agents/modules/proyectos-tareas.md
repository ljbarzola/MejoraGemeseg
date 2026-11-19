# Módulo: Proyectos y Tareas

Endpoints y reglas de `/projects` y `/tasks`: membresía, tareas como ventana, tareas sin proyecto, avisos y recordatorios de vencimiento.

## Projects (`/projects`)
- `POST /projects`: cualquier autenticado; el creador queda como OWNER.
- `GET /projects`: filtrado por membresía, paginado. `pageSize` opcional (1-50, por defecto 10); la pantalla Proyectos pide 12.
- `GET /projects/admin/stats` (solo ADMIN). `GET /projects/:id`.
- `GET|POST /projects/:id/tasks`: tareas del proyecto / crear tarea.
- `GET /projects/:id/members`; `POST` agregar y `DELETE /:userId` quitar (OWNER/ADMIN); `PATCH /:userId/role` (solo ADMIN).

## Tasks (`/tasks`)
- `GET /tasks/my-tasks` («Mis tareas» de Inicio; filtros `status`, `assignedToMe`, `projectId`): solo trae tareas de proyectos donde la persona es **miembro** (`ProjectMember`) o sin proyecto asignadas a ella. La tabla del proyecto (`GET /projects/:id/tasks`) no mira membresía.
- `GET|PATCH|DELETE /tasks/:id`.
- `POST /tasks` (con `projectId` opcional); `POST /projects/:id/tasks` sigue igual.

### Tarea como ventana y estado desde la lista
- La tarea no tiene página propia: se abre como ventana (`components/tasks/TaskDetailModal.tsx`) sobre Inicio, el proyecto o el Kanban; «+ Nueva tarea» es `CreateTaskModal`. `CreateTaskPage` no se usa (candidata a borrarse).
- El estado de cada fila (Mis tareas y tabla del proyecto) es `TaskStatusMenu`: `PATCH /tasks/:id` inmediato; se pinta al instante y, si el servidor lo rechaza (p. ej. observador del proyecto), vuelve al estado anterior y avisa. `CANCELLED` es solo una etiqueta.
- **La ruta `/tasks/:id` se conserva** (hay enlaces guardados en notificaciones y correos): `TaskDetailPage` busca el proyecto y redirige a `/projects/:id?tarea=<id>`; la tarea abierta vive en esa URL.

### Inicio: filtros y tabla
- Estado, «Asignadas a mí» y proyecto se recuerdan en `localStorage` (`dashboard_*`). El desplegable carga TODAS las páginas de `GET /projects`; un proyecto recordado que ya no existe se descarta antes de pedir las tareas; «Todos» se guarda como `''` y se lee con `??`. Sin escoba de limpiar en Inicio (decisión: los filtros son botones siempre visibles).
- Inicio y la tabla del proyecto usan `useSortableTable` + `useResizableColumns` + «Columnas» (`mis-tareas`, `proyecto-tareas`). Inicio: por defecto Estado, Prioridad, Proyecto, Asignados y Fin; «Inicio» y «Horas est.» opcionales; anchos fijos (`.dashboard-tasks-table`). La fecha fin de una tarea abierta sale roja si venció y naranja si vence hoy o mañana (`fecha-vencida`/`fecha-pronto`). `STATUS_ORDER`/`PRIORITY_ORDER` en `frontend/src/types/task.ts`. `.status-badge` con `white-space: nowrap`.

### Tareas «Sin proyecto»
- `Task.projectId` acepta nulo y existe `Task.createdById` (creados al arrancar por `src/prisma/task-sin-proyecto.schema.ts`, aditivo). **No hacer rollback a un deploy anterior** tras crear tareas sin proyecto: no sabría leerlas.
- Inicio → «+ Nueva tarea» ofrece «Sin proyecto (tarea puntual)» (opción de partida), los proyectos (todos, paginados con `getAllProjects`) y «+ Crear proyecto nuevo» (solo el nombre es obligatorio; se crea junto con la tarea y los asignados pasan a ser miembros).
- Una tarea sin proyecto la ven y gestionan quien la creó, sus asignados y un ADMIN de la misma empresa; se asigna a personas activas de la empresa (`GET /users?isActive=true`); se filtra con `?projectId=none`; `/tasks/:id` redirige a `/?tarea=ID`.
- **Fechas:** la fecha fin no puede ir antes que la de inicio (`utils/fechasTarea.ts`; el servidor también lo rechaza).
- **Borrador:** el formulario «Tarea nueva» guarda lo escrito en `sessionStorage` (`utils/borradorTarea.ts`, por usuario y pestaña); Inicio lo reabre al volver del Perfil; se borra al crear, con «Cancelar» o «Descartar borrador»; la ✕ lo conserva.

### Avisos de tareas
- `TasksService` avisa en la app (`NotificationsService`, nunca a quien hizo el cambio) al asignar, cambiar estado, editar, quitar de la tarea y eliminarla.
- **Correo opt-in por tipo** (asignaciones y cambios de tareas, recordatorios de vencimiento, Contratación Pública): cada persona elige en Perfil → «Avisos: app o correo» (`UserPreference` `notificaciones:<tipo>`, valor `correo` / `solo-notificaciones`; regla única en `common/utils/avisos-correo.util.ts`; ver `users.md` punto 3). Por defecto solo la app. El cambio de contraseña siempre va por correo; las encuestas de RR.HH. se deciden por encuesta.

### Recordatorios de vencimiento
- Cada tarea con `endDate` crea por defecto un `TaskReminder` a 1 día antes (`daysBefore`: positivo = antes, 0 = mismo día, negativo = aviso único de atraso); se eligen en `ReminderPicker`. Tabla `TaskReminder` creada al arrancar (`task-reminder.schema.ts`).
- `POST /tasks/reminders-cron/run` (header `x-cron-secret` = `CRON_SECRET`; sin la variable responde 404; `?dryRun=true` solo lista y muestra `correo: true/false` por persona). Envía a cada asignado UNA notificación en la campana y, si su preferencia lo permite, UN correo al día con todas sus tareas (texto plano, desde `sistemas@gemeseg.com`, asunto con prefijo fijo `[Tareas GEMESEG]` para que filtren en Gmail: no cambiarlo sin avisar). Ignora `DONE`/`CANCELLED` y reintenta si el envío falló. Si la lectura de preferencias falla, envía correo igual.
- **Programación:** Cloud Run con `min-instances=0` no sirve para `@Cron`; lo llama **Cloud Scheduler** una vez al día (~9:00 `America/Guayaquil`, trabajo `tareas-recordatorios-diarios`, `POST …/api/tasks/reminders-cron/run` con `x-cron-secret`). `CRON_SECRET` está en Secret Manager y en `--set-secrets` de `cloudbuild.yaml`.
- **Seguridad al operar el Scheduler:** al crear o actualizar un trabajo NO mostrar la salida de `gcloud` (trae el encabezado en claro). Pasar siempre `--project=mejora-gemeseg` (el `gcloud` local apunta por defecto a otro proyecto). Pausar/reanudar: `gcloud scheduler jobs pause|resume tareas-recordatorios-diarios --project=mejora-gemeseg --location=us-central1`. El mismo secreto activa el endpoint de Contratación Pública, que tiene su propio trabajo aparte.
- Pruebas locales con correo real solo a la cuenta de prueba designada.
