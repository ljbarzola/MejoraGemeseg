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
- **Frontend (Vercel):** https://mejora-gemeseg.vercel.app
- **Backend (Railway):** https://mejoragemeseg-production.up.railway.app
- **API Docs (Swagger):** https://mejoragemeseg-production.up.railway.app/docs

## Stack Tecnologico

### Backend
- **Framework:** NestJS v11 + TypeScript
- **ORM:** Prisma v7 (con `@prisma/adapter-pg`)
- **Base de datos:** PostgreSQL 17 (local)
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

#### Produccion (Monorepo en GitHub)
- **Base de datos:** Supabase (plan gratuito) - PostgreSQL 17
- **Backend:** Railway (Root Dir: `/backend`)
- **Frontend:** Vercel (Root Dir: `/frontend`)
- **Repo:** https://github.com/ljbarzola/MejoraGemeseg

**Flujo:** Push a `main` → Railway y Vercel hacen deploy automatico.

**Variables de entorno:** No usar archivos `.env` en produccion. Mapear en paneles de Railway y Vercel.

## Convenciones de Codigo

### NestJS
- Un modulo por dominio: `auth`, `projects`, `users`, `tasks`, `ai`, `queue`, `tools`, `agents`.
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
- Enums en schema: `UserRole`, `ProjectStatus`, `MemberRole`, `TaskStatus`, `Priority`.
- Modelos: `User`, `Department`, `Role`, `Project`, `ProjectMember`, `Task`, `TaskAssignee`, `Tool`, `ToolAssignment`, `ToolAuditLog`, `Agent`, `UserAgent`, `Conversation`, `ChatMessage`, `AiLog`.
- Migraciones con `prisma migrate dev --name <nombre>`.
- Seed en `prisma/seed.js`.
- Prisma v7 requiere adapter: `new PrismaClient({ adapter: new PrismaPg(...) })`.

### Git
- Ramas: `main` (produccion), `feature/XXX-nombre`, `fix/XXX-nombre`.
- **SIEMPRE hacer `git pull origin main` antes de crear una rama nueva** para evitar conflictos de versiones.
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.
- No hacer push sin confirmacion del usuario.

## Despliegue en Produccion

### Arquitectura
```
GitHub (repo: MejoraGemeseg/)
  ├── backend/  → Railway (Root Dir: /backend)
  ├── frontend/ → Vercel  (Root Dir: /frontend)
  └── .env      → ignorado por .gitignore
```

### Plataformas
- **Base de datos:** Supabase (plan gratuito, PostgreSQL 17)
- **Backend:** Railway (deploy automatico desde `main`)
- **Frontend:** Vercel (deploy automatico desde `main`)

### URLs
- Frontend: https://mejora-gemeseg.vercel.app
- Backend: https://mejoragemeseg-production.up.railway.app
- API Docs: https://mejoragemeseg-production.up.railway.app/docs

### Variables de Entorno

### Desarrollo (.env local)
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public
JWT_SECRET=gemeseg-jwt-secret-2026
GITHUB_TOKEN=<token_de_github_models>
FRONTEND_URL=http://localhost:5173
```

### Produccion - Backend (Railway)
| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql://postgres.alvpovhbqcwunaiieuhy:MejoraG3m3s3g2026@aws-0-us-east-1.pooler.supabase.com:6543/postgres` |
| `JWT_SECRET` | *(configurar en panel de Railway)* |
| `FRONTEND_URL` | `https://mejora-gemeseg.vercel.app` |
| `PORT` | `3000` |

### Produccion - Frontend (Vercel)
| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://mejoragemeseg-production.up.railway.app` |

## Autenticacion

- `POST /auth/register` - solo correos `@gemeseg.com` (domain guard)
- `POST /auth/login` - retorna JWT con `{ sub, email, role }`
- JWT expira en 7 dias
- Password hasheada con bcrypt (salt 10)
- Role incluido en JWT para guards

## Reglas de Negocio

### Admin
- Solo UNO: `admin@gemeseg.com` (Sistemas GEMESEG)
- Es OWNER automatico de TODOS los proyectos (se agrega al crear proyecto)
- Puede cambiar roles de cualquier miembro (incluyendo OWNER)
- Puede ver todos los miembros (incluyose a si mismo)
- No aparece en la lista de miembros para usuarios normales

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
- Cualquier usuario autenticado puede crear/eliminar herramientas y asignaciones.
- Asignaciones multiples de usuarios soportadas.
- Auditoria de cada accion (quien asigno/removio, cuando).

### Agentes de IA
- Admin y usuario de Sistemas pueden gestionar agentes.
- Cada agente tiene: nombre, instrucciones (system prompt), alcance (GLOBAL/PROJECTS/TASKS/ADMIN).
- Un agente puede estar asignado a multiples usuarios.
- Un usuario puede tener multiples agentes asignados.
- El agente global (createdBy: null) esta disponible para todos.
- Cada combinacion usuario+agente tiene sus propias conversaciones.

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

## Credenciales de prueba
- Contrasena para todos: `gemeseg2026`
- Admin: `admin@gemeseg.com` (ADMIN)
- Manager: `hugo@gemeseg.com` (MANAGER - Gerente General)
- Employee: `david@gemeseg.com` (EMPLOYEE - Marketing Digital)
- Employee: `nayelli@gemeseg.com` (EMPLOYEE - Recursos Humanos)
- Employee: `sistemas@gemeseg.com` (EMPLOYEE - Sistemas, Leidy Barzola)

## LO QUE NO DEBES HACER

- Poner contrasenas en texto plano en la BD.
- Hacer commits directos a `main` sin PR.
- Usar `any` en TypeScript sin justificacion.
- Retornar contrasenas hasheadas en responses de la API.
- Crear endpoints sin validacion de DTOs.
- **Perder archivos de ramas existentes** - SIEMPRE hacer pull de main antes de crear ramas.
- Hacer push sin autorizacion del usuario.
- Hardcodear URLs de API en el frontend (usar `VITE_API_URL`).
- Usar archivos `.env` en produccion (usar paneles de Railway/Vercel).
