# Gemeseg Mejora - Guia para agentes

## Proposito
Este documento esta destinado a agentes de desarrollo, asistentes de codigo y pipelines de automatizacion. Proporciona contexto tecnico completo, decisiones de infraestructura y la organizacion actual del proyecto.

## Contexto del Proyecto
**Empresa:** GEMESEG (Ecuador)
**Objetivo:** Centralizar, modernizar y automatizar procesos internos mediante un ecosistema de software.
**Metodologia:** Scrum - sprints de 1-2 semanas
**Plataforma:** Web (no movil)
**Estado actual:** Fase 1 en desarrollo

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
- **Dev:** PostgreSQL local (Docker abandonado)
- **Prod:** GCP Cloud Run + Cloud SQL (planeado)

## Convenciones de Codigo

### NestJS
- Un modulo por dominio: `auth`, `projects`, `users`, `tasks`, `ai`, `queue`.
- DTOs con `class-validator` para toda entrada.
- Guards por rol: `@Roles(UserRole.ADMIN, UserRole.MANAGER)` + `RolesGuard`.
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
- Modelos: `User`, `Department`, `Role`, `Project`, `ProjectMember`, `Task`, `Agent`, `Conversation`, `ChatMessage`, `AiLog`.
- Migraciones con `prisma migrate dev --name <nombre>`.
- Seed en `prisma/seed.js`.
- Prisma v7 requiere adapter: `new PrismaClient({ adapter: new PrismaPg(...) })`.

### Git
- Ramas: `main` (produccion), `feature/XXX-nombre`, `fix/XXX-nombre`.
- **SIEMPRE hacer `git pull origin main` antes de crear una rama nueva** para evitar conflictos de versiones.
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.
- No hacer push sin confirmacion del usuario.

## Variables de Entorno

```bash
# .env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public
JWT_SECRET=gemeseg-jwt-secret-2026
GITHUB_TOKEN=<token_de_github_models>
```

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

### Owners
- Pueden agregar y quitar miembros del proyecto
- No pueden quitar al ultimo OWNER de un proyecto
- No pueden eliminarse a si mismos

### Viewers
- Ven botones deshabilitados (greyed out, `cursor: not-allowed`), no ocultos
- No pueden crear ni editar tareas

## Modulos Backend

### Auth (`/auth`)
- `POST /auth/register` - Registro (solo @gemeseg.com)
- `POST /auth/login` - Login, retorna JWT
- `GET /auth/profile` - Perfil del usuario autenticado

### Projects (`/projects`)
- `POST /projects` - Crear proyecto (ADMIN/MANAGER) + admin auto-OWNER
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

### Users (`/users`) - Solo ADMIN
- `POST /users` - Crear usuario
- `GET /users` - Listar usuarios (con filtros)
- `GET /users/stats` - Estadisticas de usuarios
- `PATCH /users/:id` - Actualizar usuario
- `DELETE /users/:id` - Eliminar usuario (soft delete)

### Chat IA (`/chat`)
- `POST /chat/message` - Enviar mensaje al asistente IA
- Rate limit: 50 mensajes/dia por usuario
- GitHub Models (`gpt-4o-mini`) con fallback a mock
- Predefinidas: `list_projects`, `count_tasks_by_status`, `user_info`, `project_summary`, `list_my_tasks`

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
