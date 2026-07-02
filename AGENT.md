# Gemeseg Mejora - Guía para agentes

## Propósito
Este documento está pensado para ser consumido por agentes de desarrollo, asistentes de código o herramientas de automatización. Su objetivo es proporcionar contexto técnico claro para entender el proyecto, sus decisiones de arquitectura y las prioridades de implementación.

## Contexto del proyecto
Proyecto orientado a modernizar Gemeseg mediante una plataforma web escalable, segura y preparada para incorporar inteligencia artificial en una segunda fase.

## Objetivo general
Construir una solución modular para gestionar operaciones corporativas, usuarios, roles, contratos y auditorías, con una arquitectura preparada para crecimiento y evolución.

## Arquitectura recomendada

### Frontend
- Framework: React
- Herramienta de desarrollo: Vite
- Gestión de estado:
  - React Query (TanStack) para peticiones y caché
  - Zustand para estado global
- Estilos:
  - CSS puro con variables si se requiere control corporativo estricto
  - Tailwind CSS si se prioriza rapidez en el desarrollo de interfaces

### Backend
Elegir una de estas dos opciones según el alcance previsto para IA:

- Opción A - Corporativa:
  - NestJS + TypeScript + Prisma
  - Recomendado para sistemas empresariales, seguridad y mantenibilidad

- Opción B - IA:
  - FastAPI + Python
  - Recomendado para agentes de IA y procesamiento complejo de documentos

### Base de datos e infraestructura
- PostgreSQL como base de datos relacional principal
- Google Cloud Platform (GCP) como plataforma de despliegue
- Cloud Run para aplicaciones frontend y backend
- Cloud SQL para base de datos gestionada y segura

## Reglas de implementación sugeridas
- Priorizar una arquitectura limpia y modular.
- Mantener separación clara entre frontend, backend y datos.
- Favorecer buenas prácticas de seguridad y auditoría.
- Diseñar el modelo de datos para soportar relaciones entre empleados, roles, contratos y auditorías.
- Preparar la solución para integrar agentes de IA en una segunda fase sin reestructurar por completo el sistema.

## Entregables esperados
- Estructura base del frontend
- Estructura base del backend
- Modelo de datos inicial en PostgreSQL
- Configuración básica de despliegue en GCP
- Documentación de decisiones técnicas

## Notas para agentes
- Si el usuario pide crear la arquitectura, priorizar una solución escalable y bien documentada.
- Si el usuario solicita implementar funcionalidades, mantener el enfoque en una base técnica coherente con esta propuesta.
- Si aparece una decisión entre backend corporativo y backend IA, preguntar cuál es la prioridad antes de tomar una decisión definitiva.
- No introducir tecnologías que contradigan esta propuesta sin justificarlo.

## Resumen corto
Este proyecto está planteado como una solución moderna, segura y preparada para IA, con React/Vite en el frontend, una opción de backend según el peso de la IA, PostgreSQL como base de datos y GCP como infraestructura principal.

## Estado actual del sistema
Se implementó una primera versión funcional con frontend y backend para cubrir la HU-ADM-01. Incluye:
- Frontend React + Vite con paleta corporativa GEMESEG
- Backend NestJS + Prisma con módulo Users
- Esquema Prisma con User, Department y Role
- Controlador y servicio para Users
- DTOs con validación
- Endpoints CRUD básicos
- Swagger habilitado en /docs

## Paleta visual corporativa
- Azul oscuro: #100F31
- Azul claro: #12375F
- Naranja: #EE3B1B
- Gris claro: #E6E6E6

## Puntos a tener en cuenta para continuar
- Se requiere una instancia de PostgreSQL accesible para completar las migraciones.
- El código queda listo para extenderse con seed de departamentos y roles.
- Para pruebas futuras conviene agregar tests unitarios e integración.
- La UI actual es una base visual; puede evolucionar hacia formularios reales de administración.










## 🏢 Contexto del Proyecto

**Empresa:** GEMESEG (Ecuador)
**Objetivo:** Centralizar, modernizar y automatizar procesos internos mediante un ecosistema de software potenciado por IA (Claude API).
**Metodología:** Scrum — sprints de 1-2 semanas
**Estado actual:** Fase 1 en desarrollo

---

## 🎯 Fases del Proyecto

| Fase | Módulos | Estado |
|------|---------|--------|
| 1 | Proyectos & Tareas | 🔄 En progreso |
| 2 | RRHH & Desempeño | ⏳ Pendiente |
| 3 | Facturación & OCR | ⏳ Pendiente |
| 4 | CRM & Deploy GCP | ⏳ Pendiente |

---

## 🗂️ Estructura del Repositorio

```
gemeseg-app/
├── AGENT.md                    ← Este archivo
├── docker-compose.yml          ← PostgreSQL + Redis + App
├── docker-compose.dev.yml      ← Override para desarrollo
├── .env.example                ← Variables necesarias (sin secretos)
├── .gitignore
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   ├── filters/
│   │   │   ├── guards/
│   │   │   └── interceptors/
│   │   ├── config/
│   │   │   └── configuration.ts
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── strategies/
│   │   │   │   │   ├── jwt.strategy.ts
│   │   │   │   │   └── google.strategy.ts
│   │   │   │   └── dto/
│   │   │   ├── users/
│   │   │   │   ├── users.module.ts
│   │   │   │   ├── users.service.ts
│   │   │   │   ├── users.controller.ts
│   │   │   │   └── dto/
│   │   │   ├── projects/            ← FASE 1
│   │   │   │   ├── projects.module.ts
│   │   │   │   ├── projects.service.ts
│   │   │   │   ├── projects.controller.ts
│   │   │   │   └── dto/
│   │   │   ├── tasks/               ← FASE 1
│   │   │   │   ├── tasks.module.ts
│   │   │   │   ├── tasks.service.ts
│   │   │   │   ├── tasks.controller.ts
│   │   │   │   └── dto/
│   │   │   ├── ai/                  ← FASE 1 (Claude API)
│   │   │   │   ├── ai.module.ts
│   │   │   │   ├── ai.service.ts
│   │   │   │   ├── ai.processor.ts
│   │   │   │   └── dto/
│   │   │   └── queue/
│   │   │       └── queue.module.ts
│   │   └── prisma/
│   │       ├── prisma.module.ts
│   │       └── prisma.service.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── test/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── ui/                  ← Componentes base reutilizables
│   │   │   └── layout/
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── projects/            ← FASE 1
│   │   │   └── tasks/               ← FASE 1
│   │   ├── hooks/
│   │   ├── services/                ← API calls
│   │   ├── stores/                  ← Zustand stores
│   │   └── types/
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
└── docs/
    └── historias-usuario-fase1.md
```

---

## 🛠️ Stack Tecnológico

### Backend
- **Framework:** NestJS v10 + TypeScript
- **ORM:** Prisma v5
- **Base de datos:** PostgreSQL v15
- **Colas:** Bull v4 + Redis v7
- **Auth:** Passport.js (JWT + Google OAuth2)
- **Docs:** Swagger en `/docs`
- **Testing:** Jest + Supertest

### Frontend
- **Framework:** React 18 + Vite
- **Estilos:** TailwindCSS + paleta corporativa GEMESEG
- **Estado:** TanStack Query (server) + Zustand (client)
- **Formularios:** React Hook Form + Zod
- **HTTP:** Axios

### Infraestructura
- **Dev:** Docker Compose (local)
- **Prod:** GCP Cloud Run + Cloud SQL
- **Monitoring:** Datadog
- **CI/CD:** GitHub Actions (rama main → prod, rama dev → staging)

---

## 🔑 Variables de Entorno

```bash
# .env.example — copiar a .env y rellenar valores reales

# App
NODE_ENV=development
PORT=3000

# Base de datos
DATABASE_URL=postgresql://gemeseg:password@localhost:5432/gemeseg_db

# Redis (para Bull)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRES_IN=7d

# Google OAuth (solo 4 usuarios piloto)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Claude API (cuenta personal de Leidy)
CLAUDE_API_KEY=sk-ant-
CLAUDE_MODEL=claude-3-5-sonnet-20241022
CLAUDE_MAX_TOKENS=2048

# Rate limiting Claude (por usuario por día)
CLAUDE_DAILY_LIMIT_PER_USER=50

# Frontend URL (para CORS)
FRONTEND_URL=http://localhost:5173
```

---

## 🗃️ Esquema Prisma (Fase 1)

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  password     String?  // null si es OAuth
  firstName    String
  lastName     String
  authMethod   AuthMethod @default(LOCAL)
  googleId     String?  @unique
  role         UserRole   @default(EMPLOYEE)
  isActive     Boolean  @default(true)
  dailyAiCalls Int      @default(0)  // Reset diario
  lastAiReset  DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  department   Department? @relation(fields: [departmentId], references: [id])
  departmentId String?

  projectMemberships ProjectMember[]
  assignedTasks      Task[]
  createdProjects    Project[]         @relation("CreatedBy")
  aiLogs             AiLog[]
}

model Department {
  id        String   @id @default(cuid())
  name      String   @unique
  createdAt DateTime @default(now())
  users     User[]
}

model Project {
  id          String        @id @default(cuid())
  name        String
  description String?
  status      ProjectStatus @default(ACTIVE)
  startDate   DateTime?
  endDate     DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  createdBy   User   @relation("CreatedBy", fields: [createdById], references: [id])
  createdById String

  members     ProjectMember[]
  tasks       Task[]
}

model ProjectMember {
  id        String      @id @default(cuid())
  role      MemberRole  @default(MEMBER)
  joinedAt  DateTime    @default(now())

  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId String
  user      User    @relation(fields: [userId], references: [id])
  userId    String

  @@unique([projectId, userId])
}

model Task {
  id          String     @id @default(cuid())
  title       String
  description String?
  status      TaskStatus @default(TODO)
  priority    Priority   @default(MEDIUM)
  dueDate     DateTime?
  estimatedHours Float?
  actualHours    Float?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  project     Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId   String
  assignee    User?   @relation(fields: [assigneeId], references: [id])
  assigneeId  String?
}

model AiLog {
  id          String   @id @default(cuid())
  userId      String
  module      String   // "projects", "tasks", "reports"
  action      String   // "suggest_assignee", "generate_report"
  tokensUsed  Int
  cost        Float?
  success     Boolean
  createdAt   DateTime @default(now())

  user        User @relation(fields: [userId], references: [id])
}

// ===== ENUMS =====

enum AuthMethod {
  LOCAL
  GOOGLE
}

enum UserRole {
  ADMIN
  MANAGER
  EMPLOYEE
}

enum MemberRole {
  OWNER
  MANAGER
  MEMBER
  VIEWER
}

enum ProjectStatus {
  ACTIVE
  ON_HOLD
  COMPLETED
  CANCELLED
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
  CANCELLED
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}
```

---

## 🔐 Autenticación

### Flujo 1: Local (toda la empresa)
1. `POST /auth/register` → email + contraseña
2. `POST /auth/login` → retorna JWT
3. JWT en header `Authorization: Bearer <token>`

### Flujo 2: Google OAuth (4 usuarios piloto Workspace)
1. `GET /auth/google` → redirige a Google
2. Google callback → `GET /auth/google/callback`
3. Retorna mismo JWT estándar

### Reglas importantes:
- Ambos flujos producen el **mismo JWT**, misma protección de rutas
- Solo correos `@gemeseg.com` pueden registrarse
- Contraseñas hasheadas con `bcrypt` (salt rounds: 10)
- JWT expira en 7 días

---

## 🤖 Claude API — Reglas de Uso

### Rate Limiting
- **Máximo:** 50 llamadas/usuario/día
- **Reset:** Diario a medianoche (Ecuador, UTC-5)
- **Control:** Campo `dailyAiCalls` + `lastAiReset` en tabla `User`
- Si el usuario alcanza el límite → error `429` con mensaje descriptivo

### Procesamiento
- **Todas las llamadas a Claude son ASÍNCRONAS** via Bull Queue
- El endpoint devuelve `{ jobId, status: "enqueued" }` inmediatamente
- El frontend hace polling a `GET /ai/jobs/:jobId` para el resultado
- El resultado final se guarda en BD cuando está listo

### Modelo
- Usar siempre `claude-3-5-sonnet-20241022`
- `max_tokens: 2048` por defecto (ajustar si el caso lo requiere)

### Seguridad
- `CLAUDE_API_KEY` solo vive en `.env` — nunca en el código fuente
- Nunca exponer la key al frontend
- Loguear en `AiLog` cada llamada: tokens, costo, éxito/fallo

---

## 📏 Convenciones de Código

### NestJS
- Un módulo por dominio: `projects`, `tasks`, `auth`, `users`, `ai`
- DTOs con `class-validator` para toda entrada
- Responses consistentes:
  ```ts
  { data: T, message: string, statusCode: number }
  ```
- Errores con `HttpException` o filters globales
- Nombres en inglés, comentarios en español si son complejos

### React
- Componentes en PascalCase
- Hooks personalizados con prefijo `use`
- Servicios de API en `/src/services/` (Axios)
- Un store de Zustand por módulo
- Páginas en `/src/pages/`, componentes reutilizables en `/src/components/ui/`

### Git
- Ramas: `main` (prod), `dev` (desarrollo activo), `feature/XXX-nombre`
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- PRs siempre de `feature/*` → `dev`, nunca directo a `main`

### Testing
- Un archivo `*.spec.ts` por servicio
- Cubrir al menos: happy path + caso de error principal
- Mocks para Prisma y Claude API en tests unitarios

---

## 🚫 LO QUE NO DEBES HACER

- ❌ Poner `CLAUDE_API_KEY` hardcodeada en ningún archivo
- ❌ Llamar a Claude API de forma síncrona (siempre via Bull)
- ❌ Saltarte la validación de `@gemeseg.com` en registro
- ❌ Hacer commits directos a `main`
- ❌ Usar `any` en TypeScript sin justificación
- ❌ Retornar contraseñas hasheadas en responses de la API
- ❌ Omitir el registro en `AiLog` cuando se llama a Claude

---

## ✅ CHECKLIST ANTES DE CADA PR

- [ ] Tests pasan (`npm run test`)
- [ ] No hay `console.log` olvidados en producción
- [ ] Variables de entorno nuevas están en `.env.example`
- [ ] Swagger actualizado (`@ApiOperation`, `@ApiResponse`)
- [ ] Migración Prisma creada si hay cambios de schema
- [ ] Sin secretos en el código
