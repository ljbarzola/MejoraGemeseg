# Modulo: Users

## Descripcion
Gestion de usuarios del sistema con permisos por seccion.

## Endpoints
- `POST /users` - Crear usuario (solo ADMIN)
- `GET /users` - Listar usuarios (cualquier autenticado)
- `GET /users/me` - Perfil del usuario (con herramientas asignadas)
- `GET /users/stats` - Estadisticas (solo ADMIN)
- `GET /users/locations` - Catálogo de ubicaciones de la empresa (solo ADMIN, ver punto 2)
- `POST /users/locations` - Crear ubicación (solo ADMIN, ver punto 2)
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

## 1. Bug de permisos al crear usuario: filas `UserPermission` explícitas, no implícitas (2026-09-29)

**El bug:** `section-permission.guard.ts` (backend) y `usePermissions.ts` (frontend) tratan "no existe fila `UserPermission` para esa sección" como **"permitido"** — un default permisivo deliberado y documentado (ver `AGENTS.md`, "Permisos por seccion", punto 4 de `SectionPermissionGuard`), pensado para no dejar fuera a usuarios antiguos sin permisos cargados. El problema es que `UsersService.create()` nunca creaba ninguna fila para un usuario nuevo, así que ese usuario heredaba el default permisivo — acceso total a todo módulo habilitado para su empresa — mientras `/admin/user-permissions` lo mostraba con **todo sin marcar**, dando la impresión contraria (que estaba bloqueado).

**El fix (`UsersService.create()`, dentro de la misma transacción que crea el usuario):** para cada sección de `ALL_SECTIONS` que **no** sea `SECCIONES_SIEMPRE_VISIBLES` (Inicio/Proyectos) ni esté marcada `fixedForAll` para esa empresa (`CompanySection.fixedForAll`, ver `AGENTS.md`), se crea una fila `UserPermission` explícita:
- **EMPLOYEE/MANAGER**: `canView: false, canWrite: false` — arrancan denegados en todo lo que no sea fijo, coherente con lo que `/admin/user-permissions` va a mostrar.
- **ADMIN**: `canView: true, canWrite: true` — arranca con acceso explícito completo (antes quedaba sin filas, que en la práctica es el mismo resultado de acceso, pero ahora además se ve reflejado correctamente en esa pantalla en vez de aparecer "sin nada marcado").

Un super admin (`companyId: null`) no pasa por esto — no tiene filas `UserPermission` porque no las necesita (bypasea todo).

**Backfill para usuarios ya existentes** (`backend/prisma/backfill-user-permissions.js`, `npm run backfill:permissions` desde `backend/`): aplica la misma regla a cualquier usuario de empresa con **cero** filas `UserPermission` — Employee/Manager quedan denegados por defecto, Admin recibe las filas explícitas de acceso completo. Dry-run por defecto (reporta cuántos usuarios y una muestra de hasta 20, sin escribir nada); `--apply` ejecuta de verdad. Es JS plano (no pasa por `ts-node`), así que mantiene su propia copia de `ALL_SECTION_KEYS`/`SECCIONES_SIEMPRE_VISIBLES` — si se agrega o quita una sección en `permissions.service.ts`, actualizar también este script.

**Verificado end-to-end en local con llamadas HTTP reales:** un usuario EMPLOYEE recién creado recibió filas de denegación explícitas y quedó efectivamente bloqueado al intentar una intención de chat de un módulo restringido (ver `.agents/modules/agents-ai.md`, punto 1).

## 2. Ubicación por usuario + catálogo `CompanyLocation` (2026-09-29)

Nueva columna "Ubicación" en Administración → Gestionar usuarios (`AdminDashboardPage.tsx`), ordenable y filtrable — mismo patrón de tabla que `ContratosList.tsx` (`useResizableColumns('admin-users')` + `useSortableTable` + `ClearFiltersButton` + `RowActionsMenu`).

- **`CompanyLocation`** (nuevo modelo): catálogo por empresa (`id`, `companyId`, `nombre`, `createdAt`, `@@unique([companyId, nombre])`) — mismo patrón que `PersonalFieldDefinition`/`JobPosition` (catálogo simple, sin enum). `User.locationId` es una FK nullable con `onDelete: SetNull` — borrar una ubicación no borra ni bloquea a los usuarios que la tenían, solo la deja vacía.
- **Alta desde el propio formulario de edición**: el modal "Editar usuario" tiene un select de ubicaciones de la empresa más una opción "+ Agregar nueva ubicación..." que abre un campo inline, crea la ubicación (`POST /users/locations`) y la deja auto-seleccionada — no hace falta salir a una pantalla de catálogo aparte.
- **Duplicados**: `POST /users/locations` compara sin distinguir mayúsculas/minúsculas y responde 409 con un mensaje entendible en vez de un error crudo de Prisma.
- **Aislamiento entre empresas**: `PATCH /users/:id` con un `locationId` verifica en el servidor que esa ubicación pertenezca a la misma empresa del usuario que se está editando antes de guardar (`ForbiddenException` si no) — nunca confía en el `locationId` que manda el cliente a ciegas.
