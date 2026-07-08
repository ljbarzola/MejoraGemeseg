# Gemeseg Mejora

## Que es este proyecto
Gemeseg Mejora es una plataforma web de gestion interna para GEMESEG (Ecuador), disenada para centralizar proyectos, tareas y usuarios. Cubre autenticacion, gestion de proyectos con roles, tablero Kanban, panel de administracion, inventario de herramientas, y un asistente de IA.

## Contexto
- Empresa: GEMESEG (Ecuador)
- Objetivo: centralizar operaciones internas en un espacio digital unico.
- Metodologia: Scrum con sprints de 1-2 semanas.
- Plataforma: **Web** (no movil).
- Estado actual: Fase 1 en desarrollo.

## Funcionalidades implementadas

### Autenticacion
- **Login y Registro**: JWT con 7 dias de expiracion, registro solo con correos `@gemeseg.com`.
- **Roles**: ADMIN, MANAGER, EMPLOYEE con guards en endpoints protegidos.
- **Password**: bcrypt con salt 10.

### Gestion de Proyectos
- **Crear proyectos**: Cualquier usuario autenticado puede crear proyectos.
- **Admin es OWNER automatico**: Se agrega como OWNER a todo proyecto nuevo.
- **Listar proyectos**: Filtrado por membresia, filtro por estado, paginacion de 10.
- **Detalle de proyecto**: Info, miembros, tareas con tabla.

### Gestion de Miembros
- **Agregar miembro**: OWNER o ADMIN pueden agregar miembros con rol.
- **Quitar miembro**: OWNER o ADMIN pueden eliminar miembros (no al ultimo OWNER).
- **Cambiar rol**: Solo ADMIN puede cambiar roles incluyendo OWNER.
- **Viewer**: Botones deshabilitados (no ocultos).

### Gestion de Tareas (Kanban)
- **Crear tarea**: Miembros no-viewer pueden crear.
- **Tablero Kanban**: 4 columnas (Por hacer, En progreso, En revision, Completado).
- **Detalle de tarea**: Cambiar estado, asignar, prioridad, fecha inicio/fin.
- **Asignados multiples**: Varias personas pueden estar asignadas a una tarea.
- **Viewer**: Acceso de solo lectura con botones deshabilitados.

### Panel de Administracion
- **Gestion de usuarios**: CRUD completo, crear/editar/activar/desactivar.
- **Stats de usuarios**: Conteo por rol.
- **Panel de proyectos**: Estadisticas de salud, tareas por estado, indicadores.
- **Listado de proyectos**: Tabla con navegacion a detalle de cada proyecto.

### Herramientas (Inventario)
- **Catalogo de herramientas**: Crear, listar y eliminar herramientas.
- **Asignacion multiple**: Asignar una herramienta a varios usuarios a la vez.
- **Edicion y auditoria**: Actualizar version/licencia, historial de cambios.
- **Perfil de usuario**: Cada usuario ve sus herramientas asignadas en su perfil.
- **Acceso**: Pestana visible solo para usuario de Sistemas (`sistemas@gemeseg.com`).

### Perfil de Usuario
- **Ver perfil**: Desde el navbar, nombre de usuario clickeable.
- **Info completa**: Nombre, email, documento, cargo, departamento, rol, fecha de ingreso.
- **Herramientas**: Lista de herramientas asignadas al usuario.
- **Estadisticas**: Proyectos creados, asignados, tareas asignadas.

### Asistente de IA
- **Chat flotante**: Boton FAB + drawer lateral.
- **GitHub Models**: Integra con `gpt-4o-mini` via GitHub Models API.
- **Fallback mock**: Respuestas predefinidas cuando no hay token configurado.
- **Rate limit**: 50 mensajes/dia por usuario.
- **Contexto**: Detecta la pagina actual para respuestas contextualizadas.
- **Conversaciones**: Cada combinacion agente+usuario tiene sus propias conversaciones guardadas en BD.
- **Cambio de agente**: Dropdown para seleccionar agente, con lista de conversaciones por agente.

### Agentes de IA
- **Catalogo de agentes**: Crear, editar y eliminar agentes con nombre, instrucciones (system prompt) y alcance.
- **Alcances**: GLOBAL, PROJECTS, TASKS, ADMIN.
- **Asignacion**: Asignar agentes a multiples usuarios. Un usuario puede tener multiples agentes.
- **Agentes por usuario**: Cada usuario ve los agentes que le estan asignados en el chat.
- **Acceso**: Pestana visible para admin y usuario de Sistemas.

### Navbar
- Logo GEMESEG en la barra de navegacion.
- Navegacion rapida: Inicio, Proyectos, Administracion (solo admin), Herramientas (solo sistemas), Agentes (admin/sistemas).
- Nombre del usuario clickeable (va a perfil).
- Boton de cerrar sesion.

## Credenciales de prueba
Todos los usuarios usan la contrasena: **gemeseg2026**

| Usuario | Email | Rol | Cargo |
|---------|-------|-----|-------|
| Sistemas GEMESEG | admin@gemeseg.com | ADMIN | Administrador del Sistema |
| Hugo Melo | hugo@gemeseg.com | MANAGER | Gerente General |
| David Izurieta | david@gemeseg.com | EMPLOYEE | Analista de Marketing Digital |
| Nayelli | nayelli@gemeseg.com | EMPLOYEE | Analista de Recursos Humanos |
| Leidy Barzola | sistemas@gemeseg.com | EMPLOYEE | Analista de Sistemas |

## Proyectos de prueba

| Proyecto | Estado | Miembros |
|----------|--------|----------|
| Landings | ACTIVE | David (OWNER), Admin (OWNER) |
| Mejora GEMESEG | ACTIVE | Admin (OWNER), Hugo (MEMBER), David (MEMBER) |
| Cotizador | ACTIVE | Admin (OWNER), Hugo (MEMBER), David (VIEWER) |
| Plataforma GEMESEG v2 | ACTIVE | Admin (OWNER), David (MEMBER) |
| Migracion a Google Cloud | ON_HOLD | Admin (OWNER), Hugo (MANAGER) |

## Como empezar

### Requisitos previos
- Node.js 18+
- PostgreSQL 17 (instalado localmente)

### Backend
```bash
cd backend
npm install
# Configurar .env con DATABASE_URL, JWT_SECRET, GITHUB_TOKEN (opcional)
npx prisma migrate dev
node prisma/seed.js        # Crea usuarios y proyectos de prueba
npm run start:dev          # http://localhost:3000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

### Seed de prueba
```bash
cd backend
node prisma/seed.js
```

## Estructura del repositorio
```
gemeseg-mejora/
├── AGENT.md                    # Guia para agentes de IA
├── README.md                   # Este archivo
├── backend/
│   ├── src/
│   │   ├── common/
│   │   │   ├── decorators/     # Roles decorator
│   │   │   └── guards/         # RolesGuard
│   │   ├── modules/
│   │   │   ├── auth/           # Login, register, JWT
│   │   │   ├── projects/       # CRUD proyectos + miembros + tareas
│   │   │   ├── users/          # Gestion de usuarios (admin) + perfil
│   │   │   ├── tasks/          # CRUD tareas individuales
│   │   │   ├── tools/          # Inventario de herramientas
│   │   │   ├── ai/             # Asistente IA (GitHub Models)
│   │   │   └── queue/          # Cola de procesamiento
│   │   └── prisma/             # PrismaService
│   ├── prisma/
│   │   ├── schema.prisma       # Schema completo
│   │   ├── seed.js             # Datos de prueba
│   │   └── migrations/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/           # ChatDrawer, ChatFloatingButton
│   │   │   ├── layout/         # Navbar
│   │   │   └── ProtectedRoute
│   │   ├── pages/
│   │   │   ├── auth/           # Login, Register
│   │   │   ├── dashboard/      # Dashboard principal
│   │   │   ├── projects/       # Lista, Crear, Detalle
│   │   │   ├── tasks/          # Kanban, Crear, Detalle
│   │   │   ├── admin/          # Panel de administracion
│   │   │   ├── tools/          # Inventario de herramientas
│   │   │   └── profile/        # Perfil de usuario
│   │   ├── services/           # API calls (Axios)
│   │   ├── types/              # TypeScript types
│   │   └── styles.css          # Estilos globales
│   └── package.json
└── docs/
    └── historias-usuario-fase1.md
```

## Endpoints disponibles

### Auth
- `POST /auth/register` - Registro (solo @gemeseg.com)
- `POST /auth/login` - Login, retorna JWT
- `GET /auth/profile` - Perfil del usuario autenticado

### Projects
- `POST /projects` - Crear proyecto (cualquier usuario autenticado)
- `GET /projects` - Listar proyectos (filtrado por membresia)
- `GET /projects/:id` - Detalle de proyecto
- `GET /projects/admin/stats` - Estadisticas admin
- `GET /projects/:id/tasks` - Tareas del proyecto
- `POST /projects/:id/tasks` - Crear tarea
- `GET /projects/:id/members` - Miembros del proyecto
- `POST /projects/:id/members` - Agregar miembro
- `DELETE /projects/:id/members/:userId` - Quitar miembro
- `PATCH /projects/:id/members/:userId/role` - Cambiar rol

### Tasks
- `GET /tasks/:id` - Detalle de tarea
- `PATCH /tasks/:id` - Actualizar tarea
- `DELETE /tasks/:id` - Eliminar tarea

### Users
- `POST /users` - Crear usuario (solo ADMIN)
- `GET /users` - Listar usuarios (cualquier usuario autenticado)
- `GET /users/me` - Perfil del usuario autenticado (con herramientas)
- `GET /users/stats` - Estadisticas (solo ADMIN)
- `PATCH /users/:id` - Actualizar (solo ADMIN)
- `DELETE /users/:id` - Eliminar (solo ADMIN)

### Tools
- `GET /tools` - Catalogo de herramientas
- `POST /tools` - Crear herramienta
- `DELETE /tools/:id` - Eliminar herramienta
- `GET /tools/assignments` - Asignaciones (filtros)
- `GET /tools/users` - Usuarios con herramientas
- `POST /tools/assign` - Asignar herramienta
- `PATCH /tools/assign/:id` - Actualizar asignacion
- `DELETE /tools/assign/:id` - Eliminar asignacion
- `GET /tools/assign/:id/audit` - Auditoria

### Chat IA
- `POST /chat/message` - Enviar mensaje al asistente
- `GET /chat/conversations` - Listar conversaciones (filtro por agentId)
- `GET /chat/conversations/:id/messages` - Mensajes de una conversacion

### Agents
- `GET /admin/agents` - Listar usuarios con sus agentes
- `GET /admin/agents/catalog` - Listar todos los agentes (catalogo)
- `GET /admin/agents/assignments` - Listar todas las asignaciones
- `POST /admin/agents` - Crear agente
- `PATCH /admin/agents/:id` - Actualizar agente
- `DELETE /admin/agents/:id` - Eliminar agente
- `POST /admin/agents/:id/assign/:userId` - Asignar agente a usuario
- `DELETE /admin/agents/:id/assign/:userId` - Quitar agente de usuario
- `GET /agents/available` - Agentes disponibles para el usuario actual

## Tecnologia
- **Frontend**: React 18 + Vite + TypeScript
- **Backend**: NestJS + TypeScript + Prisma ORM v7
- **Base de datos**: PostgreSQL 17
- **Autenticacion**: JWT (Passport.js)
- **Validacion**: class-validator (backend) + Zod (frontend)
- **IA**: GitHub Models (gpt-4o-mini)
- **Estilos**: CSS custom con paleta corporativa GEMESEG

## Colores corporativos
- Azul oscuro: `#100F31`
- Azul claro: `#12375F`
- Naranja: `#EE3B1B`
- Gris claro: `#E6E6E6`

## Ramas del repositorio
- `main` - Produccion, codigo estable
- `feature/CHAT-01-chat-flotante` - Chat con GitHub Models
- `feature/DASH-02-DASH-03-admin-dashboard` - Panel de administracion
- `feature/tasks-T01-T02` - CRUD de tareas y Kanban
- `feature/user-01-profile` - Perfil de usuario
- `fix/T01-T02-task-corrections` - Correcciones a tareas

## Historias de usuario completadas
- [x] HU-ADM-01: Registro e inicio de sesion
- [x] P1-04: Crear proyectos
- [x] P1-05: Listar proyectos
- [x] T-01: CRUD de tareas
- [x] T-02: Tablero Kanban
- [x] CHT-01: Chat flotante
- [x] CHT-02: Chat con GitHub Models
- [x] DASH-02: Gestion de usuarios (Admin)
- [x] DASH-03: Panel de proyectos (Admin)
- [x] SIS-01: Acceso a Herramientas
- [x] SIS-02: CRUD de Herramientas por Usuario
- [x] USER-01: Visualizacion de perfil de usuario
