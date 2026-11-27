# Módulo: Users y Auth

Usuarios, perfil, preferencias personales, autenticación, seguridad de sesión y contraseñas. Permisos por sección y empresas: ver `AGENTS.md`.

## Endpoints
**Users (`/users`)**
- `POST /users` (ADMIN): el admin define la contraseña (sin default; se hashea). Crea filas `UserPermission` explícitas (punto 1).
- `GET /users`: cualquier autenticado; la forma de la respuesta depende del rol (punto 7).
- `GET /users/me`: perfil con herramientas asignadas, `phone`, `hasPassword`, `debeCambiarContrasena`. El hash nunca sale.
- `PATCH /users/me`: la persona cambia SU teléfono (punto 8).
- `GET|PUT /users/me/preferences/:key`: preferencia personal (punto 3).
- `GET /users/stats`, `GET|POST /users/locations`, `GET|PATCH|DELETE /users/:id`: solo ADMIN (el Gerente ve la lista de administración, solo lectura). `DELETE` = soft delete. `PATCH` incluye `locationId`.

**Auth (`/auth`)**
- `POST /auth/login`: devuelve JWT (7 días). `GET /auth/profile`.
- `POST /auth/forgot-password/request|confirm`: recuperación en dos pasos (código de 6 dígitos por correo).
- `POST /auth/change-password`: con sesión; `currentPassword` + `newPassword` (mín. 8). Los errores de validación son **400**, nunca 401 (el frontend cierra la sesión ante cualquier 401 fuera de `/auth/`). Devuelve un token nuevo que el frontend guarda.
- No existe registro público (`/register` redirige al login). Los usuarios los crea un ADMIN.

## Permisos (resumen)
- `CompanySection`: secciones habilitadas por empresa. `UserPermission`: `canView`/`canWrite` por usuario y sección. Super admin ve todo; Company Admin gestiona los permisos de su empresa.
- Administración, Mi Empresa y Permisos usuarios mandan por las casillas Ver/Escribir (2026-11-26), no por rol: el administrador de empresa siempre las tiene (`esAdminDeEmpresaEnSeccionBase`); el Gerente nace con «Ver» en Administración y Mi Empresa y su administrador puede quitárselo o darle «Escribir»; un usuario normal nace solo con Inicio y Proyectos. Quien no es ADMIN no toca a administradores ni sus propios permisos y solo da acceso a lo que él mismo tiene (`soloAdminToca`, `assertPuedeGestionarUsuario`, `assertPuedeOtorgar`). Los botones de cambio NO se esconden: al pulsarlos sale `SoloAdminDialog`. Toda pantalla nueva en solo lectura usa el mismo diálogo.
- Nunca devolver el hash de contraseña.

## 1. Bug de permisos al crear usuario: filas `UserPermission` explícitas, no implícitas
El guard (`section-permission.guard.ts`) y `usePermissions.ts` tratan «sin fila `UserPermission`» como permitido (default permisivo deliberado, ver `AGENTS.md`). Por eso un usuario nuevo sin filas tenía acceso total mientras `/admin/user-permissions` lo mostraba sin marcar.
- `UsersService.create()` (misma transacción): para cada sección de `ALL_SECTIONS` que no sea `SECCIONES_SIEMPRE_VISIBLES` ni `CompanySection.fixedForAll` de esa empresa, crea fila explícita: EMPLOYEE/MANAGER `canView:false, canWrite:false`; ADMIN `true/true`.
- Super admin (`companyId: null`) no tiene filas (bypasea todo).
- Backfill: `npm run backfill:permissions` (en `backend/`, `prisma/backfill-user-permissions.js`) aplica lo mismo a usuarios de empresa con cero filas. Dry-run por defecto, `--apply` ejecuta. Es JS plano con su propia copia de `ALL_SECTION_KEYS`/`SECCIONES_SIEMPRE_VISIBLES`: si cambia `permissions.service.ts`, actualizarlo también.

## 2. Ubicación por usuario + catálogo `CompanyLocation`
- Columna «Ubicación» en Administración → Gestionar usuarios (`AdminDashboardPage.tsx`), ordenable y filtrable, con el patrón de tabla de `ContratosList.tsx`.
- `CompanyLocation`: catálogo por empresa (`@@unique([companyId, nombre])`). `User.locationId` nullable con `onDelete: SetNull`.
- Alta desde el modal «Editar usuario» («+ Agregar nueva ubicación…» → `POST /users/locations`, queda seleccionada).
- Duplicados (sin distinguir mayúsculas): 409 con mensaje entendible.
- `PATCH /users/:id` con `locationId` verifica en servidor que sea de la misma empresa del usuario editado (`ForbiddenException`); nunca confía en el cliente.

## 3. Preferencias personales por usuario: `UserPreference`
- Modelo `UserPreference` (`userId` cascade, `key`, `value Json`, `@@unique([userId, key])`). Guardadas en la cuenta (siguen a la persona entre navegadores).
- `GET|PUT /users/me/preferences/:key` usan siempre `req.user.userId`, sin sección de permiso, declarados antes de `:id`.
- El servicio solo acepta claves `(columnas|notificaciones):[a-z0-9-]+`; el DTO valida un arreglo de máx. 50 strings de máx. 64 caracteres. Para otro tipo de preferencia, ampliar `PREFERENCE_KEY_PATTERN` y el DTO, no abrirlo a cualquier JSON. Los prefijos cerrados impiden que el cliente escriba claves internas (p. ej. `seguridad:`).
- Frontend: `useColumnPreferences` + `ColumnPickerMenu` arrancan con caché local, adoptan el valor del servidor y `set()` guarda en ambos; si el servidor falla, el cambio queda en el navegador y se avisa.
- **La tabla se crea sola al arrancar:** el despliegue (`cloudbuild.yaml` + `Dockerfile`) NO corre migraciones (el contenedor arranca `node dist/main`). `UsersService.onModuleInit` ejecuta SQL idempotente (`user-preference.schema.ts`, una sentencia por llamada); si falla, solo avisa en el log. Es una excepción puntual, no un sistema de migraciones: para otra tabla nueva, aplicar el SQL antes de desplegar o añadir un paso real de migración.
- **Avisos: app o correo.** El Perfil permite elegir por tipo de aviso si llega solo en la app o también por correo (`notificaciones:<tipo>`, valor `correo` / `solo-notificaciones`; regla única en `common/utils/avisos-correo.util.ts`). Por defecto solo la app. Nombre de cara al usuario: «notificaciones en la app» (ícono de campana). Las notificaciones en la app no se pueden apagar. Ver `proyectos-tareas.md` (tareas) y `sistemas.md` (Notificaciones).

## 4. Cambiar contraseña desde el perfil + cierre de sesiones
- Perfil → `ChangePasswordSection`: actual, nueva (mín. 8) y repetirla, con `components/common/PasswordInput.tsx`. Cambiarla (o restablecerla con el código) cierra las demás sesiones.
- `AuthService.changePassword`: contraseña actual incorrecta, nueva igual a la actual o cuenta sin contraseña → 400. Registra el corte y DESPUÉS firma el token, para que el nuevo (`iat` ≥ corte) sobreviva.
- Cuentas solo-Google (`User.password` nulo): el perfil no muestra el formulario e indica usar «¿Olvidaste tu contraseña?» (`hasPassword` en `/users/me`).
- **Corte de sesiones:** tabla `UserSessionCutoff (userId, validAfter)` (aparte, no columna en `User`: una columna faltante rompería toda consulta a `User` en producción). Se crea al arrancar en `SessionCutoffService.onModuleInit` (`auth/session-cutoff.schema.ts`). `JwtStrategy.validate` rechaza con 401 un token con `iat` anterior a `validAfter`. **Falla abierto** (sin tabla, sin fila o error de BD el token se acepta). Solo `changePassword` y `confirmPasswordReset` escriben el corte; si no se pudo guardar, la contraseña cambia igual y el mensaje no promete cerrar sesiones. Caché en memoria de 30 s por usuario (otra instancia de Cloud Run puede tardar hasta 30 s en enterarse).

## 5. Gerente en pantallas administrativas, Herramientas dentro de Sistemas y aviso de tickets
- Gerente: ver «Permisos (resumen)». Permisos usuarios va con `SectionRoute section="ADMIN"` y la empresa que gestiona es la de su sesión (`companyId`). Mi Empresa queda de solo lectura (sin Guardar ni logo/colores editables) para quien no tiene «Escribir» en `COMPANY_SETTINGS`.
- **Herramientas** se gobierna por la sección `SISTEMAS` (`TOOLS` no está en `ALL_SECTIONS`; `ToolsController` usa `@Section('SISTEMAS', …)`). Filas `UserPermission` `TOOLS` antiguas quedan inertes y ya no se crean. En la Base de Conocimiento, un `## TOOLS` o `## AGENTS` se trata como `## SISTEMAS` (`LEGACY_HEADINGS` en `ai/knowledge-base.util.ts`). La Base de Conocimiento está en el submenú de Sistemas (`Sidebar.tsx`, `sistemasSubItems`).
- **Aviso a Sistemas** al crear un ticket: ver `sistemas.md` (`notificarEquipoSistemas`). Solo recibe quien tiene `SISTEMAS` con «Escribir» marcado explícitamente; cada persona del equipo debe marcarse una vez.

## 7. Endurecimiento de seguridad
- **Hash de contraseña:** `PrismaService` usa `omit: { user: { password: true } }` global. Solo `auth.service.ts` lo pide (`omit: { password: false }`; `getMe` con `select: { password: true }`). Cualquier `include` futuro queda protegido.
- **Sin registro público.** `findAll` devuelve lista vacía a quien no tiene empresa y no es super admin (antes un `companyId` nulo veía a todas las empresas).
- **`GET /users` por rol:** EMPLOYEE recibe solo `id, fullName, email, role, position, isActive, department {id,name}`; ADMIN y Gerente ven la ficha completa. Sin cédula, rol relacional, ubicación, teléfono ni conteos para EMPLOYEE (cubierto por prueba).
- **Permisos entre empresas:** `PermissionsService.assertPuedeGestionarUsuario` (404 si no existe; super admin pasa; si no, misma empresa o 403). `setCompanySections` y `setUserPermissions` lanzan `ForbiddenException`, no `Error` (500).
- **Límite de intentos:** `AuthThrottleService` + tabla `AuthAttempt` (creada al arrancar, falla abierto, `auth-throttle.schema.ts`). 5 fallos en 15 min por correo → 429 durante 15 min (con los minutos que faltan); login correcto reinicia. Claves `login:<correo>`, `reset:<correo>`, `cambio:<userId>`. Cada solicitud de `forgot-password/request` cuenta, exista o no el correo (no delata cuentas ni permite envío masivo). Se usa el correo y no la IP (no hay `trust proxy`); costo aceptado: alguien puede bloquear 15 min a otra persona. Un solo `INSERT … ON CONFLICT` atómico para varias instancias.
- **Cambio de contraseña obligatorio a administradores:** `PasswordRotationService` marca al arrancar a los ADMIN activos con contraseña (y anteriores al corte configurado) con una fila `UserPreference` de clave `seguridad:…` y les cierra sesiones. `GET /users/me` devuelve `debeCambiarContrasena`; `CambioContrasenaObligatorio` (layout protegido) abre `ChangePasswordModal obligatorio` (sin X, Esc, clic fuera ni Cancelar) hasta que cambian la contraseña (`changePassword`/`confirmPasswordReset` la pasan a «hecha»). Para repetirlo en local: borrar esa fila y reiniciar el backend.
- **Sistemas por empresa (2026-11-26):** además de cerrado por defecto, ya no es `alwaysEnabled`: la empresa debe tenerlo asignado (migración `sistemas-seccion.schema.ts`, solo `gemeseg`). Quejas y Encuestas son secciones `abiertaSiActiva` y los usuarios antiguos sin filas se cerraron una vez (`permisos-usuarios.schema.ts`); detalle en `AGENTS.md`, «Permisos».
- **Sistemas cerrado por defecto:** `SECCIONES_CERRADAS_POR_DEFECTO = ['SISTEMAS']` y `permiteSinFila()` en los 5 sitios que aplicaban «sin fila = permitido» (guard, `hasSectionAccess`, `evaluarAccesoSecciones`, `canUseIntent`, `getAllowedSectionKeys`). `getMyPermissions` entrega una fila denegada sintética, así el frontend no cambia. Quien no tenga fila `SISTEMAS` explícita (admins y usuarios antiguos incluidos) no ve Sistemas: darle fila `UserPermission` (`canView/canWrite` true) a quien deba conservarlo.
- **`/tools` por empresa:** `ToolsService` filtra asignaciones y personas por `user.companyId`; `assignTool`/`updateAssignment`/`removeAssignment`/`getAuditLog` dan 403 si la persona o asignación es de otra empresa; `removeTool` da 409 si otras empresas la tienen asignada (borrar la herramienta borra en cascada sus asignaciones). `Tool` es catálogo compartido sin `companyId`. El super admin lo ve todo.
- **Repo público:** nunca poner contraseñas, `JWT_SECRET` ni ejemplos reales en el repo; las contraseñas de cuentas semilla y el secreto de producción no deben coincidir con nada documentado.

## 8. Teléfono de la persona: `User.phone`
Sirve al encabezado del PDF del Cotizador. Cada persona lo escribe en su perfil y el administrador también lo edita. Si no hay, el PDF usa la constante `TELEFONO_POR_DEFECTO` (`frontend/src/utils/telefono.ts`, un solo sitio).
- **Columna nueva sobre tabla existente:** como el deploy no corre migraciones y Prisma pide todas las columnas de `User` en cada consulta, una columna faltante rompería el login de todos. Se crea al arrancar en `PrismaService.onModuleInit` (`src/prisma/user-phone.schema.ts`, `ADD COLUMN IF NOT EXISTS`, con reintento por arranques simultáneos). Si falla, el servidor NO arranca. Solo aditivo. `prisma/migrations/20261017_user_phone` es solo referencia (no usar `migrate deploy`). Para columnas nuevas en tablas existentes, repetir este patrón; para tablas nuevas se usa tabla aparte.
- **Formato** (`users/phone.const.ts` y `utils/telefono.ts`, misma regla): dígitos, espacios, `+`, guiones y paréntesis; 7-15 dígitos; máx. 25 caracteres. Vacío o `null` = sin teléfono. Sin validación específica de país.
- **Quién lo ve:** la propia persona (`/users/me`), el administrador (`GET /users`, `GET /users/:id`) y el encabezado/PDF del Cotizador (`ownerPhone` = teléfono ACTUAL del dueño, no se congela). NO va en el listado de EMPLOYEE, ni en el JWT, ni en la respuesta del login: el frontend lo pide a `/users/me`.
- **`PATCH /users/me`:** lista cerrada en `UpdateMeDto` (solo `phone`); las propiedades extra se rechazan (`forbidNonWhitelisted`). Para más campos editables, añadirlos a ese DTO; nunca abrir `PATCH /users/:id` a la propia persona.
- Administración → Usuarios: campo y columna «Teléfono»; Mi perfil: «Teléfono» con Agregar/Editar. Los errores del formulario de administración hacen `scrollIntoView`.
- `backend/prisma/import-cotizador.js` copia `profiles.telefono` a `User.phone` solo si la persona no tiene uno y no es el número por defecto; nunca pisa. Solo con autorización explícita.
