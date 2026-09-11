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
- **Secrets:** Secret Manager (`DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`)
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
Cloud Run y Firebase Hosting se despliegan por separado y con pipelines distintos - Cloud Run **solo sirve la API** (el `Dockerfile` de `backend/` no incluye el frontend). El dominio publico `app.gemeseg.com` esta mapeado como custom domain sobre Firebase Hosting, que hace de unico origen de cara al usuario y reenvia `/api/**`, `/health`, `/docs/**` a Cloud Run (ver `firebase.json`).

```
Google Cloud Platform (proyecto: mejora-gemeseg)
  ├── Cloud SQL (PostgreSQL 16)   → gemeseg-db
  ├── Cloud Run (NestJS backend, solo API) → mejora-gemeseg-backend
  ├── Firebase Hosting (React, dominio publico app.gemeseg.com) → mejora-gemeseg.web.app
  ├── Artifact Registry           → gemeseg-repo
  └── Secret Manager              → DATABASE_URL, JWT_SECRET, FRONTEND_URL, BOLDSIGN_API_KEY
```

### Plataformas
- **Base de datos:** Cloud SQL (PostgreSQL 16, `us-central1`)
- **Backend:** Cloud Run (`us-central1`, auto-scaling) - deploy via `cloudbuild.yaml` (Cloud Build, dispara con push a `main`)
- **Frontend:** Firebase Hosting (`mejora-gemeseg.web.app`, dominio publico `app.gemeseg.com`) - deploy via `.github/workflows/firebase-hosting-merge.yml` (GitHub Actions, dispara con push a `main`)
- **CI/CD:** dos pipelines independientes, uno por servicio (no compartir la etapa de build del frontend entre ambos - ver `CLAUDE.md`)

### URLs
- Frontend: https://mejora-gemeseg.web.app
- Backend: https://mejora-gemeseg-backend-141953681725.us-central1.run.app
- API Docs: https://mejora-gemeseg-backend-141953681725.us-central1.run.app/docs

### Variables de Entorno

### Desarrollo (.env local)
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public
JWT_SECRET=gemeseg-jwt-secret-2026
GITHUB_TOKEN=<token_de_github_models>
FRONTEND_URL=http://localhost:5173
```

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
| `VITE_API_URL` | `https://mejora-gemeseg-backend-141953681725.us-central1.run.app` |

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
2. **Permisos por seccion** (`PermissionsService`, modulo `permissions`): gatea modulos completos (DASHBOARD, PROJECTS, ADMIN, TOOLS, AGENTS, CACAO, COMPANY_SETTINGS, COMPANIES, CUSTODIAS, RRHH, VENTAS - ver `ALL_SECTIONS` en `permissions.service.ts`).

Reglas:
- Una seccion con `alwaysEnabled: true` (DASHBOARD, PROJECTS, ADMIN, TOOLS, AGENTS) esta siempre visible para toda empresa.
- Las demas secciones deben habilitarse por empresa via `CompanySection` (`POST /permissions/sections/:companyId`, solo super admin).
- Dentro de una seccion habilitada, un usuario puede ademas restringirse por `UserPermission.canView/canWrite` (`POST /permissions/users/:userId`, admin de esa empresa).
- El Super Admin (`companyId: null`) ve y puede gestionar todas las secciones sin restriccion (`getMyPermissions` retorna `isSuperAdmin: true` y el listado completo de `ALL_SECTIONS`).
- `GET /permissions/my` es el endpoint que el frontend consulta al cargar sesion; `contexts/PermissionsContext.tsx` + `hooks/usePermissions.ts` exponen `canView(section)`, usado por el wrapper `<SectionRoute section="...">` en `App.tsx` alrededor de las rutas de cada modulo.
- **Al agregar un modulo nuevo:** agregarlo a `ALL_SECTIONS`, proteger sus endpoints, y envolver sus rutas de frontend en `SectionRoute`. Ninguna de las dos capas reemplaza a la otra - un endpoint puede tener `RolesGuard` correcto y aun asi quedar expuesto si no se agrega su seccion aqui.

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

### Recursos Humanos (`/rrhh`)
- `GET/POST/DELETE /personal/reclutamiento/puestos` - Creación de vacantes y sincronización JSON con Drive
- `POST /personal/reclutamiento/sync` - Sincronización de candidatos postulados en Drive Reclutamiento
- `GET/POST /personal/kanban/columns` - Columnas del Kanban
- `GET/POST /personal/candidates` - Candidatos
- `PATCH /personal/candidates/:id/move` - Mover candidato de columna
- `GET /personal/certifications` - Certificaciones
- `GET /personal/certifications/alerts` - Alertas de vencimiento
- `POST /personal/drive/sync` - Sincronizar carpetas de Drive
- `GET /personal/drive/compliance/:cedula` - Checklist de cumplimiento por cédula (incluye `review` por documento y `reviewSummary`)

**Movimientos de Personal — entrada/salida de guardias (2026-09-09, reemplaza a "Verificación asistida" de Sprint 2; ver `.agents/modules/movimientos-personal.md`):**
- `GET/POST/PATCH/DELETE /personal/sistemas-verificacion` - Catálogo configurable de sistemas externos (IsyPlus, IESS, SUT, SICOSEP), ya sembrado para `companyId=1`. Sin página propia — se administra desde un modal dentro de `/rrhh/movimientos`
- `GET /personal/movimientos` (+ `/:id`), `POST /personal/movimientos/salida`, `PATCH /personal/movimientos/:id/items/:itemId` - Casos de entrada/salida por guardia, con checklist por sistema (snapshot del catálogo al crear el caso). **No** hay `POST .../entrada`: es un registro, no un alta manual — la entrada solo se crea sola
- Entrada: única vía es automática, `KanbanColumn.triggersHire` (una sola columna por empresa) crea el caso al mover un candidato ahí (`CandidateService.move()`). Salida: ícono + `window.confirm` en `GuardiasList.tsx` (sin formulario, usa los datos de la fila). Ambas son idempotentes (no duplican un caso ya abierto para la misma cédula)
- Contexto: el spike de `backend/scraping-poc/` concluyó que el scraping automatizado **no es viable** (WAF Incapsula + captcha en SICOSEP; login de empleador en SUT; datos abiertos solo agregados). La acción en el portal la hace una persona; el sistema guarda la traza. La vieja tabla `VerificationCheck` (log plano, sin dirección entrada/salida) se eliminó — sus datos, si existían, se migraron a un caso histórico por `(companyId, cedula)`.

**Revisión documental (Sprint 3):**
- `POST /personal/drive/documents/review` - Aprobar/rechazar un documento con motivo (obligatorio al rechazar, mínimo 5 caracteres). Acepta `documentTypeId` (fila del checklist) o `driveFileId` (archivo sin reconocer)
- `GET /personal/drive/documents/reviews/:cedula` - Estado de revisión actual por empleado
- `GET /personal/drive/documents/review-history?cedula=` - Traza append-only de aprobaciones/rechazos

**Reglas:**
- Modelos `DocumentReview` (estado actual) + `DocumentReviewHistory` (traza). Se separan de `EmployeeDocument` a propósito: `deleteEmployeeByCedula` borra los documentos y una re-subida genera un `driveFileId` nuevo, así que la traza no puede vivir ahí.
- `review.stale = true` cuando el archivo actual ya no es el que se revisó (rechazaron y volvieron a subir) → la UI pide nueva revisión.
- La traza **sobrevive** al borrado del empleado (no hay FK a `Candidate`, la relación es por cédula). Es deliberado: es un registro de auditoría.
- El match entre archivo y tipo de documento exige frase completa, todos los términos, o ≥60 % cuando son 3 o más; **cada archivo se asigna a un solo tipo**. Antes bastaba una palabra suelta y un archivo podía aparecer en varias filas del checklist.
- Estos 3 endpoints usan `SectionPermissionGuard` (sección RRHH), no `RolesGuard` - ver "Permisos por seccion".

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
