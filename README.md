# Gemeseg Mejora

## Que es este proyecto
Gemeseg Mejora es una plataforma web de gestion interna para GEMESEG (Ecuador), disenada para centralizar proyectos, tareas y usuarios. Esta primera fase cubre autenticacion, gestion de proyectos con roles y una interfaz moderna alineada a la identidad corporativa.

## Contexto
- Empresa: GEMESEG (Ecuador)
- Objetivo: centralizar operaciones internas en un espacio digital unico.
- Metodologia: Scrum con sprints de 1-2 semanas.
- Plataforma: **Web** (no movil).
- Estado actual: Fase 1 en desarrollo.

## Funcionalidades implementadas
- **Autenticacion JWT**: registro solo con correos `@gemeseg.com`, login, token de 7 dias.
- **Roles de usuario**: ADMIN, MANAGER, EMPLOYEE con guards en endpoints protegidos.
- **Gestion de proyectos**: crear (ADMIN/MANAGER), listar con filtro por estado, paginacion de 10 por pagina, vista detalle.
- **Proteccion por rol**: solo ADMIN y MANAGER pueden crear proyectos.
- **Formularios validados**: React Hook Form + Zod en frontend.
- **Diseño web responsive**: interfaz optimizada para escritorio y movil.

## Credenciales de prueba
Todos los usuarios usan la contrasena: **gemeseg2026**

| Usuario | Email | Rol |
|---------|-------|-----|
| Leidy Ponce | leidy@gemeseg.com | ADMIN |
| Carlos Mendoza | carlos@gemeseg.com | MANAGER |
| Andrea Vera | andrea@gemeseg.com | EMPLOYEE |
| Miguel Torres | miguel@gemeseg.com | EMPLOYEE |

## Como empezar

### Requisitos previos
- Node.js 18+
- PostgreSQL 17 (instalado localmente o via Docker)

### Backend
```bash
cd backend
npm install
# Configurar .env con DATABASE_URL y JWT_SECRET
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

### Endpoints disponibles
- `POST /auth/register` - Registro (solo @gemeseg.com)
- `POST /auth/login` - Login, retorna JWT
- `GET /auth/profile` - Perfil del usuario autenticado
- `POST /projects` - Crear proyecto (ADMIN/MANAGER)
- `GET /projects` - Listar proyectos (con filtro y paginacion)
- `GET /projects/:id` - Detalle de proyecto
- `GET /docs` - Swagger API docs

### Seed de prueba
```bash
cd backend
node prisma/seed.js
```

## Estructura del repositorio
```
gemeseg-mejora/
├── AGENT.md
├── docker-compose.yml
├── backend/
│   ├── src/
│   │   ├── common/
│   │   │   ├── decorators/    (Roles decorator)
│   │   │   └── guards/        (RolesGuard)
│   │   ├── modules/
│   │   │   ├── auth/          (register, login, JWT)
│   │   │   ├── projects/      (CRUD proyectos)
│   │   │   ├── users/         (gestion de usuarios)
│   │   │   └── tasks/         (por implementar)
│   │   └── prisma/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.js
│   │   └── migrations/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── auth/          (Login, Register)
│   │   │   ├── dashboard/
│   │   │   └── projects/      (Listar, Crear, Detalle)
│   │   ├── services/          (API calls)
│   │   └── types/
│   └── package.json
└── docs/
    └── historias-usuario-fase1.md
```

## Tecnologia
- **Frontend**: React 18 + Vite + TypeScript
- **Backend**: NestJS + TypeScript + Prisma ORM
- **Base de datos**: PostgreSQL 17
- **Autenticacion**: JWT (Passport.js)
- **Validacion**: class-validator (backend) + Zod (frontend)
- **Estilos**: CSS custom con paleta corporativa GEMESEG

## Colores corporativos
- Azul oscuro: `#100F31`
- Azul claro: `#12375F`
- Naranja: `#EE3B1B`
- Gris claro: `#E6E6E6`

## Historias de usuario completadas
- [x] HU-ADM-01: Registro e inicio de sesion
- [x] P1-04: Crear proyectos
- [x] P1-05: Listar proyectos
