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
- **ORM:** Prisma v7
- **Base de datos:** PostgreSQL 17
- **Auth:** Passport.js (JWT) + bcryptjs
- **Docs:** Swagger en `/docs`
- **Validacion:** class-validator + class-transformer

### Frontend
- **Framework:** React 18 + Vite
- **Routing:** react-router-dom
- **Formularios:** React Hook Form + Zod
- **HTTP:** Axios

### Infraestructura
- **Dev:** PostgreSQL local
- **Prod:** GCP Cloud Run + Cloud SQL (planeado)

## Convenciones de Codigo

### NestJS
- Un modulo por dominio: `auth`, `projects`, `users`, `tasks`.
- DTOs con `class-validator` para toda entrada.
- Guards por rol: `@Roles(UserRole.ADMIN, UserRole.MANAGER)` + `RolesGuard`.
- Responses consistentes.
- Nombres en ingles.

### React
- Componentes en PascalCase.
- Servicios de API en `/src/services/` (Axios con interceptor JWT).
- Paginas en `/src/pages/`.
- Tipos en `/src/types/`.

### Prisma
- Enums en schema: `UserRole`, `ProjectStatus`, `MemberRole`, `TaskStatus`, `Priority`.
- Migraciones con `prisma migrate dev --name <nombre>`.
- Seed en `prisma/seed.js`.

### Git
- Ramas: `main` (prod), `dev` (desarrollo activo), `feature/XXX-nombre`.
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.

## Variables de Entorno

```bash
# .env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gemeseg?schema=public
JWT_SECRET=gemeseg-jwt-secret-2026
```

## Esquema Prisma (actual)

```prisma
enum UserRole { ADMIN MANAGER EMPLOYEE }
enum ProjectStatus { ACTIVE ON_HOLD COMPLETED CANCELLED }
enum MemberRole { OWNER MANAGER MEMBER VIEWER }
enum TaskStatus { TODO IN_PROGRESS IN_REVIEW DONE CANCELLED }
enum Priority { LOW MEDIUM HIGH URGENT }
```

Modelos: `User`, `Department`, `Role`, `Project`, `ProjectMember`, `Task`

## Autenticacion

- `POST /auth/register` - solo correos `@gemeseg.com`
- `POST /auth/login` - retorna JWT con `{ sub, email, role }`
- JWT expira en 7 dias
- Password hasheada con bcrypt (salt 10)
- Role incluido en JWT para guards

## Guard de roles

```typescript
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
async create(...) { ... }
```

## LO QUE NO DEBES HACER

- Poner contrasenas en texto plano en la BD.
- Hacer commits directos a `main`.
- Usar `any` en TypeScript sin justificacion.
- Retornar contrasenas hasheadas en responses de la API.
- Crear endpoints sin validacion de DTOs.

## Estado actual del sistema
- Backend NestJS + Prisma con modulos Auth y Projects funcionalles.
- Frontend React + Vite con login, registro, dashboard, y gestion de proyectos.
- Roles: ADMIN, MANAGER, EMPLOYEE con guards.
- Seed con 4 usuarios y 5 proyectos de prueba.
- Swagger habilitado en `/docs`.
- PostgreSQL 17 instalado localmente.

## Credenciales de prueba
- Contrasena para todos: `gemeseg2026`
- Admin: `leidy@gemeseg.com`
- Manager: `carlos@gemeseg.com`
- Employee: `andrea@gemeseg.com`
- Employee: `miguel@gemeseg.com`
