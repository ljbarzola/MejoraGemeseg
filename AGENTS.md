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
- **IA:** Google Vertex AI (Gemini) — chat "Agente Gemeseg" y revisión de documentos de RRHH (ver `.agents/modules/agents-ai.md`). GitHub Models (`gpt-4o-mini`) se eliminó de todo el backend el 2026-09-29: el chat y `DocumentExtractionService` ("Leer con IA" de RRHH) usan Vertex AI.

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
- Un modulo por dominio: `auth`, `projects`, `users`, `tasks`, `ai`, `queue`, `tools`, `agents`, `companies`, `custodias`, `personal`, `ventas`, `notifications`.
- DTOs con `class-validator` para toda entrada.
- Guards por rol: `@Roles(UserRole.ADMIN)` + `RolesGuard`.
- En un controller, el id del usuario autenticado es `req.user.userId` (la estrategia JWT mapea `sub` a `userId`); `req.user.sub` no existe. El `companyId` y el `role` salen de `req.user` y se usan para filtrar datos.
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
- Modelos: `Company`, `User`, `Department`, `Role`, `CompanyLocation`, `Project`, `ProjectMember`, `Task`, `TaskAssignee`, `Tool`, `ToolAssignment`, `ToolAuditLog`, `Agent` (con `isDefault`), `UserAgent`, `Conversation`, `ChatMessage`, `AiLog`, `CompanyKnowledgeBase`, `Custodia`, `SalesGoal`, `ClientVisit`, `Lead`, `SalesApiKey`.
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
- **El repositorio de GitHub es PUBLICO** (`ljbarzola/MejoraGemeseg`). Nunca subir claves, `.env`, archivos de service account ni datos reales de personas o clientes, y revisar la visibilidad antes de subir una rama con trabajo que no deba verse.
- **Higiene de ramas (2026-10-14):** una rama ya fusionada se borra despues del merge (se conservan las 5 remotas mas recientes). No dejar trabajo en `git stash` a largo plazo: el 2026-10-05 un dia entero de cambios quedo olvidado en un stash. Las ramas viejas sin fusionar se archivan como etiqueta `archive/<nombre>` antes de borrarlas.
- **Limpieza despues de probar (2026-10-14):** las carpetas de trabajo extra (`git worktree`), las bases de datos de prueba (copias como `gemeseg_unificada`), los scripts y capturas temporales se **borran al terminar la prueba**. Solo se conservan los importantes o los de una funcion que **todavia tenga problemas** (y se anota cual y por que). **Cuidado en Windows:** una carpeta de trabajo puede tener `node_modules` como enlace (junction) hacia el proyecto principal; antes de borrarla quitar ese enlace con `rmdir` (no con borrado recursivo) y comprobar que las dependencias reales siguen completas.
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
JWT_SECRET=<un-secreto-largo-y-aleatorio>   # el de producción vive en Secret Manager y NO debe parecerse a ningún ejemplo
FRONTEND_URL=http://localhost:5173
# Opcionales — sin ellas, el chat "Agente Gemeseg" y la revisión de documentos de RRHH
# caen a modo mock / deshabilitado en vez de fallar (ver .agents/modules/agents-ai.md punto 1
# y la sección de Recursos Humanos más abajo):
GOOGLE_VERTEX_PROJECT=agentes-504115
GOOGLE_VERTEX_LOCATION=global          # los Gemini 3.x solo existen en `global`
GOOGLE_VERTEX_MODEL_FUERTE=gemini-3.8-flash       # documentos escaneados de RRHH (y el Agente de Ventas cuando se una a main)
GOOGLE_VERTEX_MODEL_LIGERO=gemini-3.5-flash-lite  # Agente Gemeseg + extracción de fechas (texto)
```
Bitácora del equipo (opcionales; sin ellas la lectura de Google responde con un mensaje claro y no falla): `GOOGLE_WORKSPACE_ADMIN_EMAIL` (administrador de Workspace que se impersona para leer los informes), `GMAIL_SERVICE_ACCOUNT_JSON` o el archivo `backend/google-service-account-mail.json` (la cuenta de **correo**, no la de Drive) y `BITACORA_GOOGLE_SOLO_EMAILS` (lista de correos separados por coma que limita la lectura a esas cuentas; solo para probar). Ver «Bitácora del equipo».

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

- ~~`POST /auth/register`~~ - **eliminado el 2026-10-14** (ver "Endurecimiento de seguridad" abajo): las cuentas las crea un administrador (`POST /users`).
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
- Es una sub-pantalla de Sistemas (`/sistemas/herramientas`), **no una seccion de permisos propia**: desde 2026-10-06 `TOOLS` ya no esta en `ALL_SECTIONS` (estaba huerfana: no gobernaba ninguna ruta y aparecia como fila aparte en Permisos usuarios). Las filas `UserPermission` `TOOLS` que ya existan en la base se ignoran.
- Acceso por la seccion `SISTEMAS` (`SectionPermissionGuard`): `view` para listar, `write` para crear/eliminar herramientas y asignaciones. Antes exigia rol ADMIN a secas y quien tenia Sistemas sin ser admin entraba a la pantalla y recibia 403 en todos sus datos. **Ojo:** el default de las secciones es permisivo (sin fila en `UserPermission` = acceso), asi que antes de desplegar conviene verificar en Permisos usuarios que solo el equipo de Sistemas tenga Sistemas activo.
- Asignaciones multiples de usuarios soportadas.
- Auditoria de cada accion (quien asigno/removio, cuando).

### Agentes de IA
- Solo ADMIN puede gestionar agentes (RolesGuard en AdminAgentsController).
- Cada agente tiene: nombre, instrucciones (system prompt), alcance (GLOBAL/PROJECTS/TASKS/ADMIN/VENTAS). Desde 2026-10-07 el alcance **sí se usa**: `VENTAS` es el perfil del **Agente de Ventas** (solo consultas de Ventas, investiga clientes); cualquier otro es el perfil general (Agente Gemeseg). Ver `.agents/modules/agents-ai.md` punto 3.
- El `agentId` que manda el chat se valida en cada mensaje: un agente propio o especializado exige estar asignado a la persona (o ser su creador), y el de Ventas además exige permiso de Ventas. El Agente de Ventas no aparece en el selector de quien no lo tenga asignado.
- Un agente puede estar asignado a multiples usuarios.
- Un usuario puede tener multiples agentes asignados.
- El agente global (createdBy: null) esta disponible para todos.
- Cada combinacion usuario+agente tiene sus propias conversaciones.

### Permisos por seccion (`/permissions`)
Existen **dos capas de autorizacion independientes**, no una sola:
1. **RolesGuard** (`@Roles(UserRole.ADMIN)`): rol grueso ADMIN/MANAGER/EMPLOYEE, por endpoint.
2. **Permisos por seccion** (`PermissionsService`, modulo `permissions`): gatea modulos completos (DASHBOARD, PROJECTS, ADMIN, CACAO, COMPANY_SETTINGS, COMPANIES, CUSTODIAS, RRHH, VENTAS, CONTRATACION_PUBLICA, SISTEMAS, BITACORA - ver `ALL_SECTIONS` en `permissions.service.ts`).

Reglas:
- Una seccion con `alwaysEnabled: true` (DASHBOARD, PROJECTS, ADMIN, SISTEMAS) esta siempre visible para toda empresa.
- **SISTEMAS es `alwaysEnabled` desde 2026-09-22, y tiene que seguir siendolo.** Herramientas y Agentes vivian sueltas en el menu como secciones siempre activas hasta que se agruparon dentro de Sistemas (`/sistemas/herramientas`, `/sistemas/agentes`, con redirects desde `/tools` y `/admin/agents`). Al publicarse, SISTEMAS quedo como seccion opt-in y **nadie la activo**, asi que el menu entero -- incluidas esas dos pantallas que antes eran siempre visibles -- desaparecio para toda empresa existente. Si se vuelve a poner en `false`, vuelve a pasar lo mismo.
- **Gerente (MANAGER) en las pantallas administrativas (2026-10-06):** ve **Administracion, Mi Empresa y Permisos usuarios en SOLO LECTURA**, por rol, sin depender de lo marcado por usuario en Permisos usuarios (`SECCIONES_VISTA_GERENTE` en `usePermissions.ts`; la empresa si debe tener `COMPANY_SETTINGS` habilitada). Backend: solo las lecturas aceptan `@Roles(ADMIN, MANAGER)` (`GET /users/stats`, `GET /users/locations`, `GET /permissions/sections/:id`, `GET /permissions/users/:id`); todo lo que escribe sigue siendo solo ADMIN. En Administracion el gerente no ve el panel de proyectos. El menu "Administracion" ya no se muestra a quien no sea ADMIN/MANAGER (antes se veia y la pagina lo devolvia al inicio).
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
4. **No existe fila → se permite** (default permisivo), **salvo en las secciones cerradas por defecto** (`SECCIONES_CERRADAS_POR_DEFECTO` en `permissions.service.ts`, hoy `SISTEMAS` y `BITACORA`): ahí sin fila NO hay acceso (2026-10-14; `BITACORA` desde 2026-10-27). Herramientas es una pantalla de Sistemas, no una sección aparte. Crear un ticket sigue abierto a cualquier usuario.

El punto 4 es deliberado y esta cubierto por un test: invertirlo dejaria fuera a todos los usuarios que hoy no tienen permisos explicitos cargados. Usar este guard (y no `RolesGuard`) es lo correcto cuando el acceso depende del modulo y no del cargo - p. ej. los usuarios de RRHH estan cargados como `EMPLOYEE` (`nayelli@gemeseg.com`), asi que un `@Roles(ADMIN, MANAGER)` los habria bloqueado.

**Ojo con el punto 4 al crear un usuario nuevo:** ese default permisivo es para usuarios *antiguos* sin filas cargadas — un usuario creado hoy **no** debería depender de él. Hasta 2026-09-29, `UsersService.create()` no creaba ninguna fila `UserPermission`, así que un usuario nuevo heredaba el default permisivo (acceso total) mientras `/admin/user-permissions` lo mostraba como si estuviera bloqueado. Ahora `create()` siembra filas explícitas (denegado para EMPLOYEE/MANAGER, permitido para ADMIN, excepto secciones fijas/siempre visibles) en la misma transacción — ver `.agents/modules/users.md` punto 1, incluido el script de backfill para las cuentas creadas antes de este fix.

### Empresas (White-labeling)
- **Super Admin** (`admin@general.com`, `companyId: null`): puede ver y gestionar todas las empresas.
- **Admin de empresa** (`admin@gemeseg.com`, `admin@mikacao.com`): solo gestiona su propia empresa.
- Cada empresa tiene: nombre, slug, logo, colores corporativos (primary, secondary, accent, bg, text), dominio de email.
- Los usuarios se asocian a una empresa via `companyId`.
- Los proyectos y datos se filtran por membresia, no por empresa (companyId esta en User, no en Project).
- El endpoint `GET /companies/mine` retorna la empresa del usuario autenticado.
- El endpoint `GET /companies/slug/:slug` es publico (para branding en login). La pantalla de login detecta el dominio del correo escrito y carga el tema de esa empresa; antes de eso no muestra ninguna marca (ver `.agents/RECOMENDACIONES_UX_UI.md` punto 1).
- **El logo se guarda en la tabla `StoredFile`** (`CompaniesService.uploadLogo`, clave `companies/logos/company-<id>-<hora>.<ext>`) y se sirve sin sesion en `GET /api/uploads/logos/:archivo` (`CompanyLogosController`; publico porque el login lo muestra antes de iniciar sesion). `Company.logoUrl` queda como `/uploads/logos/<archivo>`, que el frontend completa con la URL de la API (`resolveLogoUrl` de `ThemeContext`; toda pantalla que muestre un logo debe pasar por esa funcion). Al subir uno nuevo se borra el anterior. Hasta 2026-10-02 el codigo intentaba subirlo a Google Cloud Storage con `GCS_BUCKET`, pero esa variable nunca estuvo definida ni el paquete instalado, asi que **subir un logo en produccion lo reemplazaba por `/resources/logo.jpg`, un archivo que no existe**: la empresa quedaba sin logo. Si una empresa tiene ese valor en la base, hay que volver a subir su logo desde "Mi Empresa" (o dejar `logoUrl` en `NULL`, que usa `/resources/logo-<slug>.png`).

## Modulos Backend

### Auth (`/auth`)
- ~~`POST /auth/register`~~ - eliminado el 2026-10-14 (la ruta `/register` del frontend redirige al login)
- `POST /auth/login` - Login, retorna JWT. **Límite de intentos (2026-10-14):** 5 fallos por correo en 15 min bloquean ese correo 15 min (HTTP 429 con los minutos que faltan); un login correcto reinicia el contador. Lo mismo para `forgot-password/request` (cada solicitud cuenta, exista o no el correo, para no delatar cuentas y frenar el envío masivo de correos) y `change-password` (clave por usuario). Tabla `AuthAttempt` creada al arrancar (`auth-throttle.schema.ts`), falla abierto. Se usa el correo y no la IP porque no hay `trust proxy`; costo aceptado: alguien puede bloquear 15 min a otra persona.
- `GET /auth/profile` - Perfil del usuario autenticado
- **Endurecimiento de seguridad (2026-10-14).** (1) `PrismaService` oculta `User.password` en TODA consulta (`omit` global); solo `auth.service.ts` lo pide (`omit: { password: false }`). Antes `GET /users` devolvía los hashes de la empresa a cualquier empleado. (2) Se eliminó el registro público: bastaba un correo `@dominio` inventado para recibir sesión (y esos usuarios nacían con `companyId` nulo, que `GET /users` trataba como "todas las empresas"). (3) `GET /users` para EMPLOYEE devuelve solo `id, fullName, email, role, position, isActive, department`; ADMIN y Gerente ven la ficha completa; sin empresa y sin ser super admin → lista vacía. (4) `POST /permissions/users/:id` valida la misma empresa (403/404; antes 500). (5) `/tools` filtra por la empresa de quien llama (las asignaciones pertenecen a la empresa por la persona; `Tool` es catálogo compartido sin `companyId`, por eso borrar una herramienta que usan otras empresas da 409). (6) **Cambio de contraseña obligatorio para administradores** (`password-rotation.service.ts`): al arrancar se marca a los ADMIN activos, con contraseña y creados antes del 2026-10-15 con una fila de `UserPreference` (`seguridad:cambio-contrasena-2026-10`, clave que la API de preferencias del cliente no acepta) y se les cierran las sesiones; `GET /users/me` devuelve `debeCambiarContrasena` y el frontend muestra `ChangePasswordModal obligatorio` (sin X, Esc ni Cancelar) hasta que cambian la contraseña (`changePassword`/`confirmPasswordReset` la pasan a "hecha"). Para volver a probarlo en local: borrar esa fila y reiniciar el backend. (7) `SISTEMAS` cerrada por defecto (ver Permisos).
- `POST /auth/forgot-password/request` / `POST /auth/forgot-password/confirm` - Recuperar contraseña en dos pasos (código de 6 dígitos por correo)
- `POST /auth/change-password` - Cambiar contraseña con la sesión iniciada (JWT). Pide `currentPassword` + `newPassword` (mín. 8). Errores de validación = **400** (no 401: el frontend cierra la sesión ante cualquier 401 fuera de `/auth/`). Devuelve un token nuevo que el frontend guarda.
- **Cierre de sesiones (2026-10-06):** cambiar la contraseña desde el perfil o restablecerla con el código cierra las sesiones abiertas en otros dispositivos. Tabla `UserSessionCutoff (userId, validAfter)` (tabla aparte, no columna en `User`, porque el despliegue no corre migraciones; se crea sola al arrancar en `SessionCutoffService.onModuleInit`, SQL en `auth/session-cutoff.schema.ts`). `JwtStrategy.validate` rechaza con 401 un token cuyo `iat` sea anterior a `validAfter`. **Falla abierto** (sin tabla, sin fila o con error de BD el token se acepta) y nadie escribe el corte salvo esos dos flujos: mientras no cambien la contraseña, la sesión sigue abierta. Caché en memoria de 30 s por usuario (otra instancia de Cloud Run puede tardar hasta 30 s en enterarse). La duración del JWT (7 días) no cambió.

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
- `GET /tasks/my-tasks` - Tareas de "Mis tareas" en Inicio (`status`, `assignedToMe`, `projectId`). Solo trae tareas de proyectos donde la persona es **miembro** (`ProjectMember`); la tabla del proyecto (`GET /projects/:id/tasks`) no mira membresía.
- `GET /tasks/:id` - Detalle de tarea
- `PATCH /tasks/:id` - Actualizar tarea
- `DELETE /tasks/:id` - Eliminar tarea
- **Inicio — filtros guardados (2026-10-14).** Estado, "Asignadas a mí" y proyecto se recuerdan en `localStorage` (`dashboard_*`). Una tarea asignada "no aparecía" en ninguna pestaña porque el proyecto recordado seguía en la consulta aunque el desplegable (solo 10 proyectos, primera página) mostrara "Todos los proyectos". Ahora el desplegable carga **todas** las páginas de `GET /projects`, un proyecto recordado que ya no existe en la lista se descarta antes de pedir las tareas, y "Todos" se recuerda de verdad (antes volvía a "En progreso" al recargar). **Sin escoba de limpiar en Inicio (decisión del usuario, 2026-10-14):** los filtros son botones/selector siempre visibles y el filtro pegado ya se corrige solo; la escoba solo ensuciaba la barra. Inicio y la tabla "Tareas" del proyecto usan `useSortableTable` + `useResizableColumns` + "Columnas" (`mis-tareas`, `proyecto-tareas`). Inicio: columnas por defecto Estado, Prioridad, Proyecto, Asignados y Fin; "Inicio" y "Horas est." son opcionales (con las 8 no cabe); anchos fijos por columna (`.dashboard-tasks-table`), "Asignadas a mí" es un botón de activar y la fecha fin de una tarea abierta sale roja si venció y naranja si vence hoy o mañana (`fecha-vencida`/`fecha-pronto`). `STATUS_ORDER`/`PRIORITY_ORDER` viven en `frontend/src/types/task.ts`. `.status-badge` ya no parte «EN PROGRESO» en dos líneas (`white-space: nowrap`).
- **Recordatorios de vencimiento (código en `main` desde el PR #43; infraestructura de producción creada 2026-10-14).** Cada tarea con `endDate` crea por defecto un `TaskReminder` a 1 día antes (`daysBefore`: positivo = antes, 0 = mismo día, negativo = aviso único de atraso); se eligen en `ReminderPicker`. `POST /tasks/reminders-cron/run` (header `x-cron-secret` = `CRON_SECRET`; sin la variable responde 404; `?dryRun=true` solo lista) envía a cada asignado **un** correo (texto plano, desde `sistemas@gemeseg.com`, asunto con el prefijo fijo `[Tareas GEMESEG]` para que cada persona pueda filtrarlo en su Gmail; no cambiarlo sin avisar) y **una** notificación en la campana con todas sus tareas del día (máximo un correo al día por persona, decisión del usuario; si hay varias tareas van juntas), y **no manda correo a quien eligió "Solo notificaciones en la app" en su Perfil** (`notificaciones:recordatorios-tareas`, ver `.agents/modules/users.md` punto 3; `?dryRun=true` muestra `correo: true/false` por persona), ignora `DONE`/`CANCELLED` y reintenta si el envío falló. Mismo patrón que Entregas de Contratación Pública: Cloud Run con `min-instances=0` no sirve para `@Cron`, así que lo llama **Cloud Scheduler** una vez al día (~9:00 `America/Guayaquil`). **Ya creados en `mejora-gemeseg` (2026-10-14):** el secreto `CRON_SECRET` en Secret Manager (versión 2 activa; la 1 se desactivó porque `gcloud` imprimió la clave al crear el trabajo — al crear o actualizar un trabajo de Scheduler **no mostrar la salida**, trae el encabezado en claro) y el trabajo de Cloud Scheduler `tareas-recordatorios-diarios` (`0 9 * * *`, `America/Guayaquil`, POST a `https://mejora-gemeseg-backend-141953681725.us-central1.run.app/api/tasks/reminders-cron/run` con `x-cron-secret`, reintentos 2, plazo 180 s). `CRON_SECRET=CRON_SECRET:latest` ya está en `--set-secrets` de `cloudbuild.yaml`. La cuenta de Cloud Run (`141953681725-compute@developer.gserviceaccount.com`) ya tenía `secretAccessor` a nivel de proyecto: no hizo falta permiso por secreto. **REACTIVADO el 2026-10-23 por decisión de la usuaria** (estado ENABLED, primera corrida 2026-10-24 09:00 Guayaquil; el código ya estaba desplegado y un `dryRun` dio 1 persona con 1 tarea). Estuvo pausado desde 2026-10-14 (decisión del usuario) hasta que se desplegara esta rama: sin `CRON_SECRET` en la revisión de Cloud Run el endpoint responde 404, y con él pero sin el código nuevo saldrían correos con el formato viejo y sin la opción del Perfil. Reanudar con `gcloud scheduler jobs resume tareas-recordatorios-diarios --project=mejora-gemeseg --location=us-central1`. Ese mismo secreto activa también el endpoint de Contratación Pública, que sigue sin su propio trabajo de Scheduler. Para pausar: `gcloud scheduler jobs pause tareas-recordatorios-diarios --project=mejora-gemeseg --location=us-central1` (ojo: el `gcloud` local apunta por defecto a otro proyecto, `capacitaciongemeseg`; pasar siempre `--project`). **Probado en local el 2026-10-14 con correo real solo a `test@gemeseg.com`:** dos tareas el mismo día → un correo resumen; una tarea → correo individual; con "Solo notificaciones en la app" → sin correo y con notificación. La tabla `TaskReminder` se crea al arrancar (`task-reminder.schema.ts`, el despliegue no corre migraciones). No hay opción para que una persona desactive estos avisos.

### Users (`/users`)
- `POST /users` - Crear usuario (solo ADMIN). Desde 2026-09-29 también crea filas `UserPermission` explícitas para el usuario nuevo (denegado por defecto si es EMPLOYEE/MANAGER, permitido explícito si es ADMIN) — ver `.agents/modules/users.md` punto 1 para el bug que esto corrige
- `GET /users` - Listar usuarios (cualquier usuario autenticado)
- `GET /users/me` - Perfil del usuario autenticado (con herramientas asignadas y su teléfono)
- `PATCH /users/me` - La persona cambia SU teléfono (`User.phone`, columna creada al arrancar en `PrismaService`; el administrador también lo edita con `PATCH /users/:id`; ver `.agents/modules/users.md` punto 8)
- `GET /users/me/preferences/:key` / `PUT /users/me/preferences/:key` - Preferencia personal del propio usuario (claves `columnas:<tabla>` = lista de keys, y `notificaciones:<aviso>`, hoy solo `notificaciones:recordatorios-tareas`). Nunca la de otra persona (ver `.agents/modules/users.md` punto 3)
- `GET /users/stats` - Estadisticas (solo ADMIN)
- `GET /users/locations` / `POST /users/locations` - Catálogo de ubicaciones de la empresa (solo ADMIN, ver `.agents/modules/users.md` punto 2)
- `GET /users/:id` - Detalle de usuario (solo ADMIN)
- `PATCH /users/:id` - Actualizar usuario (solo ADMIN), incluye `locationId`
- `DELETE /users/:id` - Eliminar usuario (soft delete, solo ADMIN)

Backfill para usuarios ya existentes sin ninguna fila `UserPermission`: `npm run backfill:permissions` en `backend/` (dry-run por defecto, `--apply` para ejecutar) — ver `.agents/modules/users.md` punto 1.

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

### Chat IA (`/chat`) — "Agente Gemeseg"
- `POST /chat/message` - Enviar mensaje al asistente IA
- `GET /chat/conversations` - Listar conversaciones del usuario (filtro por agentId)
- `GET /chat/conversations/:id/messages` - Obtener mensajes de una conversacion
- Rate limit: 50 mensajes/dia por usuario (el Agente de Ventas tiene además su propio tope de 30/dia, acción `chat_message_ventas`)
- Motor: Google Vertex AI / Gemini (`GOOGLE_VERTEX_PROJECT`/`GOOGLE_VERTEX_LOCATION`/`GOOGLE_VERTEX_CHAT_MODEL`, este último separado de `GOOGLE_VERTEX_MODEL` que usa RRHH), con fallback a mock si no está configurado. Reemplaza a GitHub Models desde 2026-09-29 (ver `.agents/modules/agents-ai.md` punto 1).
- Rate limit: 50 mensajes/dia por usuario
- Motor: Google Vertex AI / Gemini (`GOOGLE_VERTEX_PROJECT`/`GOOGLE_VERTEX_LOCATION`/`GOOGLE_VERTEX_MODEL_FUERTE`/`GOOGLE_VERTEX_MODEL_LIGERO`: dos niveles de modelo compartidos con RRHH, ver `agents-ai.md` punto 4), con fallback a mock si no está configurado. Reemplaza a GitHub Models desde 2026-09-29 (ver `.agents/modules/agents-ai.md` punto 1).
- Intenciones sin dueño de sección (siempre ejecutables): `list_projects`, `count_tasks_by_status`, `user_info`, `project_summary`, `list_my_tasks`
- Intenciones con datos en vivo de otros módulos, gateadas por la misma lógica de `SectionPermissionGuard` **antes** de ejecutar la consulta (`AiService.canUseIntent`, ver `.agents/modules/agents-ai.md` punto 1): `cacao_resumen` (CACAO), `custodias_resumen` (CUSTODIAS), `rrhh_resumen_personal` (RRHH). Las consultas de **Ventas** (`ventas_*`) ya **no** las ejecuta Agente Gemeseg: las hace el Agente de Ventas (ver `agents-ai.md` punto 3); Agente Gemeseg solo explica cómo se usa el módulo y, si la persona tiene el Agente de Ventas asignado, la manda allá
- Base de Conocimiento institucional por empresa (`CompanyKnowledgeBase`, editable por el ADMIN desde `/sistemas/base-conocimiento`) se inyecta como contexto extra, recortada a las secciones que el usuario puede ver — ver `.agents/modules/agents-ai.md` punto 1

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

**Nota:** Todos los endpoints de Admin Agents requieren rol ADMIN (RolesGuard). El endpoint `GET /agents/available` es para cualquier usuario autenticado. El agente global por defecto se identifica por `Agent.isDefault = true` (ya no por `name` exacto) — el nombre visible pasó a ser "Agente Gemeseg" (antes "Agente GEMESEG"), ver `.agents/modules/agents-ai.md` punto 1.

### Base de Conocimiento (`/company-knowledge-base`)
- `GET /company-knowledge-base` - Leer el documento institucional Markdown de la empresa (solo ADMIN)
- `PUT /company-knowledge-base` - Guardarlo; responde `warnings` con encabezados `##` no reconocidos

Contexto adicional para "Agente Gemeseg", filtrado por sección de permisos antes de llegar al modelo. Pantalla: `/sistemas/base-conocimiento` (gateada como el resto de Sistemas). Detalle completo: `.agents/modules/agents-ai.md` punto 1.

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

**Hay dos remitentes, no uno.** El código de recuperación de contraseña sale siempre de `sistemas@gemeseg.com` (`AuthService.REMITENTE_CONTRASENA`), sin mirar la configuración de la empresa. Los recordatorios de cumplimiento y el resto sí usan el remitente de cada empresa (`NotificationConfig.senderEmail` + `senderName`, en "Configurar notificaciones" de Cumplimiento). `GMAIL_SENDER_ADDRESS` quedó solo como valor por defecto cuando un envío no trae casilla. Hasta 2026-09-22 el campo de la empresa se exigía pero no se usaba: todo salía desde la variable del servidor. Desde 2026-09-23 el código de contraseña volvió a `sistemas@` a propósito: si la empresa no tenía casilla configurada, el envío ni siquiera llegaba a Gmail y la pantalla igual decía que el código había salido. Como la delegación de dominio impersona a una persona concreta, `GmailMailService` cachea **un cliente por remitente**, no uno solo. Al guardar la configuración se valida la casilla contra Google sin enviar nada (`verificarRemitente`).

**La cuenta de correo NO es la de Drive.** La delegacion de dominio de Workspace se autoriza por `client_id`, y en GEMESEG se autorizo `correo-gemeseg-com@agentes-504115.iam.gserviceaccount.com` (client_id `115386168102739974811`), no `drive-sync@...`. Orden de busqueda de credenciales: `GMAIL_SERVICE_ACCOUNT_JSON` (produccion) -> `backend/google-service-account-mail.json` (local) -> la de Drive como ultimo recurso, avisando en el log. Si Google responde `unauthorized_client`, es que se esta usando la cuenta equivocada.

`GmailMailService.explicarErrorGoogle` traduce los errores de Google a algo accionable (delegacion no autorizada / casilla invalida / API deshabilitada), porque los mensajes crudos no dicen que configurar.

⚠️ **Pendiente de configuracion:** falta habilitar la **Gmail API** en el proyecto `agentes-504115` (numero 33331497230). Verificado el 2026-09-22: la delegacion funciona y las casillas `sistemas@` y `rrhh@` se impersonan bien, pero todo envio falla con 403 "Gmail API has not been used in project...". Es un clic en la consola de Google Cloud.

### Recursos Humanos (`/rrhh`)
- `GET/POST/DELETE /personal/reclutamiento/puestos` - Creación de vacantes y sincronización JSON con Drive
- `POST /personal/reclutamiento/sync` - Sincronización de candidatos postulados en Drive Reclutamiento (devuelve `tipoContratacion` y `modoSubida` por candidato)
- `POST /personal/reclutamiento/candidatos/:folderId/contratar` - Contratar: mueve la carpeta al destino que declara la vacante (`JobPosition.tipoContratacion`)
- `GET /personal/alerts` - Capacitaciones vencidas + por vencer. (Certificaciones se eliminaron por completo el 2026-09-22, tabla incluida: ver `.agents/modules/recursos-humanos.md` punto 4. No reintroducir `/personal/certifications`.)
- `GET /personal/guardias` - Padron de guardias (nombre + cedula), seccion RRHH. Las pantallas de RRHH usan **este**, no `/custodias/available-custodios`, que esta detras de la seccion CUSTODIAS y hacia fallar Listado de Guardias y Generar Documento con "No tienes acceso a CUSTODIAS" en empresas sin ese modulo (ver `.agents/modules/recursos-humanos.md` Endpoints). En "Mostrar fuera", la X (`DELETE /personal/drive/guardia/:cedula/lista`) quita al guardia de la lista y manda su carpeta a la papelera de Drive de su dueño (ver `.agents/modules/recursos-humanos.md` punto 7).
- `POST /personal/drive/sync-entidades` - Sincronizar Guardias (carpeta configurable). Reclutamiento, Capacitaciones y Contratos de ventas usan carpetas **fijas en código** (ver `.agents/modules/recursos-humanos.md` punto 12); cada listado tiene "Ver carpeta".
- `GET /personal/drive/compliance/:cedula` - Checklist de cumplimiento por cédula (incluye `review` por documento y `reviewSummary`)

**Destino de contratación y análisis del "archivo único" (2026-09-16, ver `.agents/modules/reclutamiento.md` Sprints 7-8 para el detalle completo):**
- `JobPosition.tipoContratacion` (`GUARDIA` | `ADMINISTRATIVO`, default `GUARDIA`) decide a qué carpeta raíz va el postulante al contratarlo. **Desde 2026-09-22 los dos buckets nombran IGUAL**: `Apellidos Nombres`, sin guion, sin cédula y sin puesto (`backend/src/modules/personal/utils/nombre-persona.util.ts`). La cédula y el puesto viven dentro de `candidato.json` / `datos.json`, que es de donde el sync resuelve la identidad. Mayúsculas y minúsculas valen igual: si el nombre ya es "Apellidos Nombres" y todavía no hay cédula en el JSON, igual entra al listado como "Sin cédula" (2026-09-23). La clave interna no se muestra ni se escribe en el JSON; en Datos personales la cédula, los apellidos, los nombres y el correo de contacto son editables, y ese correo es el de los recordatorios de cumplimiento. Contratar **renombra** la carpeta a ese formato en la misma llamada que la mueve. Las carpetas viejas (`Apellidos - Nombres`, `Apellidos Nombres - Cédula - Puesto`, `Nombre - Puesto`) **se siguen leyendo y sincronizando**; el sync solo avisa cuáles conviene renombrar a mano — **nunca renombra nada en Drive por su cuenta** (decisión explícita del usuario). Sin carpeta destino configurada, se bloquea sin mover nada. (Detalle completo: `.agents/modules/recursos-humanos.md` punto 13; formato de Entidades: punto 11.)
- `POST /personal/reclutamiento/candidatos/:folderId/analizar` (`?driveFileId=` opcional) - La IA **propone** qué documento requerido está en qué páginas de un PDF. **No está limitado a `modoSubida='archivo_unico'`**: sin `driveFileId` detecta el único PDF de la carpeta (el aviso morado del candidato); con `driveFileId` analiza ESE archivo puntual, sin importar el modo declarado — así RRHH puede pedir el análisis sobre cualquier PDF que haya quedado en "Archivos Adicionales" (2026-09-16, ver Sprint 8 actualizado). No escribe nada en Drive.
  - **El prompt vive como un `Agent`** (`Agent.name = 'Revisor de Documentos (IA)'`, `createdBy: null`, `scope: 'RECLUTAMIENTO'`), no como una constante — editable desde `/admin/agents` (solo ADMIN) sin redeploy. Se autocrea con un criterio por defecto la primera vez que se usa (`ReclutamientoIaService.getDocumentReviewerInstructions`, se relee sin caché en cada análisis). Solo el CRITERIO (tono, reglas de confianza) es editable ahí — la lista de requisitos, el total de páginas y el contrato de salida en JSON los agrega siempre el código, para que un criterio mal editado degrade la respuesta pero nunca rompa el parseo. Desde 2026-09-23 la palabra `confianza` del modelo no se usa tal cual: manda `probabilidad` 0-100 (alta solo desde 85 y con una frase visible; por debajo de 55 no se preseleccionan las páginas). Una propuesta ya guardada sigue con la etiqueta vieja hasta "Analizar de nuevo". La vista ampliada se puede acercar, alejar y arrastrar (ver `.agents/modules/reclutamiento.md`, nota de confianza). Si el postulante subió un archivo por documento, **Revisar con IA** (`POST .../revisar-archivos`) califica cada casilla con la misma escala y, en los adicionales, deja una frase de qué documento es.
  - **Gotcha de axios/Express con este endpoint específico:** el body original mandaba `null` (`api.post(url, null, {...})`), que axios serializa como el texto literal `"null"`. El `body-parser` de Express en modo estricto (el default) solo acepta objeto o array como JSON de nivel superior, así que rechazaba con 400 `Unexpected token 'n', "null" is not valid JSON` **antes** de llegar al controller — un bug invisible por curl sin body, solo reproducible mandando ese body exacto. Corregido mandando `{}` en vez de `null` desde `personal.service.ts`.
- `POST /personal/reclutamiento/candidatos/:folderId/aplicar-analisis` - RRHH confirmó/corrigió: parte el PDF en un archivo por documento (nombrados `"<Requisito> - <original>"`, el formato que reconoce `findMatchingFile`), conservando el original. Recibe **una lista de páginas** por documento, no un rango — la pantalla de revisión etiqueta miniatura por miniatura, así que un documento puede formarse con páginas no consecutivas (anverso/reverso separados) y aun así salir como un solo archivo. La traza va a `analisis-ia.json`, **nunca** a `candidato.json` (el portal de postulación lo reescribe desde cero y la borraría).
- `GET /personal/reclutamiento/candidatos/:folderId/pdf/:driveFileId` - Proxy del PDF para el visor del navegador; valida que el archivo pertenezca a esa carpeta.
- Requiere `GOOGLE_VERTEX_PROJECT` (+ `GOOGLE_VERTEX_LOCATION`, `GOOGLE_VERTEX_MODEL`). **Vertex AI no acepta API keys** — usa la misma service account de Drive con scope `cloud-platform`. Vacío = función deshabilitada, Reclutamiento sigue a mano. En producción las tres van en `cloudbuild.yaml`: `GOOGLE_VERTEX_PROJECT=agentes-504115`, `GOOGLE_VERTEX_LOCATION=us-central1`, `GOOGLE_VERTEX_MODEL=gemini-2.5-flash`. Ponerlas solo en la consola de Cloud Run no dura: `--set-env-vars` reemplaza todas las variables planas en cada deploy, y hasta el 2026-09-23 el yaml no las incluía, así que `app.gemeseg.com` volvía a "falta GOOGLE_VERTEX_PROJECT" después de cada subida.
- **Verificado contra Vertex real el 2026-09-16** (auth + PDF embebido + JSON estructurado, ubicó bien los documentos, y también en navegador real con Playwright: login → sync → abrir candidato → clic en ambos puntos de entrada → miniaturas renderizadas → 0 errores de consola). Modelo: `gemini-2.5-flash`, el más nuevo al que `agentes-504115` tiene acceso — **toda la serie Gemini 3.x devuelve 404 NOT_FOUND ahí**. ⚠️ **Google retira los Gemini 2.5 el 16/10/2026**: antes de esa fecha hay que conseguir acceso a 3.x y mover `GOOGLE_VERTEX_MODEL`.
- **Gotcha de entorno (recurrente en este repo, backend Y frontend):** al vivir bajo `Documents`/OneDrive, tanto `nest --watch` como el watcher de Vite pueden dejar de detectar cambios en archivos ya abiertos, sirviendo código viejo sin avisar. Si un fix "no aparece" (o un endpoint se comporta distinto a lo que dice el código), comparar el mtime de los archivos tocados contra la hora de arranque del proceso (`Get-Process -Id <pid> | select StartTime`) antes de sospechar del código — y reiniciar el proceso correspondiente si el archivo es más nuevo.

**Capacitaciones, Buzón de Quejas y Sugerencias, Encuestas (2026-09-15, ver `.agents/modules/recursos-humanos.md` puntos 8-10 para el detalle completo):**
- `GET/POST/PATCH/DELETE /personal/trainings`, `PATCH /personal/trainings/:id/completed`, `POST /personal/trainings/upload` (sube a la carpeta de esa capacitación en Drive, no a disco), `POST/DELETE /personal/trainings/:id/attachments` - Capacitaciones, cumplimiento **general** (no por guardia). Cada una crea carpeta: puntual en la raíz de Capacitaciones, anual dentro de `Anual` (se crea si no está). Si el nombre ya existe, 409 y la pantalla pregunta si se usa esa carpeta o se cambia el nombre. Carpeta raíz **fija en código** (`HARDCODED_DRIVE_FOLDERS.CAPACITACIONES`); el listado abre Drive con "Ver carpeta". Guardias / archivo / administrativo siguen configurándose en cada listado (ver `.agents/modules/recursos-humanos.md` punto 12)
- `POST /personal/complaints` (abierto a cualquier empleado, sin `@Section`), `GET /personal/complaints` (RRHH), `PATCH /personal/complaints/:id/stage`, `GET/POST/PATCH/DELETE /personal/complaint-fields` - Buzón de Quejas y Sugerencias, con campos de formulario configurables por RRHH y gestión tipo Kanban
- `GET/POST /personal/surveys`, `GET /personal/surveys/:id/results`, `PATCH /personal/surveys/:id/public-link`, `PATCH /personal/surveys/:id/recipients`, `PATCH /personal/surveys/:id/close`, `PATCH /personal/surveys/:id/reopen`, `GET /personal/surveys/pending/mine`, `GET/POST /personal/surveys/:id/respond` - Encuestas. Dos canales combinables: destinatarios con cuenta (respuestas identificadas, una sola vez) y **enlace público**. `reopen` vuelve a abrir una cerrada sin borrar respuestas (ver `.agents/modules/recursos-humanos.md` punto 10). Desde 2026-09-29, publicar una encuesta notifica de verdad a cada destinatario interno (correo + notificación in-app vía el módulo `notifications`) — antes solo se creaba la fila de destinatario sin avisarle a nadie (ver `.agents/modules/recursos-humanos.md` punto 20). Desde 2026-09-30 los resultados separan "por la app" (x de y destinatarios, con %) de "por el enlace" (solo cuántas llegaron), y `PATCH .../recipients` agrega/quita destinatarios **solo entre quienes aún no responden** (quien ya respondió no se quita; cerrada no se edita) — ver punto 21b.
- `GET /public/surveys/:token`, `POST /public/surveys/:token/responses` - Encuesta por enlace público (`/encuesta/:token` en el frontend). **Únicos endpoints del módulo sin `AuthGuard` ni `SectionPermissionGuard`**, a propósito: los responde gente sin cuenta (proveedores, clientes, postulantes) desde el computador o el celular. El token aleatorio es la única credencial y el service solo devuelve título/descripción/preguntas. No agregarles guards: rompe el caso de uso (ver `.agents/modules/recursos-humanos.md` punto 10)
- `PATCH /personal/surveys/:id` (`RRHH` write, 2026-10-08) - Edita título, descripción y preguntas de una encuesta **en cualquier estado** (borrador, publicada o cerrada). Las preguntas con `id` se actualizan, las nuevas se crean y las que ya no llegan **se eliminan junto con sus respuestas** (la pantalla avisa cuántas antes de confirmar). Una pregunta con respuestas no puede cambiar de tipo (solo pasar entre texto corto y texto largo). Destinatarios y enlace público siguen en sus endpoints. Detalle: `.agents/modules/recursos-humanos.md`.
- `DELETE /personal/contracts/:id` (`RRHH` write, 2026-10-08) - Elimina un documento generado de un guardia: la copia en Google Drive, el PDF en disco (solo es caché) y la fila. Si Drive falla por algo distinto a "ya no existe" no se borra nada. No se puede deshacer. Una plantilla solo se elimina si ya no tiene documentos. "Generar Documento" agrupa los campos por tema y sugiere con qué dato del guardia autocompletar cada variable (detalle en `.agents/modules/recursos-humanos.md`).
- `POST /personal/drive/personal-admin` (`RRHH` write) - Alta manual de personal administrativo: crea su carpeta "Apellidos Nombres" en Drive, la fila del listado y la ficha (con puesto). Cédula opcional (sin ella, clave interna `ID-<folderId>`). Botón "Nuevo" en `/rrhh/administrativo`. El puesto es un campo de texto libre de la ficha (`puesto`, `DEFAULT_FIELDS_BY_SCOPE.PERSONAL_ADMIN`) — ver `.agents/modules/recursos-humanos.md` punto 21c-d. Etapas de quejas: la primera etapa de una empresa queda siempre como inicial (punto 21a).

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

### Ventas (`/ventas`) — CRM, Contratos y Documentación
*Nota de nomenclatura (2026-10-07):* en el menú de Ventas hay siete piezas (la séptima, **Cotizador**, se describe justo debajo): **Posibles clientes** (antes «Leads»; en Google Ads siguen siendo «leads»; bandeja de contactos entrantes sin calificar, API `/ventas/entrantes`, URL `/ventas/leads`), **Directorio** (antes «Clientes», 2026-10-16; solo los DATOS de cada empresa o persona; abre con todos, sin filtros, y una «Relación» calculada (Cliente, En riesgo, Inactivo, Prospecto, Perdido); el responsable, la etapa y el seguimiento son de la oportunidad; «Inactivo» se llamaba «Ex-cliente» y su valor interno sigue siendo `EX_CLIENTE`; URL `/ventas/clientes`), **Oportunidades** (cada negociación de un servicio de un cliente) y las tres de abajo. Ver `.agents/modules/ventas-contratos.md` sección 13. En detalle, las otras tres: **Directorio** (la ficha), **Contratos** (el acuerdo comercial del cliente: servicios, vigencia y renovaciones — `SalesAgreement`, API `/ventas/acuerdos`), **Documentación** (nombres de pantalla, Directorio y panel «Cómo funciona»: `ventas-contratos.md` sección 17; generar y firmar documentos desde plantillas `.docx`; es lo que hasta esa fecha se llamaba "Contratos" — `SalesContract`, API `/ventas/contratos`, que **no se renombró**) y el CRM apagado (leads, visitas, metas). Un documento siempre es de un cliente y puede colgar de un contrato. Detalle y decisiones: `.agents/modules/ventas-contratos.md` sección 12. El diseño detallado del subsistema de contratos vive en `.agents/modules/ventas-contratos.md` (léelo primero antes de tocar `ventas-templates.*`/`ventas-contratos.*`).

**Cotizador (`/ventas/cotizador`, menú "Cotizador", 2026-10-15):** copia fiel del cotizador independiente (que sigue funcionando): catálogo con códigos `EQ-/MT-/SV-/INST-` asignados por el servidor (último + 1, nunca reutilizados; "borrar" solo desactiva), kits, plantillas, cotizaciones `COT-AAAAMMDD-NNNN` con el precio congelado por línea, descuento siempre antes del IVA (15 %), compartir (solo lectura) y edición total, PDF por impresión. Sección `VENTAS`; tablas `Cot*` creadas al arrancar (`cotizador.schema.ts`). Detalle, decisiones y lo que no se copió: `.agents/modules/ventas-cotizador.md`.

**CRM:**
- `GET/POST /ventas/leads`, `PATCH /ventas/leads/:id/status`, `POST /ventas/leads/:id/assign` - Prospectos **del módulo viejo** (tabla `Lead`, sin pantalla, no se usa; la bandeja nueva es `/ventas/entrantes`, abajo)
- `GET/POST /ventas/visitas`, `POST /ventas/visitas/:id/checkin`, `POST /ventas/visitas/:id/complete` - Visitas de campo con check-in geolocalizado
- `GET /ventas/dashboard`, `POST /ventas/goals` - Metas de venta por vendedor
- `POST /ventas/webhook/lead` - Ingesta de leads externos por API key (sin sesión) en la tabla vieja `Lead`, con reparto entre todos los usuarios de la empresa. **No se usa para los canales nuevos** (abajo).

**Clientes (`/ventas/clientes`):** ficha de cliente con campos personalizables por empresa (`SalesClientField`/`extra` Json) — hasta 2026-09-28 solo texto/número/fecha/booleano; ahora también `SELECT` (lista de opciones `{key,label}[]`, el valor guardado en `extra` es el `key` estable, el `label` se puede renombrar sin corromper datos ya guardados) y `TEXTAREA` (Observaciones, que antes era un `<textarea>` fijo fuera del sistema de campos). `email` es opcional (antes obligatorio): un referido recién llegado puede no tener correo todavía. `ClienteFormModal.tsx` renderiza TODOS los campos (núcleo + personalizados) genéricamente en un solo loop según `fieldType`, salvo Nombre que va fijo arriba — antes los núcleo (`fuente`, `servicio_requerido`) quedaban excluidos del formulario normal por error (el filtro solo pasaba campos no-núcleo).
- Un campo `SELECT` puede tener `allowOther: true` (2026-09-29, mismo patrón que `SalesTemplateField.allowOther` en Contratos): agrega una opción "Otro (especifique)" que cambia a un `<input>` de texto libre; el valor se guarda literal, sin prefijo — `fuente` lo trae activado por defecto. El checkbox "Permitir Otro" de "Campos" se respeta en **todos** los campos de lista, núcleo o no (2026-10-02): `ensureCoreFields` usa el valor de fábrica solo al crear el campo y ya no lo vuelve a imponer (antes lo pisaba en cada lectura, y en `fuente`/`servicio_requerido` el checkbox no hacía nada). Solo el formulario de Cliente ofrece "Otro"; el de "Referir un cliente" usa una lista simple.
- **Responsable vs. Referido por, dos conceptos distintos:** `assignedUserId`/`assignedUser` ("Responsable") es quién de Ventas atiende la venta — nadie lo asigna por otra persona, cada quien se auto-asigna/desasigna (`POST`/`DELETE /ventas/clientes/:id/asignarme`, `VENTAS` write). `referredByUserId`/`referredBy` ("Referido por") es a quién se le da crédito si la fuente es un referido — nunca editable por nadie, solo lo fija el servidor al crear vía `/referir`. `createdBy`/`creator` sigue siendo un tercer campo, puramente de auditoría (quién creó la fila). Un cliente creado a mano en Ventas se autoasigna como responsable al crearlo; uno creado vía `/referir` queda sin responsable hasta que alguien lo reclama.
- **Columnas de la tabla, configurables por cada usuario (2026-09-29; en la cuenta desde 2026-10-02):** `frontend/src/hooks/useColumnPreferences.ts` guarda qué columnas ve cada quien y en qué orden en **su cuenta** (modelo `UserPreference`, `GET/PUT /users/me/preferences/:key`; `localStorage` queda solo como caché para no parpadear y si el servidor falla). Nombre y Acciones siempre van. Se eligen desde el botón **"Columnas"** de la barra de filtros (`components/common/ColumnPickerMenu.tsx`, reutilizable): menú con casillas y asa ☰ para arrastrar; edita un borrador y la tabla solo cambia al pulsar **Aplicar** (clic fuera/Escape descarta). El ícono "Campos" quedó solo para configurar los campos de la ficha — no mezclar ambas cosas. Por defecto: Email, Teléfono, Etapa, Siguiente paso, Para cuándo, Responsable ("Referido por" y el resto, opcionales). "Editar cliente" muestra "Referido por" en solo lectura.
- `GET/POST /ventas/clientes/fields` (`VENTAS` view/write), `PATCH/DELETE /ventas/clientes/fields/:id` (`VENTAS` write) - CRUD de campos. El `GET` no lleva `@Section`: el formulario abierto de "Referir un cliente" necesita leer las opciones de "Servicio requerido" sin tener acceso a Ventas.
- `GET/POST/PATCH/DELETE /ventas/clientes(/:id)` (`VENTAS` view/write) - CRUD de cliente.
- **Fecha de ingreso editable (2026-10-02):** en ese momento la pantalla Leads estaba apagada y los prospectos se ingresaban en Clientes (desde 2026-10-07 existe la bandeja de Leads nueva; el ingreso manual de un cliente se conserva). `POST`/`PATCH /ventas/clientes` aceptan `fechaIngreso` (`YYYY-MM-DD`, no futura, validada contra el día de Ecuador UTC-5) y la guardan en `SalesClient.createdAt` a mediodía UTC (`parseFechaIngreso`/`fechaIngresoParaEditar` en `ventas-clientes.service.ts`; en edición solo se reescribe si el **día** cambió, para no perder la hora). No hay columna nueva: la tabla ("Fecha de ingreso"), los reportes de clientes nuevos por semana y "Estancados" ya leían `createdAt`, así que los meses anteriores cuentan solos. Los referidos no la tienen (la fecha real es la de envío).
- **Lista con subopciones (2026-10-05):** `fieldType: 'LISTA_SUBOPCIONES'`, reutilizable en cualquier campo nuevo. Lo usan Fuente y Servicio requerido. Se elige una opción (igual que `SELECT`: el `key` queda en `extra[clave]`, y `allowOther` sigue igual) y, si esa opción tiene `children`, aparecen casillas opcionales (varias a la vez). Las casillas se guardan en `extra[clave__sub]` como keys separadas por coma. `normalizarSubopciones` valida que pertenezcan a la opción elegida; vacío es válido; "Otro" con texto libre o una opción sin hijos no admite ninguna. Cambiar la opción en el formulario limpia las casillas. `ensureCoreFields` solo corrige `fieldType` (opciones, etiqueta y `allowOther` se conservan). Las subopciones de Fuente empiezan vacías y se cargan en Campos. Las de Servicio requerido siguen en `options[].children`; `ensureCoreFields` siembra `DEFAULT_SUBSERVICIOS` **solo en las opciones sin `children` definido** (una lista vacía `[]` no se vuelve a sembrar). El campo aparte `subservicios_requeridos` se elimina la primera vez que corre `ensureCoreFields`: el valor ya guardado se copia a `extra.servicio_requerido__sub` y la fila desaparece de Campos. `POST /ventas/clientes/referir` sigue aceptando `subserviciosRequeridos?: string[]` y lo guarda en esa misma clave.

**Referidos y pipeline de seguimiento (2026-09-29):** un referido NO es una entidad aparte — es un `SalesClient` más, distinguido por el campo núcleo `fuente` (`LISTA_SUBOPCIONES`, opciones iniciales Referido/Campaña/Otro, editables desde "Configuración de campos"; las subopciones de cada opción también). Se descartó una entidad `Referido` independiente construida un día antes: el pipeline de seguimiento (leído/cotizado/aceptado/rechazado) aplica a **todos** los clientes, vengan de donde vengan, así que vive en el propio `SalesClient` en vez de duplicar el CRM. Reglas: `SalesClientStage` (etapas editables por empresa, mismo patrón que `ComplaintStage` de RRHH — no un enum fijo), `SalesClient.referredByUserId` (solo lo fuerza el servidor en el endpoint abierto de abajo, nunca el body — es lo único que decide si se notifica a alguien en un cambio de etapa, no depende de qué diga "Fuente").
- `POST /ventas/clientes/referir` - **Sin `@Section`**: cualquier autenticado puede referir un cliente, tenga o no acceso a Ventas. Body `{nombre, celular?, correo?, servicioRequerido?, subserviciosRequeridos?, nota?}`; el servicio fuerza `extra.fuente='REFERIDO'` y `referredByUserId` del usuario autenticado, y usa la etapa `isInitial` de la empresa.
- `GET /ventas/clientes/mis-referidos` - **Sin `@Section`**: lo que el usuario actual ha referido y en qué etapa va (solo lectura, nunca expone montos ni comisión).
- `GET /ventas/clientes/stages` (sin `@Section`, para poblar combos), `POST/PATCH/DELETE /ventas/clientes/stages(/:id)` (`VENTAS` write) - CRUD de etapas; mismas reglas de integridad que `ComplaintStage` (una sola `isInitial` por empresa, no se borra la inicial sin reasignar). A diferencia de Quejas, borrar la última etapa restante con clientes en ella NO borra los clientes — los deja con `status: null` ("sin etapa"), porque un Cliente es una entidad de negocio real (puede tener contratos), no un ítem de pipeline descartable.
- `PATCH /ventas/clientes/:id/stage` (`VENTAS` write) - cambia de etapa y, si el cliente tiene `referredByUserId`, dispara una notificación in-app al referidor con `link: '/dashboard?abrirReferidos=1'` (ver módulo `notifications` abajo). **Desde 2026-10-20 NO se manda correo al referidor** (antes salía uno desde `sistemas@gemeseg.com`): decisión de la usuaria, solo campana. Ningún texto menciona comisión/porcentaje. Un fallo al notificar se registra en el servidor pero nunca revierte ni bloquea el cambio de etapa.
- **Validación de integridad de etapas (2026-09-29, replicada en `ComplaintStageService` de RRHH — mismo molde de etapas editables):** una etapa no puede ser inicial y final a la vez; la etapa inicial no puede tener `order` igual o mayor al de cualquier etapa final; no se puede quitar la marca de inicial a la única etapa inicial sin marcar otra antes. Corre dentro de una `$transaction` que revierte el cambio completo si no cuadra.
- Etapas por defecto (claves `RECIBIDO`/`LEIDO`/`COTIZADO`/`NEGOCIACION`/`ACEPTADO`/`RECHAZADO`, con etiquetas Nueva / En evaluación / Cotizada / En negociación / Aceptada / Perdida desde 2026-10-08; ver `.agents/modules/ventas-contratos.md` sección 14) y campos núcleo (`fuente`, `servicio_requerido`) se siembran de forma **perezosa** (`ensureDefaultStages`/`ensureCoreFields` en `VentasClientesService`) la primera vez que hacen falta — no hay backfill manual para empresas ya existentes.
- Frontend: tarjeta "¿Conoces a alguien interesado en Gemeseg?" en Inicio, debajo del banner (`ReferirClienteButton.tsx`, separada de "Mis tareas" a pedido del usuario). Un solo botón/modal con dos vistas — no hay página `/mis-referidos` (se quitó 2026-09-29): al abrir se ve la lista de lo que ya referiste, con un botón "+ Referir un cliente" que pasa a un formulario dentro del MISMO modal; al enviar, vuelve a la lista y ahí aparece el nuevo. Todo lo demás vive en la página ya existente `/ventas/clientes` — dos botones `.btn-secondary` con ícono + texto corto ("Etapas", "Campos"; 2026-09-29, revertido desde un primer intento con `.btn-icon-toolbar` sin texto — el usuario pidió que la palabra fuera visible para saber de qué configuración se trata) separados (no hay página `/ventas/referidos` separada).

**Contratos comerciales y servicios (2026-10-07, `VENTAS` view en GET / write en el resto):** las tablas (`SalesService`, `SalesAgreement`, `SalesAgreementService`, `SalesAgreementDocument`) se crean solas al arrancar (`ventas/sales-agreement.schema.ts`; el deploy no corre migraciones). El documento se cuelga del contrato con una tabla aparte, no con una columna nueva en `SalesContract`. **Tipo de documento (2026-10-19):** `SalesContract.documentType`/`documentTypeOther` (columnas nulas agregadas al arrancar en una transacción aparte, `SALES_CONTRACT_COLUMNS_DDL`; ver `ventas-contratos.md` sección 21). **Servicio vs. producto (2026-10-16):** `SalesAgreement.kind` = `SERVICIO` (vigencia, renovación, valor mensual) o `PRODUCTO` (venta única: estados «Por entregar» → «Entregado», garantía opcional, sin renovación; no cuenta en cartera ni retención). Se elige al crear; ver `.agents/modules/ventas-contratos.md` sección 16.
- `GET/POST /ventas/servicios`, `PATCH/DELETE /ventas/servicios/:id` - catálogo de servicios por empresa (se siembra con los sub-servicios de siempre; uno que está en algún contrato no se borra, se desactiva).
- `GET/POST /ventas/acuerdos`, `GET/PATCH/DELETE /ventas/acuerdos/:id` - contrato comercial (cliente obligatorio, `startDate`, `endDate` opcional, varios servicios, notas). Vigente / por vencer (30 días o menos) / vencido / por iniciar se **calculan** con las fechas; solo `ACTIVO`/`RENOVADO`/`CANCELADO` se guardan.
- `POST /ventas/acuerdos/:id/renovar` - crea el contrato siguiente del mismo cliente y deja el anterior `RENOVADO`.
- `POST /ventas/acuerdos/:id/documentos`, `DELETE /ventas/acuerdos/:id/documentos/:contractId` - colgar/quitar un documento de un contrato (mismo cliente).
- `POST /ventas/acuerdos/documentos/vincular-clientes` - enlaza documentos viejos sin cliente cuando el correo o el nombre coincide con un único cliente.
- Borrar un cliente que tiene contratos se rechaza. Sin alertas de vencimiento todavía.

**Leads, oportunidades, motivos y analítica (2026-10-07, ver `.agents/modules/ventas-contratos.md` sección 13):** tablas nuevas (`SalesLead`, `SalesOpportunity`, `SalesOpportunityService`, `SalesOpportunityStageChange`, `SalesReason`, `SalesReasonEntry`) creadas al arrancar por `VentasSchemaService` (bajo un candado de Postgres; SQL en `prisma/migrations/20261007_sales_pipeline/`); `SalesAgreement` ganó `monthlyValue`, `graceDays`, `cancelledAt` y `opportunityId`.
- `GET/POST /ventas/entrantes`, `GET/PATCH /ventas/entrantes/:id`, `POST :id/tomar`, `:id/soltar`, `:id/descartar` (motivo), `:id/convertir` - **Bandeja de Leads** (se llama `entrantes` porque `/ventas/leads` es del módulo viejo). Solo un lead de servicio se convierte, en cliente + oportunidad o sumando una oportunidad a un cliente que ya existe (detectado por correo, teléfono o RUC). Un cliente **nunca** vuelve a ser lead.
- `POST /ventas/webhook/entrante` (formulario web, clave en `X-API-KEY`, campo trampa `website`; el sitio debe llamarlo desde su servidor, nunca desde el navegador) y `POST /ventas/webhook/google-ads` (Google manda `google_key`; el botón de prueba no guarda nada) - **sin sesión**; los leads llegan sin asignar y se avisa en las notificaciones de la app a los de Ventas con «Escribir» explícito. Meta Ads **no** está conectado (pendiente). Claves: `SalesApiKey` (`GET/POST/DELETE /ventas/api-keys`), ahora con `randomBytes`.
- `GET/POST /ventas/oportunidades`, `GET/PATCH/DELETE :id`, `PATCH :id/etapa` - Oportunidades. `RECHAZADO` exige motivo; `COTIZADO` guarda monto y fecha. `SalesClient.status` es un espejo de la etapa de la oportunidad principal; `PATCH /ventas/clientes/:id/stage` sigue existiendo y delega en ella. El siguiente paso (seguimiento) se queda en el cliente.
- `GET/POST /ventas/motivos`, `PATCH/DELETE :id` - Catálogo de motivos de cierre por empresa (los de sistema no se tocan). Se exige motivo al descartar un lead, rechazar una oportunidad, cancelar un contrato (`POST /ventas/acuerdos/:id/cancelar`), explicar un vencido sin renovar (`:id/cierre`) y renovar o editar con menos servicios o menor valor.
- `GET /ventas/analitica/cartera|retencion|embudo|aceptacion|motivos|actividad` - Pestañas del dashboard (el «Resumen» sigue siendo `/ventas/clientes/dashboard`). Quien no es ADMIN/MANAGER solo ve lo suyo. Valores en dinero visibles para todo VENTAS (ver); «Mis referidos» y los avisos al referidor nunca llevan montos.
- Ciclo de vida del cliente (Prospecto / Cliente / En riesgo / Inactivo —antes «Ex-cliente»— / Perdido): **calculado**, viene como `ciclo` y `cicloRazones` en `GET /ventas/clientes`. Los días de gracia al vencer los fija cada contrato.

**Lead → Oportunidad → Cliente, embudo de marketing y ficha por pestañas (2026-10-08, ver `.agents/modules/ventas-contratos.md` sección 14):**
- **La etapa se cambia solo en Oportunidades.** El Directorio (antes Clientes) muestra a todos, solo con sus datos (desde 2026-10-16; antes ocultaba `PERDIDO` y `PROSPECTO` con una oportunidad abierta); el responsable y el siguiente paso son de la oportunidad; Aceptar una oportunidad ya vuelve Cliente a la persona (`contratoPendiente` = «Por contratar» hasta cargar su contrato). `GET /ventas/clientes` trae además `contratoPendiente` y `oportunidadesAbiertas`. La vista «Hoy» se divide: en Oportunidades, las personas con negociación abierta; en Clientes, las que no tienen ninguna abierta.
- `POST /ventas/clientes` acepta `yaEsCliente: true` («Nuevo cliente» → «Sí, ya es cliente»): crea la persona y una oportunidad `HISTORICO` ya Aceptada, excluida de la analítica de embudo y aceptación. Sin ese campo, la persona entra como oportunidad nueva (prospecto).
- Etapas de fábrica: `NEGOCIACION` es nueva y se agrega al arrancar (`VentasSchemaService.actualizarEtapasDeFabrica`) solo a las empresas con las cinco etapas originales sin tocar. Leads: sin estado nuevo; `CONVERTIDO` se etiqueta «Pasó a oportunidad» y el motivo de descarte «No contestó» es de sistema.
- `GET /ventas/analitica/marketing?agrupar=channel|campana|landing&canal=&desde=&hasta=&alcance=` - Embudo de marketing (Leads → Cotizaron → Contrataron) con las fases de Google Ads: cualificado = la oportunidad llegó a Cotizada (o En negociación), convertido = Aceptada (`ventas-marketing.util.ts`).
- `POST /ventas/webhook/entrante` acepta además `landing` (la dirección de la landing), `necesidad`, `consentimiento`, `pageUrl` y `utm_*`/`gclid`/`fbclid`/`li_fat_id` (se guardan en `SalesLead.extra`); también acepta los nombres en español de las landings (`nombre`, `correo`, `telefono`, `empresa`). El servicio y la línea comercial salen de la dirección (`lead-landing.util.ts`, tabla de 12 landings); el consentimiento se guarda `SI` o `NO_CONSTA` (nunca un «No» inventado). El canal se atribuye con `atribuirCanal` (`lead-atribucion.util.ts`). `GET /ventas/entrantes/:id` devuelve `serviciosSugeridos` (solo preselección al convertir). Las landings de WordPress (`gemeseg.com/landing/<slug>/`) ya capturan UTM, `gclid`, `fbclid` y el consentimiento, pero **todavía no llaman al webhook**: hoy un plugin de WordPress, «GEMESEG CRM Sync» (cola con reintentos que reacciona a `gemeseg_landing_lead_accepted`), manda los leads a una hoja por Apps Script. La versión 1.2.0 (fuera de este repo) manda al CRM con `X-API-KEY` y el id del lead como `externalId` si `wp-config.php` define `GEMESEG_CRM_URL` y `GEMESEG_CRM_KEY`; sin ellas sigue como antes.
- **Canales de un lead (2026-10-15):** un solo registro, `lead-canales.const.ts` (clave, etiqueta, grupo, datos propios, valor de «Fuente» del cliente y cómo se reconoce por clic o `utm_source`). `GET /ventas/entrantes/canales` lo entrega al frontend (`useCanalesLead`); sumar un canal nuevo es una entrada en esa lista. «Nuevo lead» exige la fuente y solo guarda los datos propios que esa fuente declara. Canales: Google Ads, Meta Ads, LinkedIn Ads, Formulario web, Referido, WhatsApp, Llamada, Correo e Ingreso manual.
- **Aviso a Google Ads (2026-10-15):** tabla `SalesConversionEvent` (creada al arrancar; SQL en `prisma/migrations/20261015_sales_conversion_events/`). Cuando la oportunidad de un lead **con `gclid`** llega a Cotizada o En negociación se registra `CUALIFICADO`, y al aceptarse `CONVERTIDO` (con el monto cotizado), una sola vez por oportunidad (`ventas-conversiones.service.ts`; nunca rompe el cambio de etapa). Estados: `PENDIENTE`, `ENVIADO`, `FALLO`, `VENCIDO` (clic de más de 90 días). `GET /ventas/conversiones/resumen` alimenta el panel de Conexiones. **El envío a Google está construido y apagado** (`google-ads-conversiones.*`, `POST /ventas/conversiones-cron/enviar` con `x-cron-secret`): se enciende desde Ventas → Configuración (IDs de Google Ads por empresa en `SalesSetting`; las variables `GOOGLE_ADS_*` solo son respaldo); usa la cuenta `ads-conversiones` por impersonación, sin claves (ver `.agents/modules/ventas-contratos.md` sección 15).
- **Configuración de Ventas (2026-10-15):** pantalla `/ventas/configuracion` para que cada empresa cambie sin tocar código su tabla de landings (dirección → servicio y línea comercial; línea blanca 2026-10-16: cada empresa tiene la suya y una nueva empieza vacía, a las que ya usaban Ventas se les copió la de Gemeseg al arrancar, `VentasSchemaService`), sus IDs de Google Ads y vea las conexiones y las fuentes. `GET /ventas/configuracion` y `PUT /ventas/configuracion/google-ads` y `/landings`: sin rol, basta la sección VENTAS (ver sí, guardar con «puede editar»), para que Ventas la maneje sin depender de Sistemas (2026-10-16). Tabla `SalesSetting` (`companyId` + `key` + `value` JSON; SQL en `prisma/migrations/20261015_sales_settings/`). Detalle en `.agents/modules/ventas-contratos.md` sección 15.
- `GET /ventas/clientes/:id/timeline` ahora lee los cambios de etapa de las **oportunidades** (cada uno con su oportunidad y servicio), más eventos de oportunidad nueva y de contrato comercial. «Reportes» se quitó del menú y es la pestaña «Resultados» de Planificación y Campo (sigue «Próximamente»).
- **Pendientes anotados** (aplazados por la usuaria): migración del modelo de IA antes del 16/10/2026 (afecta al chat y a RRHH), bandera de salud del arranque, conexión de Meta Ads, y conversación de salida a cargo de alguien que no sea el vendedor. Detalle en la sección 13 del módulo.

**Plantillas (`/ventas/templates`):**
- `GET/POST/PATCH/DELETE /ventas/templates` - CRUD de plantilla (nombre, `driveUrl`, asunto/cuerpo de correo por defecto, numeración — ver abajo)
- `POST /ventas/templates/:id/download-drive` - Descarga el `.docx` desde el link de Drive/Google Doc a disco local (`uploads/templates/`)
- `POST /ventas/templates/:id/detect-variables` - Detecta variables `<<Var>>` o `[Var]` en el documento, incluyendo el formato "con espacio de nombres" `[Contrato.ID de Contrato]` (puntos, tildes, paréntesis, `/`)
- `POST /ventas/templates/:id/fields` - Guarda la configuración de campos (reemplaza todos). Tipos: `TEXT`, `NUMBER`, `DATE`, `EMAIL`, `CHECKBOX`, `DROPDOWN`, `SIGNATURE`, `TABLE`, `CONTRACT_NUMBER`. `isClientField` decide quién completa el campo (ver abajo). Para `TABLE`, `tableConfig` (`{ columns: [{key,label,type}], maxRows }`) define sus columnas. Para `DROPDOWN`, `dropdownOptions: String[]` (editable opción por opción en un sub-panel en `TemplateConfig.tsx`, igual que las columnas de `TABLE`) + `allowMultiple: Boolean`: si es `true`, el vendedor marca varias opciones (checkboxes en `ContratoForm.tsx`, valor guardado como arreglo, se inserta como lista con viñetas en el PDF); si es `false`, sigue siendo un `<select>` de una sola opción. `allowOther: Boolean` (2026-09-16) agrega una opción "Otro" que deja escribir texto libre, en ambos modos.
- Etiqueta por defecto de un campo detectado: no repite el espacio de nombres de la variable (`Contrato.ID de Contrato` → etiqueta por defecto "ID de Contrato", no el nombre completo) — se corrige en `TemplateConfig.tsx` `handleDetect()`.

**Numeración automática de contrato (2026-09-16):** un campo `CONTRACT_NUMBER` (a lo sumo uno por plantilla) no se muestra como editable en ningún formulario — `createContract` lo calcula solo a partir de `SalesTemplate.numberingPrefix`/`numberingDigits`/`numberingNext` (ej. `MEGAMONT-00001`), dentro de una transacción Prisma que incrementa `numberingNext` para evitar números duplicados si dos contratos se crean casi al mismo tiempo. El resultado también se guarda en `SalesContract.contractNumber` (se muestra en listas en vez de `#id`). Se configura por plantilla, en `TemplateConfig.tsx`, tarjeta "⚙ Numeración de contrato".

**Carpeta de Drive de contratos (2026-09-21):** raíz **fija en código** (`HARDCODED_DRIVE_FOLDERS.VENTAS_CONTRATOS` — `GET /personal/drive/config?type=VENTAS_CONTRATOS` la entrega; `POST` la rechaza). El listado de Documentación (`/ventas/documentacion`) tiene **"Ver carpeta"** que abre Drive; ya no hay tuerca ni `ContratosDriveConfigModal`. El sistema crea ahí una subcarpeta por plantilla la primera vez que hace falta (`SalesTemplate.driveFolderId`) y sube el PDF generado/enviado con un nombre descriptivo (`{contractNumber}_generado_{fecha}.pdf`, etc.) — best-effort: si el ID aún no está en código (ni hay fila de solo lectura) o falla, la generación/envío del contrato no se ve afectada. El PDF ya firmado llega al sistema por dos vías: automáticamente vía el webhook `POST /ventas/webhook/signwell` (evento `document_completed`, ver abajo) cuando `SIGNWELL_WEBHOOK_ID` está configurado, o a mano vía `POST /ventas/contratos/:id/documents/signed` (multipart, botón "📤 Subir PDF firmado" en `ContratoResult.tsx`) como respaldo — ambas terminan igual: guardan el archivo, lo suben a Drive si aplica, y marcan el contrato como `SIGNED`.

**Agrupamiento de campos por espacio de nombres (2026-09-16):** tanto en `ContratoForm.tsx` (llenar) como en `TemplateConfig.tsx` (configurar, agregado el mismo día) los campos cuya variable tiene un punto (ej. `Contrato.ID de Contrato`) se agrupan bajo un encabezado `"Campos de (Contrato)"`; los que no tienen punto van juntos bajo `"Otros"` (solo si hay alguno). Es solo de presentación — no afecta cómo se guardan ni se sustituyen las variables.

**Editar campos y regenerar (2026-09-16):** `ContratoForm.tsx` se reutiliza también en modo edición (ruta `/ventas/documentacion/:contractId/editar`, botón "✏️ Editar campos" en `ContratoResult.tsx`, oculto una vez `status='SIGNED'`) — carga el contrato existente con `getContract`, y al guardar llama `PATCH /ventas/contratos/:id` (`updateContract`) en vez de crear uno nuevo, sin tocar el `status`. El botón "Generar PDF" en `ContratoResult.tsx` ya no se oculta fuera de `DRAFT` — está disponible en cualquier estado salvo `SIGNED`, y se relabelea a "🔄 Regenerar PDF" cuando ya existe un PDF, para que el ciclo editar → regenerar se pueda repetir.

**Documentos (API `/ventas/contratos`, pantalla "Documentación" en `/ventas/documentacion`; `createContract` exige `salesClientId` desde 2026-10-07):**
- `GET/POST/PATCH/DELETE /ventas/contratos` - CRUD de contrato (nombre/email de envío + `fieldValues`, donde una tabla se guarda como arreglo de filas y un `DROPDOWN` de selección múltiple como arreglo de opciones marcadas)
- `POST /ventas/contratos/:id/generate` - Fusiona `fieldValues` en el `.docx` de la plantilla y convierte a PDF con **LibreOffice headless** (`soffice --headless --convert-to pdf`, no HTML intermedio — preserva alineación/fuentes/imágenes del documento original; variable de entorno opcional `LIBREOFFICE_PATH`, instalado en `backend/Dockerfile` vía `apk add libreoffice`). Todo valor insertado (excepto tablas) se pone en negrita (`spliceBoldValue`, 2026-09-16 — ver `.agents/modules/ventas-contratos.md` punto 11 sobre por qué NO usa una regex sobre el archivo completo, eso colgaba el proceso contra el documento real). Un campo `TABLE` se inserta como tabla real de Word (OOXML `<w:tbl>`), no como texto — la variable debe estar sola en su propio párrafo en la plantilla. Sube el PDF a Drive si hay carpeta configurada (ver arriba).
- `POST /ventas/contratos/:id/send` - Envía a firma electrónica vía **SignWell** (2026-09-17, reemplaza a BoldSign — ver `.agents/modules/ventas-contratos.md` punto 8/11 para el porqué del cambio y el diagnóstico de los dos bugs reales que tenía la integración de BoldSign). `POST https://www.signwell.com/api/v1/documents` con header `X-Api-Key` (`SIGNWELL_API_KEY`), `test_mode` controlado por `SIGNWELL_TEST_MODE` (default `true`), y `text_tags: true` — cualquier campo `isClientField` que no sea `TABLE` (casilla, firma, iniciales, texto, fecha...) se embebió como un SignWell text tag (`{{...}}`) directo en el documento al generar el PDF, así que el cliente lo completa/firma **dentro del mismo documento** al momento de firmar, sin ningún link ni correo aparte (ver `.agents/modules/ventas-contratos.md` sección 8). `with_signature_page: true` solo se agrega cuando la plantilla no trae ninguno de esos tags. Guarda `signwellDocumentId`/`signwellStatus` en el contrato.
- `POST /ventas/webhook/signwell` - **Sin sesión** (SignWell llama directo). Verifica `event.hash` (HMAC-SHA256 de `"{event.type}@{event.time}"` con `SIGNWELL_WEBHOOK_ID` como llave — sin esa env var configurada, el evento se ignora) y, si es `document_completed`, descarga el PDF firmado (`GET /api/v1/documents/:id/completed_pdf`, con reintentos porque puede tardar unos segundos en estar listo) y marca el contrato `SIGNED`. `SIGNWELL_WEBHOOK_ID` se obtiene registrando el webhook a mano vía `POST /api/v1/hooks` una vez que exista una URL pública de callback (no se puede hacer en local) — hasta entonces, la subida manual de abajo es el único camino a `SIGNED`.
- `GET /ventas/contratos/file/:fileName` - Descarga protegida por sesión + pertenencia a la empresa (antes era pública, corregido 2026-09-10)
- `GET /ventas/contratos/:id/documents` - Historial de versiones del PDF (`SalesContractDocument`, tipos `GENERADO`/`ENVIADO`/`FIRMADO`) — cada generación/envío/firma queda registrado en vez de pisar el archivo anterior
- `POST /ventas/contratos/:id/documents/signed` - Sube a mano el PDF ya firmado (multipart, respaldo del webhook de arriba)
- `GET /ventas/contratos/public/:token`, `POST /ventas/contratos/public/:token/submit` - **Sin sesión**, protegidas solo por el token (`SalesContract.clientFillToken`, 24 bytes aleatorios). Página pública `/ventas/contratos/completar/:token` (esta URL de frontend se conserva con el nombre viejo a propósito: los links ya enviados a clientes no se pueden romper): cuando un campo `TABLE` está marcado `isClientField=true`, el cliente completa esa tabla aquí antes de que el vendedor genere/envíe el contrato — ninguna plataforma de firma soporta un campo nativo de "tabla con filas variables", por eso este paso vive en la app. Al enviar, el backend genera el PDF y lo manda a SignWell de inmediato (2026-09-17) y la respuesta trae `redirectToSign` — el cliente pasa de llenar la tabla a firmar en la misma visita, sin esperar un segundo correo (ver `.agents/modules/ventas-contratos.md` sección 8).

**Quién completa cada campo (`isClientField`):** con `false`, lo llena el vendedor en `ContratoForm.tsx` al crear el contrato (para `TABLE`, un editor de filas dinámico). Con `true`, un campo simple lo completa el firmante dentro del propio documento al momento de firmar (SignWell text tag); un campo `TABLE` lo llena el cliente antes, por el link público de arriba. Un campo `CONTRACT_NUMBER` nunca es editable por nadie — lo asigna el sistema (ver arriba).

**Reglas:**
- Multi-tenant por `companyId` como el resto de la app; super admin (`companyId: null`) no puede crear contratos directamente (`createContract` exige empresa).
- Los Anexos A/B/C (Equipos/Servicios/Contactos) que antes estaban hardcodeados en `ContratoForm.tsx`/`generatePdf` (2026-09-16) se eliminaron — el mecanismo genérico de campos `TABLE` los reemplaza para cualquier plantilla nueva.
- `PersonalModule` exporta `DriveService` y `VentasModule` lo importa (2026-09-16) para reutilizar el mismo cliente de Google Drive que usa RRHH — no crear un segundo cliente de Drive independiente para Ventas.
- `ContratoForm.tsx` ya no pide teléfono/empresa/RUC/dirección del cliente (2026-09-16) — la sección se renombró "Datos para el envío" y quedó solo con nombre y email, lo mínimo que necesita `sendContract` para mandar a firmar. Si una plantilla necesita esos datos, se configuran como campos normales (`Cliente.Teléfono`, etc.), no como un formulario fijo. Las columnas `SalesContract.clientPhone/clientCompany/clientRuc/clientAddress` siguen en el esquema (nadie las borra por ahora) pero ningún flujo del UI las escribe.

### Notificaciones (`/notifications`) — 2026-09-28
Bandeja de notificaciones in-app genérica, primera vez que existe algo así en el repo (antes solo había correo). No es exclusiva de Referidos — cualquier módulo puede llamar a `NotificationsService.create()` para avisarle algo a un usuario concreto. Sin bandeja de notificaciones no había ningún canal in-app; ahora hay un ícono de notificaciones (campana) fijo arriba a la derecha en toda pantalla protegida (`NotificationsBell.tsx`) que sondea el contador cada 60s (no hay WebSockets en el repo).
- `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` - Todas sin `@Section`: es una bandeja personal, cada usuario solo ve/marca las suyas.
- Consumidores actuales: Referidos (ventas), Encuestas (publicar y agregar destinatarios) y **Reportar a Sistemas** (2026-09-30): el reportante recibe aviso en las notificaciones de la app al enviar su reporte y cuando pasa a En revisión y a Resuelto — solo in-app, nunca correo. Ver `.agents/modules/recursos-humanos.md` punto 21f.
- **Novedades de la app** (2026-10-02): `SistemasService.publicarNovedad` crea una notificación por destinatario — solo in-app, nunca correo. Ver sección Sistemas.

**Agentes que trabajan solos (2026-10-18):** Sistemas → Agentes también muestra al Agente Revisor de Bitácoras (no conversa), qué hace y qué ha hecho (`GET /admin/agents/docs|runs|runs/summary`, tabla `AgentRun`). Ver `.agents/modules/agents-ai.md` punto 5.

### Sistemas (`/sistemas/*`) — 2026-10-02
Sección `SISTEMAS` (`alwaysEnabled`, se puede negar por usuario). Soporte Técnico (tickets `TicketSoporte`), Herramientas, Agentes y Base de Conocimiento tienen su detalle en sus propios apartados; el aviso al reportante de un ticket está en `.agents/modules/recursos-humanos.md` punto 21f. **Aviso al equipo (2026-10-06):** al crear un ticket (`POST /sistemas/tickets`) se notifica en la campana (nunca correo) solo a quien tenga **`SISTEMAS` marcado con "Escribir" de forma explicita en Permisos usuarios**, de cualquier empresa, excepto al reportante (`PermissionsService.getUsersWithExplicitSectionWrite`). A proposito NO usa el default permisivo del guard (sin fila = acceso): quien no tiene fila no aparece marcado en esa pantalla y avisarle seria avisar a gente que nadie eligio. Enlace `/sistemas/soporte`; los super admin quedan fuera porque la notificacion exige empresa. Se registra en el log cuantas personas se avisaron. Esta sección recoge lo agregado el 2026-10-02:
- **KPIs del dashboard** — `GET /sistemas/dashboard/stats` (`SISTEMAS` view) devuelve, además de los 4 conteos, `porTipo` (ERROR/MEJORA/PERMISO/OTRO), `tiempoPromedioResolucionHoras` (promedio de `resueltoAt − createdAt` de los tickets en `RESUELTO`; `null` si no hay ninguno) y `ticketsConResolucion`. **Decisión del usuario: un solo tiempo general, no por tipo.** El dashboard lo muestra con una dona SVG propia (`components/common/DonutChart.tsx`, colores validados con el skill `dataviz`; no hay librería de gráficos en el proyecto) y tarjetas de estado sin íconos — el usuario pidió gráficos en lugar de íconos/emoji en los KPIs. No hay migración: usa `resueltoAt`, que ya existía. Un ticket que se reabre pierde `resueltoAt` (`updateEstado`) y sale del promedio hasta que se vuelva a resolver. **No** se mide "tiempo hasta pasar a En revisión": no se guarda esa fecha (el usuario pidió solo tiempo de resolución). Mismo filtro de empresa que los conteos previos (`companyId` del usuario); `findAll` de tickets sigue listando todas las empresas — inconsistencia heredada, sin tocar.
- **Novedades de la app** (`/sistemas/novedades`, modelo `NovedadApp`, migración `20261002_novedades_app`). **El despliegue no corre migraciones**, así que `SistemasService.onModuleInit` crea la tabla sola al arrancar (`novedad-app.schema.ts`, mismo patrón que `UserPreference`); sin eso la pantalla daba "No se pudieron cargar las novedades" (pasó en local, y habría pasado en producción). Recomendación pendiente: un paso de migraciones en `cloudbuild.yaml` en vez de repetir este patrón. Sistemas publica a mano un aviso de cambio (título, "Qué cambió", módulos afectados). Decisiones del usuario: **se publica a mano** (no se deriva de tickets), **llega solo por la campana, nunca por correo**, y **solo a quienes tienen acceso a alguno de los módulos marcados**.
  - Endpoints (`sistemas-config.controller.ts`): `GET /sistemas/novedades/secciones` (view), `GET /sistemas/novedades` (view, historial), `GET /sistemas/novedades/preview?secciones=A,B` (write, devuelve `destinatarios`, la lista `personas` (nombre, correo, empresa) y `noRecibiran` con el **motivo** de cada exclusión — decisión del usuario: ver **quiénes** la reciben y por qué faltan los demás, no solo cuántas; el historial guarda solo el conteo). Motivos: es quien publica, super admin (sin empresa), cuenta inactiva, módulo negado en sus permisos o módulo no activo en su empresa (`PermissionsService.evaluarAccesoSecciones`), `POST /sistemas/novedades` (write).
  - Destinatarios: `PermissionsService.getUsersWithSectionAccess(secciones, excluirUserId)` — misma regla que `hasSectionAccess` pero en lote: la empresa tiene la sección habilitada (`alwaysEnabled` o fila en `CompanySection`) y el usuario no la tiene negada (sin fila en `UserPermission` = tiene acceso; sección fija para todos no se puede negar). Se excluye a quien publica y a usuarios inactivos. **Los super admin (`companyId` null) no reciben nada**: `Notification.companyId` es obligatorio.
  - Cada aviso lleva `title: "Novedad: <título>"`, `message` = descripción completa y `link: '/dashboard'`. Un fallo con un destinatario se registra y no frena a los demás ni la publicación. `NovedadApp.destinatarios` guarda cuántos eran. Sin FK a `User` a propósito (el historial conserva `createdByNombre`).
  - Publicar no se puede deshacer (las notificaciones ya salieron); la pantalla pide confirmación y muestra el conteo antes.
- **Soporte Técnico como tabla con búsqueda y filtros (2026-10-14)** — `SoporteTecnicoPage.tsx` pasó de tarjetas a tabla (pedido del usuario: "búsqueda y filtros igual que otras tablas"). Búsqueda por título, descripción, persona o empresa; filtros Estado/Tipo/Empresa; "Columnas" (`columnas:soporte-tecnico`), orden y ancho. **Todo se filtra en el navegador**: `GET /sistemas/tickets` sigue devolviendo todos los tickets sin paginar ni parámetros (sin cambios de backend); si el volumen crece habrá que filtrar en servidor. El estado se cambia con el selector de la propia columna Estado y el detalle completo (descripción larga, adjuntos) se abre al hacer clic en la fila.

### Bitácora del equipo (`/bitacora`) — 2026-10-27
Registro automático de la actividad de cada persona del equipo, para comprobar horario y trabajo en equipos virtuales sin pedir reportes. En el menú es el módulo **«Bitácora»** (con submenú, como Ventas o Sistemas); la sección de permisos se llama «Bitácora del equipo» (`BITACORA`). **MVP construido y probado en local (rama `feature/bitacora-equipo`); todavía NO está desplegado ni activado para ninguna persona real.** Es **solo registro**: sin metas, semáforo ni alertas (decisión de la usuaria; pueden venir después).

**Decisiones de la usuaria**
- **Opt-in por persona, por defecto NADIE (2026-10-27).** La hoja del día se activa persona por persona. La activan los **administradores y gerentes** de la empresa (`ADMIN` / `MANAGER` con empresa) en «Bitácora» → «Configuración» → pestaña «Hojas del día» (`/bitacora/configuracion`). Tabla `BitacoraActivacion`: `desde` = última activación, y **nada anterior se registra ni se lee de Google**. Desactivar deja de registrar al instante (caché de 15 s por persona, que se invalida al cambiar en el mismo servidor) y **conserva el historial** (rechazado: borrarlo). A la persona se le avisa en la campana al activar y al desactivar (enlace `/bitacora/mi-hoja`).
- **Tres compuertas independientes:** (1) la sección `BITACORA` encendida para la empresa por un super admin (`alwaysEnabled: false`; apagada = no se registra nada de esa empresa; caché de 60 s, así que al encenderla tarda hasta 1 minuto en registrar); (2) la persona activada; (3) para ver la bitácora de TODO el equipo, una fila `UserPermission` propia de `BITACORA` con «Ver» (sección cerrada por defecto). El controlador exige esa fila aunque el administrador de la empresa marque la sección como «módulo fijo» (`exigirPermisoExplicito`): son datos de personas y no se abren por omisión.
- Cada persona ve **siempre su propia hoja** («Mi hoja del día», `/bitacora/mi-hoja`, sin permiso de sección) si la tiene o la tuvo activada. Quién consultó la hoja de quién queda en `BitacoraConsulta` (todavía sin pantalla).
- **Solo cuentan acciones reales**, no estar con la pestaña abierta: el «latido» del navegador se descartó por ahora.

**Qué se registra** (tabla `BitacoraEvento`, creada al arrancar por `bitacora.schema.ts`; el despliegue no corre migraciones; `migrations/20261027_bitacora_equipo` es solo referencia)
- **APP:** `ActividadInterceptor` global (`APP_INTERCEPTOR`) anota cada `POST/PUT/PATCH/DELETE` que sale bien de una persona activada: módulo (primer tramo de la ruta), acción (`CREAR/EDITAR/ELIMINAR`), ruta con sus parámetros, id del registro y **solo un nombre corto** sacado de la respuesta (`title`, `name`, `nombre`, `fullName`, `razonSocial`, `companyName`, `code`, `codigo`; máx. 150 caracteres) — nunca el contenido. Leer pantallas (`GET`) NO cuenta: la campana consulta cada 60 s y llenaría la bitácora de falsa actividad. Rutas excluidas: `/auth`, `/bitacora`, `/notifications`, `/users/me/preferences`, `/public`, `/health`; excepción: `POST /auth/login` anota `SESION`. Un guardado repetido en menos de 30 s se anota una sola vez. El registro se espera antes de responder (en Cloud Run el servidor puede quedarse sin CPU al enviar la respuesta) y, si falla, la petición sigue igual.
- **GOOGLE:** API de informes de Workspace (Reports API, solo lectura), `BitacoraGoogleService`: inicios de sesión (`login_success`) y Drive (`create, edit, upload, view, rename, move, delete, trash, download`), **persona por persona** (`userKey` = su correo, nunca «all»: de quien no está activado ni se descarga nada). Se repasa una ventana de 48 h porque Google tarda en publicar y los repetidos se descartan por `unique(fuente, externalId)`. **Credencial: la cuenta de CORREO** (`GMAIL_SERVICE_ACCOUNT_JSON` en producción, `google-service-account-mail.json` en local), no la de Drive: la delegación de dominio está autorizada para ella (ver «Correo saliente»). Hace falta tener habilitada la **Admin SDK API** en el proyecto `agentes-504115`, agregar el permiso `https://www.googleapis.com/auth/admin.reports.audit.readonly` a esa delegación en la consola de Workspace y definir `GOOGLE_WORKSPACE_ADMIN_EMAIL`. Los errores de Google se traducen a mensajes accionables (API apagada, delegación sin autorizar), nunca se muestra el texto crudo. **Probada en vivo el 2026-10-27 en local con una sola cuenta** (`sistemas@gemeseg.com` como administrador).
- La **hoja del día** (`construirHoja`): primera y última actividad, huecos de 60 minutos o más entre acciones seguidas y filas agrupadas (acciones iguales a menos de 10 minutos se muestran como una con «(N veces)»). Los textos («Editó tarea: «…»») se calculan al leer (`bitacora-etiquetas.util.ts`), no al guardar, para poder mejorarlos sin tocar lo registrado. **Los días son días de Ecuador (UTC-5)**: `bitacora-fecha.util.ts` y `frontend/src/utils/bitacoraFechas.ts`; nunca comparar el día UTC de una marca de tiempo.

**Endpoints** (`/api/bitacora`)
- `GET /estado` y `GET /mi-hoja?fecha=` — cualquier usuario; deciden el menú y su hoja.
- `GET /activaciones` y `PUT /activaciones/:userId` (`{ activa }`) — solo `ADMIN`/`MANAGER` de una empresa con la bitácora encendida.
- `GET /metricas?dias=7|14|30` — métricas del equipo para el Dashboard (personas con actividad y eventos por día, hora media de inicio y de fin, eventos por hora y por módulo); sección `BITACORA` con fila de permiso propia. Cualquier otro valor de `dias` vuelve a 7. Son cifras del equipo, nunca un ranking de personas.
- `GET /equipo?fecha=` y `GET /equipo/:userId?fecha=` — sección `BITACORA` con fila de permiso propia; la segunda deja constancia de quién consultó.
- `GET /google/estado` — para la pestaña «Google» de Configuración: si la conexión está lista y qué falta (`configurado`, `falta`), cuántas personas se leen y el último evento de Google guardado. Solo `ADMIN`/`MANAGER`.
- `POST /google/sincronizar` — lee Google ahora (botón «Leer Google ahora», que vive **solo** en Configuración → Google), solo a las personas activadas **de la empresa de quien lo pide**. Lo pueden hacer los administradores y gerentes (sin necesitar el permiso de ver el equipo) o quien tenga «Escribir» en `BITACORA`.
- `POST /google-cron/sincronizar` — para Cloud Scheduler, protegido con `x-cron-secret` (sin `CRON_SECRET` responde 404), como los demás jobs.

**Frontend — módulo «Bitácora» en el menú** (`components/layout/Sidebar.tsx`, `pages/bitacora/`, `components/bitacora/`, `services/bitacora.service.ts`, estilos propios en `styles/bitacora.css`). Submenú según lo que le toque a cada persona (lo decide `GET /estado` y su fila de permiso; si no le toca nada, el módulo no aparece): **Dashboard** (`/bitacora`, `BitacoraDashboardPage`, `SectionRoute BITACORA`: SOLO métricas del equipo en los últimos 7, 14 o 30 días, con las piezas estándar del dashboard de Ventas — `Tarjeta`, `KpiFila`, `Contador` — y gráficos de barras SVG propios, `GraficosBitacora.tsx`), **Actividad del día** (`/bitacora/actividad`, `BitacoraActividadPage`, `SectionRoute BITACORA`: el detalle completo de UN día — tarjetas del día, tabla del equipo y la hoja de la persona elegida; pedido de la usuaria 2026-10-27: el Dashboard son métricas y el detalle por día vive aparte), **Mi hoja del día** (`/bitacora/mi-hoja`, `MiHojaPage`: solo a quien la tiene o la tuvo activada) y **Configuración** (`/bitacora/configuracion`, `BitacoraConfiguracionPage`, solo administradores y gerentes) con dos pestañas: «Hojas del día» (`ActivacionHojasPanel`) y «Google» (`GoogleConexionPanel`). Encabezado común `BitacoraPageHeader` (módulo «Bitácora») y pestañas con `PageTabs`. La configuración vive solo en Configuración: el Dashboard no repite el botón de Google.

**Lo que NO mide (y la hoja lo dice):** Word y Excel guardados solo en el computador, navegación web ni nada fuera de app.gemeseg y de la cuenta de Google; quien trabaja ahí aparece con poca actividad. Un programa de escritorio y una extensión de navegador se plantearon como fases posteriores (en computadores personales solo dentro del horario fijo, con aviso y consentimiento escrito) y NO están construidos.

**Pendiente antes de activar a personas reales**
- **Aviso al equipo y revisión de un abogado laboralista** (Ecuador, LOPDP): hay un borrador parcial en Claude Docs. Los datos quedan en `us-central1` (Estados Unidos): preguntar por transferencia internacional.
- Producción: `GOOGLE_WORKSPACE_ADMIN_EMAIL` y la credencial de correo en `cloudbuild.yaml`/Secret Manager, crear el job de Cloud Scheduler hacia `/bitacora/google-cron/sincronizar` (cada hora) y encender la sección a la empresa real. **Orden: crear el secreto antes de listarlo en `--set-secrets`.**
- Sin implementar: retención/borrado automático (propuesta: detalle 6 meses, resúmenes 12) y resumen con IA.
- Tests: `backend/src/modules/bitacora/*.spec.ts` y `frontend/src/utils/bitacoraFechas.test.ts`.
- Probando en local: `prisma db push` quiere borrar tablas que el servidor crea al arrancar (p. ej. `AuthAttempt`); **no aceptar ese aviso** — la tabla nueva se crea sola al arrancar el servidor.

### Contratación Pública (`/contratacion-publica`)
**Desde 2026-10-01 solo estaba visible "Entidades Públicas"; desde 2026-10-18 vuelven las Operaciones (Contratos, Horarios, Códigos de turno) con la bandera `CP_MOSTRAR_OPERACIONES` y se suman las **Bitácoras** de guardianía (foto de la hoja → agente revisor → comparación con el horario; `.agents/modules/contratacion-publica.md`, "Operaciones y Bitácoras"). Informes y Textos Institucionales siguen ocultos con `CP_MOSTRAR_SUBMODULOS_OCULTOS` en `App.tsx` ("Submódulos ocultos").** Módulo de contratos de seguridad privada con entidades del sector público (SERCOP): entidades, contratos (renovaciones, adendas, adjuntos), puestos de servicio, horarios de guardias con generador automático de patrón de rotación, e informes mensuales generados desde una plantilla `.docx`. Diseño detallado (algoritmo, ejemplos numéricos, casos de uso de verificación): `.agents/modules/contratacion-publica.md`.

- `GET/POST/PATCH/DELETE /contratacion-publica/entidades` - Entidades públicas (nombre, RUC, dirección + campos configurables). **Una carpeta de Drive raíz (`CP_ENTREGAS`) y una subcarpeta por entidad (`CPEntidadPublica.driveFolderId`)**, sincronizadas desde 2026-10-02: crear/renombrar la entidad crea/renombra su carpeta; el nombre no se puede repetir. `POST .../sincronizar-drive` (desde 2026-10-05 solo **informa** carpetas sin entidad y entidades sin carpeta; no crea nada solo), `POST .../desde-carpeta` y `POST .../:id/drive/usar-nombre-de-drive|usar-nombre-del-sistema|recrear-carpeta|crear-carpeta`. **No hay `DELETE` de entidades** (decisión 2026-10-05): solo **archivar** (`POST .../:id/archivar|reactivar`, `GET ...?archivadas=true`), que la oculta sin borrar nada y conserva su carpeta de Drive enlazada. Campos extra por empresa: `GET|POST|PATCH /contratacion-publica/entidad-campos`, `POST .../reordenar` (tabla `CPEntidadCampo`, valores en `CPEntidadPublica.camposExtra`; se desactivan, no se borran). Detalle: `.agents/modules/contratacion-publica.md`, "Carpeta única de Drive" y "Entidades: archivar, campos configurables…" (2026-10-05).
- `GET/POST/PATCH/DELETE /contratacion-publica/contratos` - Contratos, `POST .../:id/renovar` (enlaza `contratoOrigenId`), `POST/DELETE .../:id/adendas`, `POST/DELETE .../:id/adjuntos`
- `GET/POST/PATCH/DELETE /contratacion-publica/puestos` - Puestos de servicio (`tipoTurno` 8H/12H/24H, `cantidadGuardias`, `guardiasSimultaneosRequeridos` — mínimo de guardias trabajando a la vez, aplica con o sin patrón de rotación). `POST/DELETE .../:id/guardias` asigna/quita guardias (snapshot cédula+nombre tomado del padrón de RRHH, sin FK — a propósito, para no acoplar el módulo)
- `GET/PUT /contratacion-publica/puestos/:id/patron-rotacion`, `POST .../preview` - Patrón de rotación cíclico guardado por puesto (tramos `{codigoTurno, dias}`, cobertura simultánea, orden de guardias que define el desfase, fecha de inicio de ciclo). El preview usa la misma función de cálculo que la generación real (`calcularPatronRotacion`, `backend/.../shared/patron-rotacion.util.ts`), para que nunca diverjan
- `GET/POST/PATCH/DELETE /contratacion-publica/codigos-turno` - Catálogo por empresa (código, nombre, color, `esDescanso` — marca qué códigos NO cuentan como "trabajando" para la cobertura mínima)
- `GET/POST/DELETE /contratacion-publica/horarios`, `POST .../:id/celdas`, `POST .../:id/celdas/reemplazar-puesto` - Horario por **rango de fechas libre** (`fechaInicio`/`fechaFin`, casi nunca un mes calendario completo — `anio`/`mes` quedan solo como etiqueta derivada para el cruce con Informes). Al crear, se valida que el rango no se solape con otro horario existente del mismo contrato, sin importar su estado
- `POST /contratacion-publica/horarios/:id/generar-patron` - Calcula el patrón configurado, guarda la configuración en el puesto (si `guardarComoPatronDelPuesto`, default true) y reemplaza las celdas del puesto en una transacción. Solo con el horario en BORRADOR
- `POST /contratacion-publica/horarios/:id/intercambiar-turno` - Intercambia el código de turno entre dos guardias del **mismo puesto** (`puestoId` obligatorio en el DTO, para que nunca cruce celdas de puestos distintos) en una fecha puntual
- `PATCH /contratacion-publica/horarios/:id/estado` - Flujo `BORRADOR → ENVIADO → APROBADO/RECHAZADO` (`RECHAZADO → BORRADOR`). Al intentar pasar a `ENVIADO` se valida la **cobertura mínima**: por cada puesto y cada día del rango, cuenta guardias con código no-descanso vs. `guardiasSimultaneosRequeridos`; si algún día incumple, bloquea la transición completa y devuelve **todos** los incumplimientos (no solo el primero). No se valida en cada edición/intercambio individual, solo en este punto de control
- `GET /contratacion-publica/horarios/:id/pdf`, `GET .../excel` - Exporta el horario a PDF (PDFKit) o Excel (ExcelJS, celdas coloreadas igual que la UI), ambos con el rango real de fechas como columnas
- `GET/POST/PATCH/DELETE /contratacion-publica/informes` - Informe mensual: datos autogenerados (calculados al vuelo cruzando contrato+puestos+horario `APROBADO`, nunca duplicados) + texto redactado + plantilla `.docx` → PDF vía LibreOffice (mismo patrón que `ventas-contratos.service.ts`)
- `GET/POST/DELETE /contratacion-publica/textos-institucionales` - Catálogo clave→texto reutilizable en informes
- `/contratacion-publica/bitacoras/...` - **Bitácoras de guardianía** (2026-10-18): `GET opciones|agente|dashboard`, `GET` lista, `POST` subir foto (multipart `archivo` + `puestoId`; el **Agente Revisor de Bitácoras** la lee con Vertex y el sistema la compara con el horario del puesto), `GET :id`, `GET :id/archivo`, `PUT :id/lectura` (corregir lo leído y volver a comparar), `POST :id/releer`, `PATCH hallazgos/:hid`, `DELETE :id`. Sección `CONTRATACION_PUBLICA` (ver/escribir). Tablas creadas al arrancar. `CPCodigoTurno` gana `horaInicio/horaFin`. Detalle: `.agents/modules/contratacion-publica.md`, "Operaciones y Bitácoras de guardianía".
- `/contratacion-publica/entregas/...` - **Entregas de documentos de otras áreas** (2026-10-01): por entidad y mes, una solicitud con documentos, fecha límite y responsables propios, editable siempre; entrega por archivo (Drive) o enlace; aprobar/rechazar con motivo; avisos por notificación y correo. `GET|POST entidades/:entidadId/solicitudes`, `GET|DELETE solicitudes/:id`, `POST solicitudes/:id/enviar|documentos`, `PATCH|DELETE documentos/:id`, `POST documentos/:id/archivo|entregar|aprobar|rechazar` (`entregar` acepta `reemplazarAnterior`: si ya había un archivo en Drive, `true` lo borra y `false` conserva ambos; desde 2026-10-06 la pantalla obliga a elegir), `GET|PUT carpeta` (carpeta raíz de Drive `CP_ENTREGAS`; se edita desde la lista de Entidades Públicas). **Revisión (2026-10-02)**: `GET documentos/:id/archivo` (vista previa: el servidor baja el archivo de Drive y lo sirve; solo `origen=ARCHIVO` y solo si cuelga de la carpeta del mes de esa entidad; Word sale convertido a PDF con LibreOffice (desde 2026-10-05) y un Excel `.xlsx` sale como JSON con sus hojas para dibujarlo como cuadrícula tipo Drive (`ExcelViewer`, desde 2026-10-06; si no se puede leer cae al PDF, `?formato=pdf` fuerza el PDF), y `?descargar=1` entrega el original), `POST documentos/:id/recordar` (recordatorio manual por campana y correo a los responsables de un documento pendiente o rechazado de una solicitud enviada; `write`), `GET documentos/:id/historial` (línea de tiempo, tabla `CPEntregaHistorial`), `GET mis-documentos` (bandeja de quien entrega, `view`; se llama **"Por entregar"** en pantalla desde 2026-10-05) y `GET por-revisar` (bandeja de CP, `write`; se llama **"Por aprobar"** en pantalla). Recordatorios diarios: `POST /contratacion-publica/entregas-cron/recordatorios` con header `x-cron-secret` (variable `CRON_SECRET`, la llama Cloud Scheduler; pendiente crear el secreto y el trabajo). Detalle: `.agents/modules/contratacion-publica.md`, "Entregas de documentos de otras áreas".

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

> ⚠️ Solo para la base **local** (las crea `seed.js`). El repositorio es **público**: estas contraseñas no deben existir en producción. Antes de cada despliegue, comprobar que las cuentas reales (sobre todo `admin@general.com`) tienen otra contraseña y que `JWT_SECRET` de Secret Manager no coincide con ningún ejemplo de la documentación.

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
- Hardcodear un `z-index` numérico en un botón flotante nuevo — usar la escala compartida `--z-fab`/`--z-report-btn`/`--z-panel` de `styles.css` (o sumar una variable nueva a esa misma escala) para que un panel que se abre encima siempre quede por encima, en vez de descubrirlo por un bug visual (pasó con el botón de "Reportar problema" tapado por el chat, corregido 2026-09-29).

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
