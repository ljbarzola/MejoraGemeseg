# Modulo: Users

## Descripcion
Gestion de usuarios del sistema con permisos por seccion.

## Endpoints
- `POST /users` - Crear usuario (solo ADMIN)
- `GET /users` - Listar usuarios (cualquier autenticado)
- `GET /users/me` - Perfil del usuario (con herramientas asignadas y `hasPassword`; el hash nunca sale)
- `POST /auth/change-password` - Cambiar la propia contraseña desde el perfil (vive en `auth`; ver "Cambiar contraseña" abajo)
- `GET /users/me/preferences/:key` / `PUT /users/me/preferences/:key` - Preferencia personal del usuario autenticado (ver punto 3)
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

## 3. Preferencias personales por usuario: `UserPreference` (2026-10-02)

Nació para las columnas de la tabla de Clientes de Ventas (`useColumnPreferences` + `ColumnPickerMenu`), que antes vivían solo en `localStorage` y no seguían a la persona a otro navegador o computador. **Decisión explícita del usuario:** guardarlas en la cuenta.

- **`UserPreference`** (nuevo modelo): `userId` (cascade), `key`, `value Json`, `@@unique([userId, key])`. Genérico, para otras preferencias de interfaz a futuro. Migración `20261002_user_preferences` (aditiva, idempotente).
- **Endpoints** `GET|PUT /users/me/preferences/:key`: usan siempre `req.user.userId`; no hay forma de leer o escribir las de otro. Sin sección de permiso (dato personal). Declarados antes de `:id`. El servicio solo acepta claves `columnas:[a-z0-9-]+` y el DTO valida un arreglo de máx. 50 strings de máx. 64 caracteres — si se agrega otro tipo de preferencia, ampliar `PREFERENCE_KEY_PATTERN` y el DTO, no abrirlo a cualquier JSON.
- **Frontend**: el hook arranca con el caché local, adopta el valor del servidor al llegar (salvo que la persona ya haya aplicado un cambio) y `set()` guarda en ambos; si el servidor falla, el cambio queda en el navegador y se avisa con un mensaje claro.
- **La tabla se crea sola al arrancar (2026-10-02, fix posterior).** El despliegue (`cloudbuild.yaml` + `Dockerfile`) **no corre migraciones**: el contenedor arranca con `node dist/main`. La migración `20261002_user_preferences` se fusionó sin aplicarse, y en producción las rutas de preferencias habrían fallado por tabla inexistente. `UsersService.onModuleInit` ejecuta ahora el mismo SQL idempotente (`user-preference.schema.ts`, una sentencia por llamada) en cada arranque; si la base lo rechaza, solo deja un aviso en el log y el servicio sigue (el frontend usa su caché local). Es una excepción puntual para esta tabla, no un sistema de migraciones: para cualquier otra tabla nueva, aplicar el SQL antes de desplegar o agregar un paso real de migración al despliegue.

## 4. Cambiar contraseña desde el perfil + cierre de sesiones (2026-10-06)

Antes solo se podía recuperar la contraseña con "¿Olvidaste tu contraseña?" en el login; con la sesión iniciada no había forma. Ahora el Perfil (`ProfilePage` → `ChangePasswordSection`) tiene "Cambiar contraseña": actual, nueva (mín. 8) y repetirla, con ojito mostrar/ocultar (`components/common/PasswordInput.tsx`, reutilizable). **Decisiones del usuario:** cierra todas las demás sesiones, y el "olvidé mi contraseña" también.

- **Endpoint:** `POST /auth/change-password` (`AuthService.changePassword`). Contraseña actual incorrecta, nueva igual a la actual o cuenta sin contraseña → **400** con mensaje claro (un 401 haría que el frontend cierre la sesión). Devuelve un token nuevo; el frontend lo guarda para que la sesión actual no se caiga. Primero se registra el corte y después se firma el token, así el nuevo (`iat` ≥ corte) sobrevive.
- **Cuentas solo-Google** (`User.password` nulo): el perfil no muestra el formulario, indica usar "¿Olvidaste tu contraseña?" para crear una. `GET /users/me` expone `hasPassword`.
- **Cierre de sesiones:** `SessionCutoffService` + tabla `UserSessionCutoff` (ver `AGENTS.md`, Auth). Se creó **tabla aparte** y no una columna en `User` porque una columna faltante habría roto toda consulta a `User` en producción (el despliegue no corre migraciones). Se crea sola al arrancar — mismo patrón que `UserPreference` (punto 3), segunda excepción a "no copiar este patrón": se aceptó porque falla abierto (sin la tabla solo se pierde el cierre de sesiones). Migración de registro: `20261006_user_session_cutoff`.
- **Garantía de sesión abierta:** solo `changePassword` y `confirmPasswordReset` escriben el corte. Si no se pudo guardar, la contraseña cambia igual y el mensaje no promete cerrar sesiones.
- **Costo:** una consulta por PK por usuario cada 30 s por instancia (caché en memoria), no una por petición.
- **Pendiente (auditoría de seguridad):** ni login, ni olvidé-contraseña, ni cambiar-contraseña tienen límite de intentos (un token robado permite probar contraseñas actuales sin freno).

## 5. Gerente en pantallas administrativas, Herramientas dentro de Sistemas y aviso de tickets (2026-10-06)

Pedido en producción: los gerentes deben **ver** Administración, Mi Empresa y Permisos usuarios; "Herramientas" seguía apareciendo como sección aparte en Permisos usuarios; y Sistemas debía enterarse de los reportes. **Decisiones del usuario:** gerente **solo lectura**; Herramientas se gobierna por la sección Sistemas; el aviso va a quien tiene **escritura** en Sistemas, de cualquier empresa.

- **Gerente solo lectura:** ver `AGENTS.md` (Permisos, regla del Gerente). El rol manda para ver estas pantallas (ignora lo marcado por usuario); escribir sigue siendo solo ADMIN en el backend. Permisos usuarios además redirige a quien no sea ADMIN/MANAGER (esa ruta no tiene `SectionRoute`). Mi Empresa lee la empresa por una ruta pública, por eso el backend no cambió allí; la pantalla queda sin "Guardar" ni logo/colores editables.
- **Herramientas:** `TOOLS` salió de `ALL_SECTIONS`; `ToolsController` pasó de `@Roles(ADMIN)` a `@Section('SISTEMAS', view|write)` (como `AgentsController`). Filas `UserPermission` `TOOLS` antiguas quedan inertes; `users.service.create` y `backfill-user-permissions.js` ya no las crean. En la Base de Conocimiento, un `## TOOLS` o `## AGENTS` antiguo se trata automáticamente como `## SISTEMAS` (`LEGACY_HEADINGS` en `ai/knowledge-base.util.ts`): su texto lo ve quien tiene Sistemas y no hace falta editar nada. La Base de Conocimiento tenía ruta (`/sistemas/base-conocimiento`, sección SISTEMAS) pero **no aparecía en el menú**: solo se llegaba por un botón del Dashboard de Sistemas. Desde 2026-10-06 está en el submenú de Sistemas (`Sidebar.tsx`, `sistemasSubItems`) y `## SISTEMAS` figura en la lista de encabezados de la pantalla.
- **Aviso al gerente que intenta cambiar algo (2026-10-06):** los botones de cambio NO se esconden: al pulsarlos aparece `SoloAdminDialog` («No tienes permiso para esto: es solo para administradores… contacta a un administrador de tu empresa para que {acción}»). Aplica en Administración (Nuevo usuario y menú de cada fila), Mi Empresa (logo, colores, Guardar) y Permisos usuarios (casillas, Guardar, módulos fijos). Cualquier pantalla nueva en solo lectura para algún rol debe usar el mismo diálogo.
- **Aviso a Sistemas:** `SistemasService.notificarEquipoSistemas`, solo campana, **solo a quien tiene SISTEMAS con "Escribir" marcado explícitamente** en Permisos usuarios (decisión del usuario; `getUsersWithExplicitSectionWrite`). Cada persona del equipo de Sistemas debe estar marcada una vez. Riesgo que SIGUE abierto: el default permisivo (sin fila = acceso) sí aplica a Herramientas, que expone claves de licencia — ver pendientes de seguridad.
- **Pendiente detectado, NO corregido (pedir visto bueno):** `POST /permissions/users/:userId` no valida que el usuario destino sea de la misma empresa del admin; y los endpoints de `permissions.controller.ts` que escriben aún lanzan `Error` (500) en vez de `ForbiddenException`.
