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
```
Google Cloud Platform (proyecto: mejora-gemeseg)
  ├── Cloud SQL (PostgreSQL 16)   → gemeseg-db
  ├── Cloud Run (NestJS backend)  → mejora-gemeseg-backend
  ├── Firebase Hosting (React)    → mejora-gemeseg.web.app
  ├── Artifact Registry           → gemeseg-repo
  └── Secret Manager              → DATABASE_URL, JWT_SECRET, FRONTEND_URL
```

### Plataformas
- **Base de datos:** Cloud SQL (PostgreSQL 16, `us-central1`)
- **Backend:** Cloud Run (`us-central1`, auto-scaling)
- **Frontend:** Firebase Hosting (`mejora-gemeseg.web.app`)
- **CI/CD:** Cloud Build + `cloudbuild.yaml`

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

### Personal y RRHH (`/personal`)
- `GET/POST/DELETE /personal/reclutamiento/puestos` - Creación de vacantes y sincronización JSON con Drive
- `POST /personal/reclutamiento/sync` - Sincronización de candidatos postulados en Drive Reclutamiento
- `GET/POST /personal/kanban/columns` - Columnas del Kanban
- `GET/POST /personal/candidates` - Candidatos
- `PATCH /personal/candidates/:id/move` - Mover candidato de columna
- `GET /personal/certifications` - Certificaciones
- `GET /personal/certifications/alerts` - Alertas de vencimiento
- `POST /personal/drive/sync` - Sincronizar carpetas de Drive
- `GET /personal/drive/compliance/:cedula` - Checklist de cumplimiento por cédula

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
