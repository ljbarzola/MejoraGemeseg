# Gemeseg Mejora - Guia para agentes

## Proposito
Este documento esta destinado a agentes de desarrollo, asistentes de codigo y pipelines de automatizacion. Proporciona contexto tecnico completo, decisiones de infraestructura y la organizacion actual del proyecto.

## Contexto del Proyecto
**Empresa:** GEMESEG (Ecuador)
**Objetivo:** Centralizar, modernizar y automatizar procesos internos mediante un ecosistema de software.
**Metodologia:** Scrum - sprints de 1-2 semanas
**Plataforma:** Web (no movil)
**Estado actual:** Fase 1 - Desplegado en produccion

### URLs de Produccion
- **Frontend (Firebase Hosting):** https://mejora-gemeseg.web.app
- **Backend (Cloud Run):** https://mejora-gemeseg-backend-141953681725.us-central1.run.app
- **API Docs (Swagger):** https://mejora-gemeseg-backend-141953681725.us-central1.run.app/docs

## Stack Tecnologico

### Backend
- **Framework:** NestJS v11 + TypeScript
- **ORM:** Prisma v7 (con `prisma.config.js`, sin `url` en datasource)
- **Base de datos:** PostgreSQL 16 (Cloud SQL en produccion, Docker en desarrollo)
- **Auth:** Passport.js (JWT, expira 7 dias) + bcryptjs (salt 10)
- **Docs:** Swagger en `/docs`
- **Validacion:** class-validator + class-transformer
- **IA:** GitHub Models (`gpt-4o-mini`) via `https://models.inference.ai.azure.com/chat/completions`

### Frontend
- **Framework:** React 18 + Vite
- **Routing:** react-router-dom
- **Formularios:** React Hook Form + Zod
- **HTTP:** Axios (con interceptor JWT)
- **Estilos:** CSS custom con paleta corporativa GEMESEG

### Infraestructura

#### Desarrollo (local)
- **DB:** PostgreSQL 17 (Docker)
- **Backend:** http://localhost:3000
- **Frontend:** http://localhost:5173

#### Produccion (Google Cloud Platform)
- **Proyecto GCP:** `mejora-gemeseg` (org: `gemeseg.com`)
- **Base de datos:** Cloud SQL - PostgreSQL 16 (`gemeseg-db`, `34.9.205.240`)
- **Backend:** Cloud Run (`mejora-gemeseg-backend`, us-central1)
- **Frontend:** Firebase Hosting (`mejora-gemeseg.web.app`)
- **Registry:** Artifact Registry (`us-central1-docker.pkg.dev/mejora-gemeseg/gemeseg-repo`)
- **Secrets:** Secret Manager (`DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `SIGNWELL_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`) — `SIGNWELL_API_KEY` reemplaza a `BOLDSIGN_API_KEY` (2026-09-17); hay que crear ese secreto nuevo en Secret Manager antes del próximo deploy o `cloudbuild.yaml` fallará al desplegar el backend
- **Deploy:** `firebase deploy --only hosting` (frontend), Cloud Build / `gcloud run deploy` (backend)

## Convenciones de Codigo

### NestJS
- Un modulo por dominio: `auth`, `projects`, `users`, `tasks`, `ai`, `queue`, `tools`, `agents`, `companies`, `custodias`, `personal`, `ventas`.
- DTOs con `class-validator` para toda entrada.
- Guards por rol: `@Roles(UserRole.ADMIN)` + `RolesGuard`.
- Responses consistentes.
- Nombres en ingles.

### React
- Componentes en PascalCase.
- Servicios de API en `/src/services/` (Axios con interceptor JWT).
- Paginas en `/src/pages/`.
- Tipos en `/src/types/`.
- `noUnusedLocals: true` y `noUnusedParameters: true` en tsconfig.

### Prisma
- Enums en schema: `UserRole`, `ProjectStatus`, `MemberRole`, `TaskStatus`, `Priority`, `CustodiaType`, `CustodiaEstado`.
- Modelos: `Company`, `User`, `Department`, `Role`, `Project`, `ProjectMember`, `Task`, `TaskAssignee`, `Tool`, `ToolAssignment`, `ToolAuditLog`, `Agent`, `UserAgent`, `Conversation`, `ChatMessage`, `AiLog`, `Custodia`, `SalesGoal`, `ClientVisit`, `Lead`, `SalesApiKey`.
- Migraciones con `prisma migrate dev --name <nombre>`.
- Seed en `prisma/seed.js`.
- Prisma v7 usa `prisma.config.js` (JS, no TS) para la URL de conexion.
- `schema.prisma` NO tiene `url` en datasource (se define en `prisma.config.js`).

### Git
- Ramas: `main` (produccion), `feature/XXX-nombre`, `fix/XXX-nombre`.
- **SIEMPRE hacer `git pull origin main` antes de crear una rama nueva** para evitar conflictos de versiones.
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.
- No hacer push sin confirmacion del usuario.
- **Autoria de commits:** todos los commits van a nombre del duenio del repo (`Leidy Barzola <sistemas@gemeseg.com>`), nunca a nombre del asistente de IA. Configurar antes de commitear:
  `git config user.name "Leidy Barzola" && git config user.email "sistemas@gemeseg.com"`
- **No agregar trailers de atribucion de IA** (`Co-Authored-By: Claude...`, `Generated with...`) en mensajes de commit ni en descripciones de PR.

### Proceso de entrega (siempre, al terminar un bloque de trabajo)
1. **Verificar** que compila y que las pruebas manuales pasan antes de commitear.
2. **Commit** con mensaje descriptivo (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`).
3. **Push** a la rama de trabajo: `git push -u origin <rama>`.
4. **Abrir el Pull Request** hacia `main` con un resumen de lo entregado, como
   verificarlo y lo que queda pendiente. Este paso no se omite: el trabajo no
   esta entregado hasta que existe el PR.
5. El PR va a nombre del duenio del repo y **sin** firmas ni footers de IA.

## Despliegue en Produccion

### Arquitectura
Cloud Run **solo sirve la API** (el `Dockerfile` de `backend/` no incluye el frontend) y Firebase Hosting sirve el frontend estatico. Ambos se despliegan desde el **mismo pipeline**, `cloudbuild.yaml`, en pasos secuenciales dentro de una sola corrida (build+push+deploy del backend a Cloud Run, luego build+deploy del frontend a Firebase Hosting) - no son pipelines separados. El dominio publico `app.gemeseg.com` esta mapeado como custom domain sobre Firebase Hosting, que hace de unico origen de cara al usuario y reenvia `/api/**`, `/health`, `/docs/**` a Cloud Run (ver `firebase.json`).

Hubo un intento previo de desplegar el frontend por separado via `.github/workflows/firebase-hosting-merge.yml` (GitHub Actions), pero se elimino el 2026-09-11: dependia de un secret `FIREBASE_SERVICE_ACCOUNT` que nunca se configuro, asi que cada corrida fallaba en el paso de deploy, y ademas duplicaba lo que ya hace `cloudbuild.yaml`. No reintroducir ese workflow sin antes revisar si hace falta junto al de Cloud Build.

```
Google Cloud Platform (proyecto: mejora-gemeseg)
  ├── Cloud SQL (PostgreSQL 16)   → gemeseg-db
  ├── Cloud Run (NestJS backend, solo API) → mejora-gemeseg-backend
  ├── Firebase Hosting (React, dominio publico app.gemeseg.com) → mejora-gemeseg.web.app
  ├── Artifact Registry           → gemeseg-repo
  ├── Secret Manager              → DATABASE_URL, JWT_SECRET, FRONTEND_URL, SIGNWELL_API_KEY, GOOGLE_SERVICE_ACCOUNT_JSON
  └── Cloud Scheduler + Cloud Build trigger weekly-cloudsql-backup → copias on-demand de gemeseg-db
```

`GOOGLE_SERVICE_ACCOUNT_JSON` es el contenido completo de `backend/google-service-account.json` (gitignored, nunca llega a la imagen Docker) — `DriveService`/`GmailMailService` lo usan como fallback cuando el archivo no existe en disco (ver `backend/src/modules/personal/services/drive.service.ts`, `getDriveClient()`). Si se rota la service account, actualizar este secreto (`gcloud secrets versions add GOOGLE_SERVICE_ACCOUNT_JSON --data-file=backend/google-service-account.json`), no solo el archivo local.

El deploy de Firebase Hosting en `cloudbuild.yaml` no usa ningún secreto: corre con el builder oficial `us-docker.pkg.dev/firebase-cli/us/firebase`, que sí recoge correctamente la identidad ambiental de la cuenta de servicio de Cloud Build (que ya tiene `roles/firebasehosting.admin` + `roles/firebase.admin`). Se descartaron dos alternativas: un token personal `firebase login:ci` (`FIREBASE_TOKEN`) que resultó revocado/expirado, y una clave de service account descargada (bloqueada por política de la organización: `iam.serviceAccountKeys.create` denegado incluso para el owner del proyecto). Ver el comentario en `cloudbuild.yaml` para el detalle completo.

### Plataformas
- **Base de datos:** Cloud SQL (PostgreSQL 16, `us-central1`)
- **Backend:** Cloud Run (`us-central1`, auto-scaling) - deploy via `cloudbuild.yaml` (Cloud Build, dispara con push a `main`)
- **Frontend:** Firebase Hosting (`mejora-gemeseg.web.app`, dominio publico `app.gemeseg.com`) - deploy via `cloudbuild.yaml` (mismo pipeline que el backend, dispara con push a `main`)
- **CI/CD:** un solo pipeline (`cloudbuild.yaml`) que despliega backend y frontend en pasos secuenciales de la misma corrida - ver `CLAUDE.md`

### URLs
- Frontend: https://mejora-gemeseg.web.app
- Backend: https://mejora-gemeseg-backend-141953681725.us-central1.run.app
- API Docs: https://mejora-gemeseg-backend-141953681725.us-central1.run.app/docs

### Variables de Entorno

### Desarrollo (.env local)
La base de datos de desarrollo es un **Postgres local** (servicio `db` de `docker-compose.yml`), completamente separado de la Cloud SQL de produccion (`gemeseg-db`) - crear/editar/eliminar en local nunca toca datos reales. Levantar la infra y poblarla:
```bash
docker compose up -d db redis
cd backend
npx prisma generate
npx prisma db push
npm run seed:minimal   # datos minimos: 1 empresa, 2 usuarios, 1 proyecto/tareas, Personal basico
```
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public
JWT_SECRET=gemeseg-jwt-secret-2026
GITHUB_TOKEN=<token_de_github_models>
FRONTEND_URL=http://localhost:5173
```

Si alguna vez hace falta inspeccionar datos reales de produccion (solo lectura, para depurar un bug reportado), conectar **solo** via **Cloud SQL Auth Proxy** (nunca `psql` directo a la IP publica `34.9.205.240`; esa instancia tiene `sslMode=ENCRYPTED_ONLY` y no hay Authorized Networks, asi que las conexiones directas sin proxy/conector fallan o deben ir cifradas):
```bash
cloud-sql-proxy.exe mejora-gemeseg:us-central1:gemeseg-db --port 5434 --credentials-file "backend/cloudsql-proxy-key.json"
```
y apuntar una `DATABASE_URL` alterna a `127.0.0.1:5434` solo para esa sesion puntual - no dejarlo como el `.env` por defecto.

### Cloud SQL (`gemeseg-db`) — backups, SSL, tamano

- **Conexion de produccion:** Cloud Run usa el conector (Unix socket `/cloudsql/mejora-gemeseg:us-central1:gemeseg-db`). No hace falta SSL en Prisma para esa via.
- **SSL directo:** `sslMode=ENCRYPTED_ONLY`. No hay redes autorizadas (no esta `0.0.0.0/0`).
- **Backups:** los automaticos *nativos* diarios siguen **apagados** (el aviso de consola de GCP puede seguir visible). Hay un backup on-demand inicial (2026-09-21) y un job semanal:
  - Cloud Scheduler `gemeseg-db-weekly-backup` (domingo 04:00 `America/Guayaquil`)
  - dispara el trigger de Cloud Build `weekly-cloudsql-backup` (config en `cloudbuild.weekly-backup.yaml`)
  - cuenta de servicio `cloudsql-weekly-backup@mejora-gemeseg.iam.gserviceaccount.com`
  - retiene las **4** copias on-demand mas recientes; **sin PITR** hasta pasar a backups diarios nativos
  - corrida manual: `gcloud builds triggers run weekly-cloudsql-backup --project=mejora-gemeseg`
- **Tamano (diagnostico 2026-09-21, sin resize):** `db-f1-micro` (1 vCPU compartida, ~0.60 GiB RAM, disco 10 GB SSD con auto-resize). Recommender `HIGH_MEMORY_UTILIZATION`: memoria al 100% en los ultimos 8 dias, 0 eventos OOM. **No se sube de maquina.** Mitigacion de conexiones: pool Prisma `max=3` (`DATABASE_POOL_MAX`, ver `prisma.service.ts`) y Cloud Run `--min-instances=0` para no dejar 10 conexiones idle por replica. Si Cloud Run escala a `max-instances=10`, el techo es 30 sesiones, cerca del limite de f1-micro (~25) — no subir el pool. Primer request tras inactividad tiene cold start.

### Produccion - Backend (Cloud Run / Secret Manager)
| Key | Value |
|-----|-------|
| `DATABASE_URL` | Secret Manager: `DATABASE_URL` (Cloud SQL, socket: `/cloudsql/mejora-gemeseg:us-central1:gemeseg-db`) |
| `JWT_SECRET` | Secret Manager: `JWT_SECRET` |
| `FRONTEND_URL` | Secret Manager: `FRONTEND_URL` (`https://mejora-gemeseg.web.app`) |
| `NODE_ENV` | `production` |

### Produccion - Frontend (Firebase Hosting)
| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://mejora-gemeseg-backend-141953681725.us-central1.run.app/api` |

## Autenticacion

- `POST /auth/register` - solo correos `@gemeseg.com` (domain guard)
- `POST /auth/login` - retorna JWT con `{ sub, email, role }`
- JWT expira en 7 dias
- Password hasheada con bcrypt (salt 10)
- Role incluido en JWT para guards

## Reglas de Negocio

### Admin
- **Super Admin:** `admin@general.com` (companyId: null) - puede ver y gestionar todas las empresas.
- **Admin de empresa:** `admin@gemeseg.com`, `admin@mikacao.com` - solo gestiona su propia empresa.
- Es OWNER automatico de TODOS los proyectos de su empresa (se agrega al crear proyecto).
- Puede cambiar roles de cualquier miembro (incluyendo OWNER).
- Puede ver todos los miembros (incluyose a si mismo).
- No aparece en la lista de miembros para usuarios normales.

### Proyectos
- **Cualquier usuario autenticado** puede crear proyectos.
- OWNER y MEMBER pueden editar el proyecto (incluyendo estado).
- Solo OWNER o ADMIN pueden eliminar proyectos.

### Owners
- Pueden agregar y quitar miembros del proyecto
- No pueden quitar al ultimo OWNER de un proyecto
- No pueden eliminarse a si mismos

### Viewers
- Ven botones deshabilitados (greyed out, `cursor: not-allowed`), no ocultos
- No pueden crear ni editar tareas

### Herramientas (Sistema)
- Solo usuario `sistemas@gemeseg.com` ve la pestana de Herramientas.
- Solo ADMIN puede crear/eliminar herramientas y asignaciones (RolesGuard).
- Asignaciones multiples de usuarios soportadas.
- Auditoria de cada accion (quien asigno/removio, cuando).

### Agentes de IA
- Solo ADMIN puede gestionar agentes (RolesGuard en AdminAgentsController).
- Cada agente tiene: nombre, instrucciones (system prompt), alcance (GLOBAL/PROJECTS/TASKS/ADMIN).
- Un agente puede estar asignado a multiples usuarios.
- Un usuario puede tener multiples agentes asignados.
- El agente global (createdBy: null) esta disponible para todos.
- Cada combinacion usuario+agente tiene sus propias conversaciones.

### Permisos por seccion (`/permissions`)
Existen **dos capas de autorizacion independientes**, no una sola:
1. **RolesGuard** (`@Roles(UserRole.ADMIN)`): rol grueso ADMIN/MANAGER/EMPLOYEE, por endpoint.
2. **Permisos por seccion** (`PermissionsService`, modulo `permissions`): gatea modulos completos (DASHBOARD, PROJECTS, ADMIN, TOOLS, CACAO, COMPANY_SETTINGS, COMPANIES, CUSTODIAS, RRHH, VENTAS, SISTEMAS - ver `ALL_SECTIONS` en `permissions.service.ts`).

Reglas:
- Una seccion con `alwaysEnabled: true` (DASHBOARD, PROJECTS, ADMIN, TOOLS, SISTEMAS) esta siempre visible para toda empresa.
- **SISTEMAS es `alwaysEnabled` desde 2026-09-22, y tiene que seguir siendolo.** Herramientas y Agentes vivian sueltas en el menu como secciones siempre activas hasta que se agruparon dentro de Sistemas (`/sistemas/herramientas`, `/sistemas/agentes`, con redirects desde `/tools` y `/admin/agents`). Al publicarse, SISTEMAS quedo como seccion opt-in y **nadie la activo**, asi que el menu entero -- incluidas esas dos pantallas que antes eran siempre visibles -- desaparecio para toda empresa existente. Si se vuelve a poner en `false`, vuelve a pasar lo mismo.
- Las demas secciones deben habilitarse por empresa via `CompanySection` (`POST /permissions/sections/:companyId`, solo super admin).
- Dentro de una seccion habilitada, un usuario puede ademas restringirse por `UserPermission.canView/canWrite` (`POST /permissions/users/:userId`, admin de esa empresa).
- El Super Admin (`companyId: null`) ve y puede gestionar todas las secciones sin restriccion (`getMyPermissions` retorna `isSuperAdmin: true` y el listado completo de `ALL_SECTIONS`).
- `GET /permissions/my` es el endpoint que el frontend consulta al cargar sesion; `contexts/PermissionsContext.tsx` + `hooks/usePermissions.ts` exponen `canView(section)`, usado por el wrapper `<SectionRoute section="...">` en `App.tsx` alrededor de las rutas de cada modulo.
- **Al agregar un modulo nuevo:** agregarlo a `ALL_SECTIONS`, proteger sus endpoints, y envolver sus rutas de frontend en `SectionRoute`. Ninguna de las dos capas reemplaza a la otra - un endpoint puede tener `RolesGuard` correcto y aun asi quedar expuesto si no se agrega su seccion aqui.
- **Modulos fijos por empresa** (`CompanySection.fixedForAll`, desde 2026-09-22): el administrador de CADA empresa marca, desde Administracion -> Permisos -> tuerca, que modulos ve todo su personal. Un modulo fijo se ignora en la capa de `UserPermission` (backend: `PermissionsService.getFixedSections` + el guard; frontend: `fixedSections` de `GET /permissions/my`). No se pisa el dato individual, solo se ignora, asi que al desmarcarlo cada quien vuelve a su permiso de antes. El endpoint es `POST /permissions/sections/:companyId/fixed` y usa `SetFixedSectionsDto`, que SI acepta lista vacia (con `@ArrayNotEmpty` era imposible quitar el ultimo fijo).
- **Inicio (DASHBOARD) y Proyectos no se pueden negar usuario por usuario** (`siempreVisible: true` en `ALL_SECTIONS`, desde 2026-09-22). Quejas y Encuestas ya estaban abiertas a nivel de ruta. Son la pantalla de entrada y los canales abiertos a cualquier empleado: quitárselos a alguien lo dejaba sin ningun lugar a donde entrar. La pantalla de permisos por usuario las muestra bloqueadas.
- **Nunca redirigir a una ruta fija cuando se niega el acceso.** `alwaysEnabled` solo dice que la seccion esta activa para la EMPRESA; un usuario puede tenerla negada igual con `UserPermission.canView = false`. Hasta el 2026-09-22 `SectionRoute` redirigia siempre a `/dashboard` al denegar, y como `/dashboard` tambien esta detras de `SectionRoute`, cualquier usuario con DASHBOARD en `false` entraba en un bucle de redirecciones y veia una pantalla en blanco (pasaba con `sistemas@gemeseg.com`). Ahora se usa `landingRoute` de `usePermissions` (primera seccion que ese usuario SI puede ver) y, si no puede ver ninguna, se muestra un mensaje. Ver `.agents/modules/recursos-humanos.md` punto 15a.

**`SectionPermissionGuard` (backend, agregado en Sprint 3 de Personal):**
Hasta el Sprint 3, los permisos por seccion **solo se aplicaban en el frontend** (`SectionRoute`); el backend no los verificaba en ningun endpoint. `common/guards/section-permission.guard.ts` + `common/decorators/section.decorator.ts` cierran ese hueco:

```ts
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
@Section('RRHH', 'write')   // o 'view'
```

Replica **exactamente** la semantica de `hooks/usePermissions.ts`, en este orden:
1. Super admin → pasa siempre.
2. Seccion no habilitada para la empresa → 403.
3. Existe fila `UserPermission` para la seccion → manda su `canView`/`canWrite`.
4. **No existe fila → se permite** (default permisivo).

El punto 4 es deliberado y esta cubierto por un test: invertirlo dejaria fuera a todos los usuarios que hoy no tienen permisos explicitos cargados. Usar este guard (y no `RolesGuard`) es lo correcto cuando el acceso depende del modulo y no del cargo - p. ej. los usuarios de RRHH estan cargados como `EMPLOYEE` (`nayelli@gemeseg.com`), asi que un `@Roles(ADMIN, MANAGER)` los habria bloqueado.

### Empresas (White-labeling)
- **Super Admin** (`admin@general.com`, `companyId: null`): puede ver y gestionar todas las empresas.
- **Admin de empresa** (`admin@gemeseg.com`, `admin@mikacao.com`): solo gestiona su propia empresa.
- Cada empresa tiene: nombre, slug, logo, colores corporativos (primary, secondary, accent, bg, text), dominio de email.
- Los usuarios se asocian a una empresa via `companyId`.
- Los proyectos y datos se filtran por membresia, no por empresa (companyId esta en User, no en Project).
- El endpoint `GET /companies/mine` retorna la empresa del usuario autenticado.
- El endpoint `GET /companies/slug/:slug` es publico (para branding en login).

## Modulos Backend

### Auth (`/auth`)
- `POST /auth/register` - Registro (solo @gemeseg.com)
- `POST /auth/login` - Login, retorna JWT
- `GET /auth/profile` - Perfil del usuario autenticado

### Projects (`/projects`)
- `POST /projects` - Crear proyecto (cualquier usuario autenticado) + admin auto-OWNER
- `GET /projects` - Listar proyectos (filtrado por membresia, paginado)
- `GET /projects/admin/stats` - Estadisticas admin (solo ADMIN)
- `GET /projects/:id` - Detalle de proyecto
- `GET /projects/:id/tasks` - Tareas de un proyecto
- `POST /projects/:id/tasks` - Crear tarea
- `GET /projects/:id/members` - Miembros del proyecto
- `POST /projects/:id/members` - Agregar miembro (OWNER/ADMIN)
- `DELETE /projects/:id/members/:userId` - Quitar miembro (OWNER/ADMIN)
- `PATCH /projects/:id/members/:userId/role` - Cambiar rol (solo ADMIN)

### Tasks (`/tasks`)
- `GET /tasks/:id` - Detalle de tarea
- `PATCH /tasks/:id` - Actualizar tarea
- `DELETE /tasks/:id` - Eliminar tarea

### Users (`/users`)
- `POST /users` - Crear usuario (solo ADMIN)
- `GET /users` - Listar usuarios (cualquier usuario autenticado)
- `GET /users/me` - Perfil del usuario autenticado (con herramientas asignadas)
- `GET /users/stats` - Estadisticas (solo ADMIN)
- `GET /users/:id` - Detalle de usuario (solo ADMIN)
- `PATCH /users/:id` - Actualizar usuario (solo ADMIN)
- `DELETE /users/:id` - Eliminar usuario (soft delete, solo ADMIN)

### Tools (`/tools`)
- `GET /tools` - Listar catalogo de herramientas
- `POST /tools` - Crear herramienta en catalogo
- `DELETE /tools/:id` - Eliminar herramienta y sus asignaciones
- `GET /tools/assignments` - Listar asignaciones (filtros por tool/user)
- `GET /tools/users` - Usuarios con sus herramientas
- `POST /tools/assign` - Asignar herramienta a usuario
- `PATCH /tools/assign/:id` - Actualizar asignacion (version, licencia)
- `DELETE /tools/assign/:id` - Eliminar asignacion
- `GET /tools/assign/:id/audit` - Historial de auditoria

**Nota:** Todos los endpoints de Tools requieren rol ADMIN (RolesGuard).

### Chat IA (`/chat`)
- `POST /chat/message` - Enviar mensaje al asistente IA
- `GET /chat/conversations` - Listar conversaciones del usuario (filtro por agentId)
- `GET /chat/conversations/:id/messages` - Obtener mensajes de una conversacion
- Rate limit: 50 mensajes/dia por usuario
- GitHub Models (`gpt-4o-mini`) con fallback a mock
- Predefinidas: `list_projects`, `count_tasks_by_status`, `user_info`, `project_summary`, `list_my_tasks`

### Agents (`/admin/agents`)
- `GET /admin/agents` - Listar usuarios con sus agentes asignados
- `GET /admin/agents/catalog` - Listar todos los agentes (catalogo)
- `GET /admin/agents/assignments` - Listar todas las asignaciones usuario-agente
- `GET /admin/agents/user/:userId` - Agentes de un usuario
- `POST /admin/agents` - Crear agente (asigna automaticamente al usuario creador)
- `PATCH /admin/agents/:id` - Actualizar agente (nombre, instrucciones, alcance, isActive)
- `DELETE /admin/agents/:id` - Eliminar agente
- `POST /admin/agents/:id/assign/:userId` - Asignar agente a usuario
- `DELETE /admin/agents/:id/assign/:userId` - Quitar agente de usuario
- `GET /agents/available` - Agentes disponibles para el usuario actual (global + asignados)

**Nota:** Todos los endpoints de Admin Agents requieren rol ADMIN (RolesGuard). El endpoint `GET /agents/available` es para cualquier usuario autenticado.

### Custodias (`/custodias`) - Módulo Operativo
*Nota de nomenclatura:* "Custodias" es el módulo operativo de rutas, transporte y nómina. El personal de seguridad gestionado en el módulo de Personal se denomina "Guardias" (submenú Personal > Guardias).

- `POST /custodias` - Crear custodia (tipo, guia, personal, ruta, horarios, datos por tipo)
- `GET /custodias` - Listar custodias (filtros: fechaInicio, fechaFin, tipo, estado)
- `GET /custodias/dashboard` - KPIs del mes (`total_viajes`, `total_nomina_usd`, `empleados_activos`, `por_tipo`, `por_estado`)
- `GET /custodias/trabajador` - Consulta de historial de viajes e ingresos por cédula (`cedula`, `mes`)
- `POST /custodias/gemebot/query` - Asistente de consultas operativas GEME-BOT
- `GET /custodias/:id` - Detalle de custodia
- `PATCH /custodias/:id/estado` - Cambiar estado (LISTO_PARA_CUSTODIAR/EN_CAMINO/LLEGO)
- `DELETE /custodias/:id` - Eliminar custodia
- `GET /custodias/:id/pdf` - PDF Orden de Custodia con firmas
- `GET /custodias/available-custodios` - Empleados de Drive CUSTODIAS para el select
- `GET /custodias/nomina` - Nomina con matriz cronologica (fechaInicio, fechaFin)
- `GET /custodias/nomina/pdf` - PDF nomina (cedula=individual, todos=true, sin param=matriz)

**Tipos:** HACIENDA ($20/persona), PUERTO ($10/persona), VIP ($23/persona)
**Estados:** LISTO_PARA_CUSTODIAR → EN_CAMINO → LLEGO (solo LLEGO liquida nomina)
**PDFs:** PDFKit - orden con firmas, matriz landscape, rol individual, masivo

### Correo saliente (`MailModule`)
Todo el correo del sistema sale por `GmailMailService` (`backend/src/modules/mail/`), que lo usan RRHH (recordatorios de cumplimiento) y Auth (codigo de recuperacion de contrasena). Un solo canal, una sola cuenta de servicio.

**El remitente se configura POR EMPRESA** (`NotificationConfig.senderEmail` + `senderName`, en "Configurar notificaciones" de Cumplimiento). `GMAIL_SENDER_ADDRESS` quedo solo como valor por defecto. Hasta 2026-09-22 ese campo se EXIGIA pero no se usaba: todo salia siempre desde la variable del servidor, asi que la pantalla prometia algo que no cumplia. Como la delegacion de dominio impersona a una persona concreta, `GmailMailService` cachea **un cliente por remitente**, no uno solo. Al guardar la configuracion se valida la casilla contra Google sin enviar nada (`verificarRemitente`), para que un error de tipeo se vea ahi y no recien cuando alguien intente avisarle a un guardia. Lo usan tanto los recordatorios de cumplimiento como el codigo de recuperacion de contrasena.

**La cuenta de correo NO es la de Drive.** La delegacion de dominio de Workspace se autoriza por `client_id`, y en GEMESEG se autorizo `correo-gemeseg-com@agentes-504115.iam.gserviceaccount.com` (client_id `115386168102739974811`), no `drive-sync@...`. Orden de busqueda de credenciales: `GMAIL_SERVICE_ACCOUNT_JSON` (produccion) -> `backend/google-service-account-mail.json` (local) -> la de Drive como ultimo recurso, avisando en el log. Si Google responde `unauthorized_client`, es que se esta usando la cuenta equivocada.

`GmailMailService.explicarErrorGoogle` traduce los errores de Google a algo accionable (delegacion no autorizada / casilla invalida / API deshabilitada), porque los mensajes crudos no dicen que configurar.

⚠️ **Pendiente de configuracion:** falta habilitar la **Gmail API** en el proyecto `agentes-504115` (numero 33331497230). Verificado el 2026-09-22: la delegacion funciona y las casillas `sistemas@` y `rrhh@` se impersonan bien, pero todo envio falla con 403 "Gmail API has not been used in project...". Es un clic en la consola de Google Cloud.

### Recursos Humanos (`/rrhh`)
- `GET/POST/DELETE /personal/reclutamiento/puestos` - Creación de vacantes y sincronización JSON con Drive
- `POST /personal/reclutamiento/sync` - Sincronización de candidatos postulados en Drive Reclutamiento (devuelve `tipoContratacion` y `modoSubida` por candidato)
- `POST /personal/reclutamiento/candidatos/:folderId/contratar` - Contratar: mueve la carpeta al destino que declara la vacante (`JobPosition.tipoContratacion`)
- `GET /personal/alerts` - Capacitaciones vencidas + por vencer. (Certificaciones se eliminaron por completo el 2026-09-22, tabla incluida: ver `.agents/modules/recursos-humanos.md` punto 4. No reintroducir `/personal/certifications`.)
- `GET /personal/guardias` - Padron de guardias (nombre + cedula), seccion RRHH. Las pantallas de RRHH usan **este**, no `/custodias/available-custodios`, que esta detras de la seccion CUSTODIAS y hacia fallar Listado de Guardias y Generar Documento con "No tienes acceso a CUSTODIAS" en empresas sin ese modulo (ver `.agents/modules/recursos-humanos.md` Endpoints)
- `POST /personal/drive/sync-entidades` - Sincronizar Guardias (carpeta configurable). Reclutamiento, Capacitaciones y Contratos de ventas usan carpetas **fijas en código** (ver `.agents/modules/recursos-humanos.md` punto 12); cada listado tiene "Ver carpeta".
- `GET /personal/drive/compliance/:cedula` - Checklist de cumplimiento por cédula (incluye `review` por documento y `reviewSummary`)

**Destino de contratación y análisis del "archivo único" (2026-09-16, ver `.agents/modules/reclutamiento.md` Sprints 7-8 para el detalle completo):**
- `JobPosition.tipoContratacion` (`GUARDIA` | `ADMINISTRATIVO`, default `GUARDIA`) decide a qué carpeta raíz va el postulante al contratarlo. **Desde 2026-09-22 los dos buckets nombran IGUAL**: `Apellidos Nombres`, sin guion, sin cédula y sin puesto (`backend/src/modules/personal/utils/nombre-persona.util.ts`). La cédula y el puesto viven dentro de `candidato.json` / `datos.json`, que es de donde el sync resuelve la identidad. Contratar **renombra** la carpeta a ese formato en la misma llamada que la mueve. Las carpetas viejas (`Apellidos - Nombres`, `Apellidos Nombres - Cédula - Puesto`, `Nombre - Puesto`) **se siguen leyendo y sincronizando**; el sync solo avisa cuáles conviene renombrar a mano — **nunca renombra nada en Drive por su cuenta** (decisión explícita del usuario). Sin carpeta destino configurada, se bloquea sin mover nada. (Detalle completo: `.agents/modules/recursos-humanos.md` punto 13; formato de Entidades: punto 11.)
- `POST /personal/reclutamiento/candidatos/:folderId/analizar` (`?driveFileId=` opcional) - La IA **propone** qué documento requerido está en qué páginas de un PDF. **No está limitado a `modoSubida='archivo_unico'`**: sin `driveFileId` detecta el único PDF de la carpeta (el aviso morado del candidato); con `driveFileId` analiza ESE archivo puntual, sin importar el modo declarado — así RRHH puede pedir el análisis sobre cualquier PDF que haya quedado en "Archivos Adicionales" (2026-09-16, ver Sprint 8 actualizado). No escribe nada en Drive.
  - **El prompt vive como un `Agent`** (`Agent.name = 'Revisor de Documentos (IA)'`, `createdBy: null`, `scope: 'RECLUTAMIENTO'`), no como una constante — editable desde `/admin/agents` (solo ADMIN) sin redeploy. Se autocrea con un criterio por defecto la primera vez que se usa (`ReclutamientoIaService.getDocumentReviewerInstructions`, se relee sin caché en cada análisis). Solo el CRITERIO (tono, reglas de confianza) es editable ahí — la lista de requisitos, el total de páginas y el contrato de salida en JSON los agrega siempre el código, para que un criterio mal editado degrade la respuesta pero nunca rompa el parseo.
  - **Gotcha de axios/Express con este endpoint específico:** el body original mandaba `null` (`api.post(url, null, {...})`), que axios serializa como el texto literal `"null"`. El `body-parser` de Express en modo estricto (el default) solo acepta objeto o array como JSON de nivel superior, así que rechazaba con 400 `Unexpected token 'n', "null" is not valid JSON` **antes** de llegar al controller — un bug invisible por curl sin body, solo reproducible mandando ese body exacto. Corregido mandando `{}` en vez de `null` desde `personal.service.ts`.
- `POST /personal/reclutamiento/candidatos/:folderId/aplicar-analisis` - RRHH confirmó/corrigió: parte el PDF en un archivo por documento (nombrados `"<Requisito> - <original>"`, el formato que reconoce `findMatchingFile`), conservando el original. Recibe **una lista de páginas** por documento, no un rango — la pantalla de revisión etiqueta miniatura por miniatura, así que un documento puede formarse con páginas no consecutivas (anverso/reverso separados) y aun así salir como un solo archivo. La traza va a `analisis-ia.json`, **nunca** a `candidato.json` (el portal de postulación lo reescribe desde cero y la borraría).
- `GET /personal/reclutamiento/candidatos/:folderId/pdf/:driveFileId` - Proxy del PDF para el visor del navegador; valida que el archivo pertenezca a esa carpeta.
- Requiere `GOOGLE_VERTEX_PROJECT` (+ `GOOGLE_VERTEX_LOCATION`, `GOOGLE_VERTEX_MODEL`). **Vertex AI no acepta API keys** — usa la misma service account de Drive con scope `cloud-platform`. Vacío = función deshabilitada, Reclutamiento sigue a mano.
- **Verificado contra Vertex real el 2026-09-16** (auth + PDF embebido + JSON estructurado, ubicó bien los documentos, y también en navegador real con Playwright: login → sync → abrir candidato → clic en ambos puntos de entrada → miniaturas renderizadas → 0 errores de consola). Modelo: `gemini-2.5-flash`, el más nuevo al que `agentes-504115` tiene acceso — **toda la serie Gemini 3.x devuelve 404 NOT_FOUND ahí**. ⚠️ **Google retira los Gemini 2.5 el 16/10/2026**: antes de esa fecha hay que conseguir acceso a 3.x y mover `GOOGLE_VERTEX_MODEL`.
- **Gotcha de entorno (recurrente en este repo, backend Y frontend):** al vivir bajo `Documents`/OneDrive, tanto `nest --watch` como el watcher de Vite pueden dejar de detectar cambios en archivos ya abiertos, sirviendo código viejo sin avisar. Si un fix "no aparece" (o un endpoint se comporta distinto a lo que dice el código), comparar el mtime de los archivos tocados contra la hora de arranque del proceso (`Get-Process -Id <pid> | select StartTime`) antes de sospechar del código — y reiniciar el proceso correspondiente si el archivo es más nuevo.

**Capacitaciones, Buzón de Quejas y Sugerencias, Encuestas (2026-09-15, ver `.agents/modules/recursos-humanos.md` puntos 8-10 para el detalle completo):**
- `GET/POST/PATCH/DELETE /personal/trainings`, `PATCH /personal/trainings/:id/completed`, `POST /personal/trainings/upload` (sube directo a Drive, no a disco), `POST/DELETE /personal/trainings/:id/attachments` - Capacitaciones, cumplimiento **general** (no por guardia). Carpeta de Drive **fija en código** (`HARDCODED_DRIVE_FOLDERS.CAPACITACIONES`); el listado abre Drive con "Ver carpeta". Guardias / archivo / administrativo siguen configurándose en cada listado (ver `.agents/modules/recursos-humanos.md` punto 12)
- `POST /personal/complaints` (abierto a cualquier empleado, sin `@Section`), `GET /personal/complaints` (RRHH), `PATCH /personal/complaints/:id/stage`, `GET/POST/PATCH/DELETE /personal/complaint-fields` - Buzón de Quejas y Sugerencias, con campos de formulario configurables por RRHH y gestión tipo Kanban
- `GET/POST /personal/surveys`, `GET /personal/surveys/:id/results`, `PATCH /personal/surveys/:id/public-link`, `GET /personal/surveys/pending/mine`, `GET/POST /personal/surveys/:id/respond` - Encuestas. Dos canales combinables: destinatarios con cuenta (respuestas identificadas, una sola vez) y **enlace público**
- `GET /public/surveys/:token`, `POST /public/surveys/:token/responses` - Encuesta por enlace público (`/encuesta/:token` en el frontend). **Únicos endpoints del módulo sin `AuthGuard` ni `SectionPermissionGuard`**, a propósito: los responde gente sin cuenta (proveedores, clientes, postulantes) desde el computador o el celular. El token aleatorio es la única credencial y el service solo devuelve título/descripción/preguntas. No agregarles guards: rompe el caso de uso (ver `.agents/modules/recursos-humanos.md` punto 10)

**Movimientos de Personal — entrada/salida de guardias (2026-09-09, reemplaza a "Verificación asistida" de Sprint 2; ver `.agents/modules/movimientos-personal.md`):**
- `GET/POST/PATCH/DELETE /personal/sistemas-verificacion` - Catálogo configurable de sistemas externos (IsyPlus, IESS, SUT, SICOSEP), ya sembrado para `companyId=1`. Sin página propia — se administra desde un modal dentro de `/rrhh/movimientos`
- `GET /personal/movimientos` (+ `/:id`), `POST /personal/movimientos/salida`, `PATCH /personal/movimientos/:id/items/:itemId` - Casos de entrada/salida por guardia, con checklist por sistema (snapshot del catálogo al crear el caso). **No** hay `POST .../entrada`: es un registro, no un alta manual — la entrada solo se crea sola
- Entrada: única vía es automática, se crea al contratar un candidato desde Reclutamiento (`DriveService.contratarCandidato()`, ver `.agents/modules/reclutamiento.md` Sprint 8.3 y `.agents/modules/movimientos-personal.md`). El Kanban de Candidatos que antes disparaba esto se eliminó por completo el 2026-09-17 (modelos, servicios, páginas — ver `.agents/modules/recursos-humanos.md` punto 2). Si la cédula ya existía pero esa persona había salido, se permite recontratar (abre un caso ENTRADA nuevo) en vez de bloquear. Salida: ícono + `ConfirmDialog` (modal propio, no `window.confirm`) en `GuardiasList.tsx` (sin formulario, usa los datos de la fila). Ambas son idempotentes (no duplican un caso ya abierto para la misma cédula)
- Contexto: el spike de `backend/scraping-poc/` concluyó que el scraping automatizado **no es viable** (WAF Incapsula + captcha en SICOSEP; login de empleador en SUT; datos abiertos solo agregados). La acción en el portal la hace una persona; el sistema guarda la traza. La vieja tabla `VerificationCheck` (log plano, sin dirección entrada/salida) se eliminó — sus datos, si existían, se migraron a un caso histórico por `(companyId, cedula)`.

**Revisión documental (Sprint 3):**
- `POST /personal/drive/documents/review` - Aprobar/rechazar un documento con motivo (obligatorio al rechazar, mínimo 5 caracteres). Acepta `documentTypeId` (fila del checklist) o `driveFileId` (archivo sin reconocer)
- `GET /personal/drive/documents/reviews/:cedula` - Estado de revisión actual por empleado
- `GET /personal/drive/documents/review-history?cedula=` - Traza append-only de aprobaciones/rechazos

**Reglas:**
- Modelos `DocumentReview` (estado actual) + `DocumentReviewHistory` (traza). Se separan de `EmployeeDocument` a propósito: `deleteEmployeeByCedula` borra los documentos y una re-subida genera un `driveFileId` nuevo, así que la traza no puede vivir ahí.
- `review.stale = true` cuando el archivo actual ya no es el que se revisó (rechazaron y volvieron a subir) → la UI pide nueva revisión.
- La traza **sobrevive** al borrado del empleado (sin FK, la relación es por cédula). Es deliberado: es un registro de auditoría.
- El match entre archivo y tipo de documento exige frase completa, todos los términos, o ≥60 % cuando son 3 o más; **cada archivo se asigna a un solo tipo**. Antes bastaba una palabra suelta y un archivo podía aparecer en varias filas del checklist.
- Estos 3 endpoints usan `SectionPermissionGuard` (sección RRHH), no `RolesGuard` - ver "Permisos por seccion".

### Ventas (`/ventas`) — CRM y Contratos
*Nota de nomenclatura:* el módulo cubre dos cosas separadas: CRM (leads, visitas, metas) y un subsistema de generación/firma de contratos a partir de plantillas `.docx`. El diseño detallado del subsistema de contratos vive en `backend/.agents/CONTRATOS-PLAN.md` (gitignored, local — léelo primero antes de tocar `ventas-templates.*`/`ventas-contratos.*`).

**CRM:**
- `GET/POST /ventas/leads`, `PATCH /ventas/leads/:id/status`, `POST /ventas/leads/:id/assign` - Prospectos
- `GET/POST /ventas/visitas`, `POST /ventas/visitas/:id/checkin`, `POST /ventas/visitas/:id/complete` - Visitas de campo con check-in geolocalizado
- `GET /ventas/dashboard`, `POST /ventas/goals` - Metas de venta por vendedor
- `POST /ventas/webhook/lead` - Ingesta de leads externos por API key (sin sesión)

**Plantillas (`/ventas/templates`):**
- `GET/POST/PATCH/DELETE /ventas/templates` - CRUD de plantilla (nombre, `driveUrl`, asunto/cuerpo de correo por defecto, numeración — ver abajo)
- `POST /ventas/templates/:id/download-drive` - Descarga el `.docx` desde el link de Drive/Google Doc a disco local (`uploads/templates/`)
- `POST /ventas/templates/:id/detect-variables` - Detecta variables `<<Var>>` o `[Var]` en el documento, incluyendo el formato "con espacio de nombres" `[Contrato.ID de Contrato]` (puntos, tildes, paréntesis, `/`)
- `POST /ventas/templates/:id/fields` - Guarda la configuración de campos (reemplaza todos). Tipos: `TEXT`, `NUMBER`, `DATE`, `EMAIL`, `CHECKBOX`, `DROPDOWN`, `SIGNATURE`, `TABLE`, `CONTRACT_NUMBER`. `isClientField` decide quién completa el campo (ver abajo). Para `TABLE`, `tableConfig` (`{ columns: [{key,label,type}], maxRows }`) define sus columnas. Para `DROPDOWN`, `dropdownOptions: String[]` (editable opción por opción en un sub-panel en `TemplateConfig.tsx`, igual que las columnas de `TABLE`) + `allowMultiple: Boolean`: si es `true`, el vendedor marca varias opciones (checkboxes en `ContratoForm.tsx`, valor guardado como arreglo, se inserta como lista con viñetas en el PDF); si es `false`, sigue siendo un `<select>` de una sola opción. `allowOther: Boolean` (2026-09-16) agrega una opción "Otro" que deja escribir texto libre, en ambos modos.
- Etiqueta por defecto de un campo detectado: no repite el espacio de nombres de la variable (`Contrato.ID de Contrato` → etiqueta por defecto "ID de Contrato", no el nombre completo) — se corrige en `TemplateConfig.tsx` `handleDetect()`.

**Numeración automática de contrato (2026-09-16):** un campo `CONTRACT_NUMBER` (a lo sumo uno por plantilla) no se muestra como editable en ningún formulario — `createContract` lo calcula solo a partir de `SalesTemplate.numberingPrefix`/`numberingDigits`/`numberingNext` (ej. `MEGAMONT-00001`), dentro de una transacción Prisma que incrementa `numberingNext` para evitar números duplicados si dos contratos se crean casi al mismo tiempo. El resultado también se guarda en `SalesContract.contractNumber` (se muestra en listas en vez de `#id`). Se configura por plantilla, en `TemplateConfig.tsx`, tarjeta "⚙ Numeración de contrato".

**Carpeta de Drive de contratos (2026-09-21):** raíz **fija en código** (`HARDCODED_DRIVE_FOLDERS.VENTAS_CONTRATOS` — `GET /personal/drive/config?type=VENTAS_CONTRATOS` la entrega; `POST` la rechaza). El listado `/ventas/contratos` tiene **"Ver carpeta"** que abre Drive; ya no hay tuerca ni `ContratosDriveConfigModal`. El sistema crea ahí una subcarpeta por plantilla la primera vez que hace falta (`SalesTemplate.driveFolderId`) y sube el PDF generado/enviado con un nombre descriptivo (`{contractNumber}_generado_{fecha}.pdf`, etc.) — best-effort: si el ID aún no está en código (ni hay fila de solo lectura) o falla, la generación/envío del contrato no se ve afectada. El PDF ya firmado llega al sistema por dos vías: automáticamente vía el webhook `POST /ventas/webhook/signwell` (evento `document_completed`, ver abajo) cuando `SIGNWELL_WEBHOOK_ID` está configurado, o a mano vía `POST /ventas/contratos/:id/documents/signed` (multipart, botón "📤 Subir PDF firmado" en `ContratoResult.tsx`) como respaldo — ambas terminan igual: guardan el archivo, lo suben a Drive si aplica, y marcan el contrato como `SIGNED`.

**Agrupamiento de campos por espacio de nombres (2026-09-16):** tanto en `ContratoForm.tsx` (llenar) como en `TemplateConfig.tsx` (configurar, agregado el mismo día) los campos cuya variable tiene un punto (ej. `Contrato.ID de Contrato`) se agrupan bajo un encabezado `"Campos de (Contrato)"`; los que no tienen punto van juntos bajo `"Otros"` (solo si hay alguno). Es solo de presentación — no afecta cómo se guardan ni se sustituyen las variables.

**Editar campos y regenerar (2026-09-16):** `ContratoForm.tsx` se reutiliza también en modo edición (ruta `/ventas/contratos/:contractId/editar`, botón "✏️ Editar campos" en `ContratoResult.tsx`, oculto una vez `status='SIGNED'`) — carga el contrato existente con `getContract`, y al guardar llama `PATCH /ventas/contratos/:id` (`updateContract`) en vez de crear uno nuevo, sin tocar el `status`. El botón "Generar PDF" en `ContratoResult.tsx` ya no se oculta fuera de `DRAFT` — está disponible en cualquier estado salvo `SIGNED`, y se relabelea a "🔄 Regenerar PDF" cuando ya existe un PDF, para que el ciclo editar → regenerar se pueda repetir.

**Contratos (`/ventas/contratos`):**
- `GET/POST/PATCH/DELETE /ventas/contratos` - CRUD de contrato (nombre/email de envío + `fieldValues`, donde una tabla se guarda como arreglo de filas y un `DROPDOWN` de selección múltiple como arreglo de opciones marcadas)
- `POST /ventas/contratos/:id/generate` - Fusiona `fieldValues` en el `.docx` de la plantilla y convierte a PDF con **LibreOffice headless** (`soffice --headless --convert-to pdf`, no HTML intermedio — preserva alineación/fuentes/imágenes del documento original; variable de entorno opcional `LIBREOFFICE_PATH`, instalado en `backend/Dockerfile` vía `apk add libreoffice`). Todo valor insertado (excepto tablas) se pone en negrita (`spliceBoldValue`, 2026-09-16 — ver `CONTRATOS-PLAN.md` punto 11 sobre por qué NO usa una regex sobre el archivo completo, eso colgaba el proceso contra el documento real). Un campo `TABLE` se inserta como tabla real de Word (OOXML `<w:tbl>`), no como texto — la variable debe estar sola en su propio párrafo en la plantilla. Sube el PDF a Drive si hay carpeta configurada (ver arriba).
- `POST /ventas/contratos/:id/send` - Envía a firma electrónica vía **SignWell** (2026-09-17, reemplaza a BoldSign — ver `CONTRATOS-PLAN.md` punto 8/11 para el porqué del cambio y el diagnóstico de los dos bugs reales que tenía la integración de BoldSign). `POST https://www.signwell.com/api/v1/documents` con header `X-Api-Key` (`SIGNWELL_API_KEY`), `test_mode` controlado por `SIGNWELL_TEST_MODE` (default `true`), y `text_tags: true` — cualquier campo `isClientField` que no sea `TABLE` (casilla, firma, iniciales, texto, fecha...) se embebió como un SignWell text tag (`{{...}}`) directo en el documento al generar el PDF, así que el cliente lo completa/firma **dentro del mismo documento** al momento de firmar, sin ningún link ni correo aparte (ver `CONTRATOS-PLAN.md` sección 8). `with_signature_page: true` solo se agrega cuando la plantilla no trae ninguno de esos tags. Guarda `signwellDocumentId`/`signwellStatus` en el contrato.
- `POST /ventas/webhook/signwell` - **Sin sesión** (SignWell llama directo). Verifica `event.hash` (HMAC-SHA256 de `"{event.type}@{event.time}"` con `SIGNWELL_WEBHOOK_ID` como llave — sin esa env var configurada, el evento se ignora) y, si es `document_completed`, descarga el PDF firmado (`GET /api/v1/documents/:id/completed_pdf`, con reintentos porque puede tardar unos segundos en estar listo) y marca el contrato `SIGNED`. `SIGNWELL_WEBHOOK_ID` se obtiene registrando el webhook a mano vía `POST /api/v1/hooks` una vez que exista una URL pública de callback (no se puede hacer en local) — hasta entonces, la subida manual de abajo es el único camino a `SIGNED`.
- `GET /ventas/contratos/file/:fileName` - Descarga protegida por sesión + pertenencia a la empresa (antes era pública, corregido 2026-09-10)
- `GET /ventas/contratos/:id/documents` - Historial de versiones del PDF (`SalesContractDocument`, tipos `GENERADO`/`ENVIADO`/`FIRMADO`) — cada generación/envío/firma queda registrado en vez de pisar el archivo anterior
- `POST /ventas/contratos/:id/documents/signed` - Sube a mano el PDF ya firmado (multipart, respaldo del webhook de arriba)
- `GET /ventas/contratos/public/:token`, `POST /ventas/contratos/public/:token/submit` - **Sin sesión**, protegidas solo por el token (`SalesContract.clientFillToken`, 24 bytes aleatorios). Página pública `/ventas/contratos/completar/:token`: cuando un campo `TABLE` está marcado `isClientField=true`, el cliente completa esa tabla aquí antes de que el vendedor genere/envíe el contrato — ninguna plataforma de firma soporta un campo nativo de "tabla con filas variables", por eso este paso vive en la app. Al enviar, el backend genera el PDF y lo manda a SignWell de inmediato (2026-09-17) y la respuesta trae `redirectToSign` — el cliente pasa de llenar la tabla a firmar en la misma visita, sin esperar un segundo correo (ver `CONTRATOS-PLAN.md` sección 8).

**Quién completa cada campo (`isClientField`):** con `false`, lo llena el vendedor en `ContratoForm.tsx` al crear el contrato (para `TABLE`, un editor de filas dinámico). Con `true`, un campo simple lo completa el firmante dentro del propio documento al momento de firmar (SignWell text tag); un campo `TABLE` lo llena el cliente antes, por el link público de arriba. Un campo `CONTRACT_NUMBER` nunca es editable por nadie — lo asigna el sistema (ver arriba).

**Reglas:**
- Multi-tenant por `companyId` como el resto de la app; super admin (`companyId: null`) no puede crear contratos directamente (`createContract` exige empresa).
- Los Anexos A/B/C (Equipos/Servicios/Contactos) que antes estaban hardcodeados en `ContratoForm.tsx`/`generatePdf` (2026-09-16) se eliminaron — el mecanismo genérico de campos `TABLE` los reemplaza para cualquier plantilla nueva.
- `PersonalModule` exporta `DriveService` y `VentasModule` lo importa (2026-09-16) para reutilizar el mismo cliente de Google Drive que usa RRHH — no crear un segundo cliente de Drive independiente para Ventas.
- `ContratoForm.tsx` ya no pide teléfono/empresa/RUC/dirección del cliente (2026-09-16) — la sección se renombró "Datos para el envío" y quedó solo con nombre y email, lo mínimo que necesita `sendContract` para mandar a firmar. Si una plantilla necesita esos datos, se configuran como campos normales (`Cliente.Teléfono`, etc.), no como un formulario fijo. Las columnas `SalesContract.clientPhone/clientCompany/clientRuc/clientAddress` siguen en el esquema (nadie las borra por ahora) pero ningún flujo del UI las escribe.

### Permissions (`/permissions`)
- `GET /permissions/my` - Secciones y permisos del usuario autenticado (cualquier usuario)
- `GET /permissions/sections/:companyId` - Secciones habilitadas de una empresa (solo ADMIN)
- `POST /permissions/sections/:companyId` - Habilitar secciones para una empresa (solo super admin)
- `GET /permissions/users/:companyId` - Permisos por usuario de una empresa (solo ADMIN)
- `POST /permissions/users/:userId` - Establecer `canView`/`canWrite` por seccion para un usuario (admin de esa empresa)

**Nota:** ver "Permisos por seccion" en Reglas de Negocio - esto es una segunda capa de autorizacion, independiente de `RolesGuard`.

### Companies (`/companies`)
- `GET /companies` - Listar empresas (solo ADMIN; si tiene companyId retorna su empresa)
- `GET /companies/mine` - Empresa del usuario autenticado (cualquier usuario)
- `GET /companies/slug/:slug` - Buscar empresa por slug (publico, para branding)
- `GET /companies/:id` - Detalle de empresa (solo ADMIN, restringe por companyId)
- `POST /companies` - Crear empresa (solo super admin, companyId=null)
- `PATCH /companies/:id` - Actualizar empresa (solo admin de esa empresa)
- `DELETE /companies/:id` - Eliminar empresa (solo super admin, companyId=null)
- `POST /companies/:id/logo` - Subir logo de empresa (solo admin de esa empresa)

## Credenciales de prueba

### Super Admin (todas las empresas)
- Contrasena: `admin2026`
- Super Admin: `admin@general.com` (ADMIN, companyId: null)

### GEMESEG (contrasena: `gemeseg2026`)
- Admin: `admin@gemeseg.com` (ADMIN)
- Manager: `hugo@gemeseg.com` (MANAGER - Gerente General)
- Employee: `marketing@gemeseg.com` (EMPLOYEE - Marketing Digital)
- Employee: `nayelli@gemeseg.com` (EMPLOYEE - Recursos Humanos)
- Employee: `sistemas@gemeseg.com` (EMPLOYEE - Sistemas, Leidy Barzola)

### Mikacao S.A. (contrasena: `mikacao2026`)
- Admin: `admin@mikacao.com` (ADMIN)

## LO QUE NO DEBES HACER

- Poner contrasenas en texto plano en la BD.
- Hacer commits directos a `main` sin PR.
- Usar `any` en TypeScript sin justificacion.
- Retornar contrasenas hasheadas en responses de la API.
- Crear endpoints sin validacion de DTOs.
- **Perder archivos de ramas existentes** - SIEMPRE hacer pull de main antes de crear ramas.
- Hacer push sin autorizacion del usuario.
- Hardcodear URLs de API en el frontend (usar `VITE_API_URL`).
- Usar archivos `.env` en produccion (usar Secret Manager / Firebase Hosting env vars).
- Crear endpoints sin RolesGuard cuando la accion requiere rol ADMIN.

## Vista movil

El layout base es de escritorio (`.sidebar` fija de 240px + `.main-content` con
`margin-left`). A partir de `@media (max-width: 768px)` (final de
`frontend/src/styles.css`) el sidebar pasa a ser un cajon deslizante
(`.sidebar-mobile-open`) con boton hamburguesa (`.sidebar-fab`) y fondo oscuro
(`.sidebar-backdrop`), y el contenido ocupa todo el ancho.

Reglas al crear pantallas nuevas:
- Nada de columnas laterales con `width` fijo sin clase `personal-split-aside`.
- En rejillas usar `minmax(min(Npx, 100%), 1fr)`, nunca `minmax(Npx, 1fr)`.
- Campos de formulario a 16px en movil: por debajo, iOS hace zoom al enfocar.
- Filas de botones: `flexWrap: 'wrap'` y objetivo tactil de ~40px.

## Preview en dispositivo

`./scripts/deploy-preview.sh [canal] [caducidad]` publica el frontend en un canal
temporal de Firebase Hosting y devuelve una URL publica para abrir en el telefono.
Requiere `npx firebase-tools login` en la maquina del desarrollador.
