# Gemeseg Mejora

## Que es este proyecto
Gemeseg Mejora es la plataforma web de gestion interna de GEMESEG (Ecuador). Empezo como gestor de proyectos y tareas y hoy es un sistema multiempresa con modulos operativos: Cacao, Custodias, Recursos Humanos, Ventas y CRM, Contratacion Publica y Sistemas, cada uno detras de permisos por seccion, mas un asistente de IA ("Agente Gemeseg") y branding propio por empresa.

> Este archivo es la portada para personas. Las reglas de negocio y los endpoints de cada modulo estan en `AGENTS.md`; los comandos y la arquitectura transversal en `CLAUDE.md`; el detalle y los porques de cada decision en `.agents/modules/`.

## Contexto
- Empresa: GEMESEG (Ecuador). Otras empresas conviven en la misma plataforma (por ejemplo Mikacao S.A.).
- Objetivo: centralizar operaciones internas en un espacio digital unico.
- Metodologia: Scrum con sprints de 1-2 semanas.
- Plataforma: **Web** (escritorio y celular; el menu lateral pasa a cajon en pantallas pequenas).
- Estado actual: en produccion.

### URLs de Produccion
- **Aplicacion:** https://app.gemeseg.com (dominio propio sobre Firebase Hosting)
- **Frontend (Firebase Hosting):** https://mejora-gemeseg.web.app
- **Backend (Cloud Run):** https://mejora-gemeseg-backend-141953681725.us-central1.run.app
- **API Docs (Swagger):** https://mejora-gemeseg-backend-141953681725.us-central1.run.app/docs

## Funcionalidades implementadas

### Autenticacion
- **Login y Registro**: JWT con 7 dias de expiracion, registro solo con correos `@gemeseg.com`.
- **Recuperar contrasena**: se pide el correo, llega un codigo de 6 digitos y con el se define la nueva contrasena.
- **Roles**: ADMIN, MANAGER, EMPLOYEE con guards en endpoints protegidos. El Gerente (MANAGER) ve Administracion, Mi Empresa y Permisos usuarios en solo lectura; si intenta cambiar algo se le explica que es solo para administradores.
- **Password**: bcrypt con salt 10.

### Permisos por seccion
Ademas del rol, cada modulo es una "seccion" con su propio control de acceso:
- Una seccion solo aparece si la empresa la tiene habilitada (la activa el super admin) o si es siempre visible.
- Dentro de una seccion habilitada, el administrador de la empresa decide por usuario quien puede ver y quien puede editar, y puede dejar modulos fijos para todo su personal.
- Inicio y Proyectos no se pueden negar a nadie; Buzon de Quejas y Encuestas estan abiertos a todo empleado.
- El backend aplica las mismas reglas que el menu, no solo el frontend.
- Secciones: Inicio, Proyectos, Administracion, Cacao, Custodias, Recursos Humanos, Ventas y CRM, Contratacion Publica, Sistemas, Mi Empresa y Empresas.

### Inicio, Proyectos y Tareas
- **Inicio**: bienvenida, mis tareas y la tarjeta "¿Conoces a alguien interesado en Gemeseg?" para referir clientes.
- **Proyectos**: cualquier usuario autenticado crea proyectos; el admin es OWNER automatico; listado filtrado por membresia, por estado y paginado; detalle con miembros y tareas.
- **Miembros**: OWNER o ADMIN agregan y quitan (nunca al ultimo OWNER); solo ADMIN cambia roles. Los VIEWER ven los botones deshabilitados.
- **Tareas y Kanban**: 4 columnas (Por hacer, En progreso, En revision, Completado), varios asignados, prioridad y fechas de inicio y fin.
- **Perfil**: datos del usuario, herramientas asignadas, estadisticas y cambio de contrasena (cierra la sesion en los demas dispositivos).

### Administracion y Empresas (white-label)
- **Usuarios**: CRUD, activar/desactivar, estadisticas por rol y ubicacion de cada persona.
- **Permisos**: pantalla del super admin (secciones por empresa) y del admin de empresa (permisos por usuario y modulos fijos).
- **Multiempresa**: cada empresa tiene su logo, colores corporativos y dominio de correo. `admin@general.com` es el super admin (sin empresa); cada empresa tiene su propio administrador.
- **Mi Empresa**: pagina de ajustes de marca para el administrador de cada empresa.

### Cacao
Back-office de comercio de cacao que replica el proceso fisico: proveedores y clientes, recepciones, lotes, liquidaciones, embarques, cuentas por pagar y por cobrar, precios fijados, calidades y kardex. Incluye una guia de uso dentro de la app (`/cacao/guia`).

### Custodias
Rutas, traslados y nomina de escoltas de seguridad. Estados `LISTO_PARA_CUSTODIAR → EN_CAMINO → LLEGO` (la nomina solo liquida lo que llego), tarifas por tipo (hacienda, puerto, VIP), PDFs de orden de custodia y de nomina, consulta por cedula y el asistente GEME-BOT.

### Recursos Humanos
- **Reclutamiento**: postulantes sincronizados desde Google Drive, revision de documentos con apoyo de IA (la persona de RRHH siempre confirma) y contratacion que mueve la carpeta a su destino.
- **Guardias y personal administrativo**: listados, fichas, alta manual, salidas y movimientos de personal (historial).
- **Cumplimiento**: checklist de documentos por cedula con semaforo y revision (aprobar/rechazar con motivo), recordatorios por correo.
- **Entidades y requisitos**, **Contratos** del personal a partir de plantillas (el Word se trae de un enlace de Drive o se sube como archivo), **Capacitaciones** con alertas de vencimiento.
- **Buzon de Quejas y Sugerencias** (abierto a todo empleado, con gestion por etapas para RRHH) y **Encuestas** (por la app o por un enlace publico para quienes no tienen cuenta).

### Ventas y CRM
- **Clientes**: ficha con campos configurables por empresa, etapas de seguimiento editables, responsable, "referido por" y columnas de la tabla elegidas por cada usuario.
- **Referidos**: cualquier empleado puede referir un cliente desde Inicio y ver en que etapa va; se le avisa cuando avanza.
- **Contratos**: plantillas `.docx` desde Google Drive con variables, generacion de PDF, numeracion automatica y firma electronica con SignWell.

### Contratacion Publica
Contratos de seguridad privada con entidades del sector publico. Hoy esta visible **Entidades Publicas**, con una carpeta de Google Drive para todo el modulo y una subcarpeta por entidad (la sincronización avisa de lo que falta en cada lado y deja decidir), entidades que se pueden archivar, campos extra configurables por empresa y vista previa de PDF, imágenes, Word (convertido a PDF) y Excel (como hoja de cálculo con pestañas, parecida a la de Drive) en la revisión de entregas, donde al volver a entregar un documento se pregunta si se reemplaza el archivo anterior o se conservan ambos; contratos, puestos, horarios con generador de rotacion e informes mensuales estan construidos pero ocultos hasta reactivarlos (ver `.agents/modules/contratacion-publica.md`).

### Sistemas
Agrupa lo tecnico: dashboard, **Herramientas** (inventario y asignacion con auditoria), **Agentes** de IA, **Base de Conocimiento** de la empresa (en el menu de Sistemas) y **Soporte Tecnico** (reportes de errores, mejoras y permisos enviados con el boton de la llave inglesa; quien reporta recibe aviso del avance y el equipo de Sistemas, el de cada reporte nuevo en la campanita). El dashboard muestra tickets por tipo y el tiempo promedio de resolucion. **Novedades** permite publicar un aviso de cambio en la app que llega por la campanita (no por correo) a quienes tienen acceso a los modulos afectados.

### Asistente de IA — "Agente Gemeseg"
- **Chat flotante**: boton + panel lateral, con conversaciones guardadas por agente y por usuario.
- **Motor**: Google Vertex AI (Gemini); sin configurar responde en modo mock. Ver `.agents/modules/agents-ai.md`.
- **Agentes**: catalogo con instrucciones y alcance, asignables a varios usuarios.
- **Manual de uso integrado**: el agente conoce las pantallas del sistema, pero solo las de los modulos que el usuario puede ver.
- **Base de Conocimiento**: documento por empresa (politicas, contactos, procesos) que el agente usa como contexto, filtrado por permisos.
- **Datos en vivo** de Cacao, Custodias, RRHH y Ventas, solo si el usuario tiene acceso a ese modulo.
- **Limite**: 50 mensajes por dia por usuario.

### Notificaciones
Campanita en toda pantalla con aviso de lo no leido. La usan Referidos, Encuestas, Soporte Tecnico y las Novedades de la app. El correo saliente (recuperacion de contrasena, recordatorios) sale por Gmail con delegacion de dominio.

## Credenciales de prueba
Solo para el entorno local: las crean los seeds (`npm run seed:minimal` deja solo `admin@gemeseg.com`, `sistemas@gemeseg.com` y el super admin; `npm run seed` crea todos los de abajo). Las cuentas de produccion tienen sus propias contrasenas.

### Super Admin (todas las empresas)
| Usuario | Email | Contrasena | Rol | Empresa |
|---------|-------|------------|-----|---------|
| Super Administrador | admin@general.com | admin2026 | ADMIN | (todas) |

### GEMESEG
| Usuario | Email | Contrasena | Rol | Cargo |
|---------|-------|------------|-----|-------|
| Administracion GEMESEG | admin@gemeseg.com | gemeseg2026 | ADMIN | Administrador del Sistema |
| Hugo Melo | hugo@gemeseg.com | gemeseg2026 | MANAGER | Gerente General |
| David Izurieta | marketing@gemeseg.com | gemeseg2026 | EMPLOYEE | Analista de Marketing Digital |
| Nayelli | nayelli@gemeseg.com | gemeseg2026 | EMPLOYEE | Analista de Recursos Humanos |
| Leidy Barzola | sistemas@gemeseg.com | gemeseg2026 | EMPLOYEE | Analista de Sistemas |

### Mikacao S.A.
| Usuario | Email | Contrasena | Rol | Cargo |
|---------|-------|------------|-----|-------|
| Administracion Mikacao | admin@mikacao.com | mikacao2026 | ADMIN | Administrador del Sistema |

El seed completo tambien crea proyectos de ejemplo (Landings, Mejora GEMESEG, Cotizador, Plataforma GEMESEG, Migracion a Google Cloud), agentes de IA y datos de Cacao y Personal; el minimo crea un solo "Proyecto de Prueba".

## Como empezar

### Requisitos previos
- Node.js 20+ (la imagen de produccion y Cloud Build usan Node 20)
- Docker, para el PostgreSQL y el Redis locales

### Infraestructura local
El desarrollo usa un Postgres y un Redis **locales**, totalmente separados de la base de produccion: crear, editar o borrar en local nunca toca datos reales.
```bash
docker compose up -d db redis     # Postgres 16 (5432) + Redis (6379)
```

### Backend
```bash
cd backend
npm install
cp ../.env.example .env           # DATABASE_URL, JWT_SECRET, FRONTEND_URL; lo demas es opcional
npx prisma generate
npx prisma db push                # crea el esquema completo (la carpeta migrations no esta al dia: no usar migrate deploy)
npm run seed:minimal              # datos minimos (o `npm run seed` para el set completo)
npm run start:dev                 # http://localhost:3000
```
Sin `GOOGLE_VERTEX_*`, SignWell o la cuenta de servicio de Google, la app arranca igual: el chat cae a modo mock y las funciones de Drive, firma y correo quedan deshabilitadas. Detalle de cada variable en `.env.example` y `AGENTS.md`.

### Frontend
```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

### Pruebas
```bash
cd backend && npm test            # pruebas unitarias (jest)
```
El frontend no tiene pruebas automatizadas; se verifica con `npm run build` (compila TypeScript) y `npm run lint`.

## Despliegue en Produccion

### Arquitectura
Un solo repositorio y **un solo pipeline** (`cloudbuild.yaml`) que se dispara con cada push a `main` y despliega, en pasos seguidos:
1. **Backend** → imagen Docker en Artifact Registry → **Cloud Run** (`mejora-gemeseg-backend`, solo API).
2. **Frontend** → `npm run build` → **Firebase Hosting**.

El dominio `app.gemeseg.com` apunta a Firebase Hosting, que es el unico origen que ve el usuario y reenvia `/api/**`, `/health` y `/docs/**` a Cloud Run (`firebase.json`).

```
Google Cloud Platform (proyecto: mejora-gemeseg)
  ├── Cloud SQL (PostgreSQL 16)   → gemeseg-db
  ├── Cloud Run                   → mejora-gemeseg-backend (API)
  ├── Firebase Hosting            → app.gemeseg.com / mejora-gemeseg.web.app (React)
  ├── Artifact Registry           → imagenes del backend
  ├── Secret Manager              → DATABASE_URL, JWT_SECRET, FRONTEND_URL, claves de SignWell y cuentas de servicio de Google
  └── Cloud Scheduler + Cloud Build → copia semanal de la base (cloudbuild.weekly-backup.yaml)
```

### Variables de entorno
En produccion no se usan archivos `.env`: las variables planas van en `cloudbuild.yaml` (`--set-env-vars`) y los secretos en Secret Manager (`--set-secrets`). Lista completa y razones en `AGENTS.md`, seccion "Despliegue en Produccion". El frontend usa `VITE_API_URL`, fijada en el paso de build del frontend.

### Base de datos
La base vive en la instancia `gemeseg-db` (proyecto `mejora-gemeseg`, region us-central1). Detalle, backups y como conectarse en solo lectura con Cloud SQL Auth Proxy: `AGENTS.md`, seccion "Despliegue en Produccion". Los modelos y enums se leen directo en `backend/prisma/schema.prisma`.

**Aviso:** los cambios de esquema NO se aplican solos al publicar (`cloudbuild.yaml` no corre migraciones). Hay que ejecutarlos a mano contra la base de produccion antes o junto con el deploy.

### Flujo de entrega
1. Trabajar en una rama (`feature/...` o `fix/...`) creada desde un `main` actualizado.
2. Verificar localmente.
3. Push de la rama y Pull Request hacia `main`.
4. Al fusionarse en `main`, Cloud Build despliega backend y frontend.

## Estructura del repositorio
```
MejoraGemeseg/
├── AGENTS.md                   # Guia para agentes: reglas de negocio y endpoints por modulo
├── CLAUDE.md                   # Comandos y arquitectura transversal
├── README.md                   # Este archivo
├── .agents/                    # Detalle y decisiones por modulo (modules/*.md) y reglas de UX/UI
├── .env.example                # Plantilla de variables de entorno
├── cloudbuild.yaml             # Pipeline de despliegue (backend + frontend)
├── cloudbuild.weekly-backup.yaml # Copia semanal de Cloud SQL
├── firebase.json               # Hosting + reenvio de /api al backend
├── docker-compose.yml          # PostgreSQL + Redis locales
├── docker-compose.dev.yml      # Override opcional para correr el backend en Docker
├── backend/
│   ├── Dockerfile              # Imagen del backend para Cloud Run
│   ├── prisma/
│   │   ├── schema.prisma       # Esquema (sin URL: va en prisma.config.js)
│   │   ├── seed.js             # Datos de ejemplo completos
│   │   └── seed.minimal.js     # Datos minimos
│   ├── prisma.config.js        # URL de conexion de Prisma v7
│   └── src/
│       ├── main.ts             # Bootstrap, CORS, Swagger
│       ├── common/             # Guards (roles, permisos por seccion) y decoradores
│       └── modules/
│           ├── auth/ users/ projects/ tasks/       # Nucleo: sesion, usuarios, proyectos, tareas
│           ├── companies/ permissions/             # Empresas (marca) y permisos por seccion
│           ├── ai/ agents/ knowledge-base/         # Agente Gemeseg, agentes y base de conocimiento
│           ├── notifications/ mail/                # Campanita y correo saliente
│           ├── cacao/ custodias/                   # Modulos operativos
│           ├── personal/                           # Recursos Humanos (Drive, cumplimiento, encuestas...)
│           ├── ventas/                             # CRM y contratos con firma electronica
│           ├── contratacion-publica/               # Contratos con el sector publico
│           ├── sistemas/ tools/                    # Soporte tecnico e inventario de herramientas
│           └── cache/ queue/                       # Redis (opcional) y colas
├── frontend/
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx             # Rutas, cada modulo envuelto en SectionRoute
│       ├── components/         # chat, layout (Sidebar), common y uno por modulo
│       ├── contexts/ hooks/    # Tema por empresa, permisos, tablas ordenables/redimensionables
│       ├── pages/              # Una carpeta por modulo (admin, cacao, custodias, personal, ventas, sistemas...)
│       ├── services/           # Llamadas a la API (Axios con JWT)
│       ├── types/              # Tipos TypeScript
│       └── styles.css          # Estilos globales
└── scripts/                    # deploy-preview.sh (vista previa en el celular) y utilidades
```

## Endpoints
La API completa se explora en Swagger (`/docs`). El detalle por modulo, con sus reglas, esta en `AGENTS.md`, seccion "Modulos Backend". Resumen de los prefijos:

| Prefijo | Modulo |
|---------|--------|
| `/auth` | Registro, login, perfil, recuperacion y cambio de contrasena |
| `/users` | Usuarios, perfil propio, ubicaciones y preferencias personales |
| `/projects`, `/tasks` | Proyectos, miembros y tareas |
| `/companies`, `/permissions`, `/admin/...` | Empresas, branding y permisos por seccion |
| `/chat`, `/admin/agents`, `/agents`, `/company-knowledge-base` | Agente Gemeseg, agentes y base de conocimiento |
| `/notifications` | Bandeja de notificaciones |
| `/cacao/...` | Proveedores, recepciones, lotes, liquidaciones, embarques, cuentas, kardex |
| `/custodias` | Custodias, nomina, PDFs y GEME-BOT |
| `/personal/...`, `/public/surveys/:token` | Recursos Humanos (reclutamiento, cumplimiento, capacitaciones, quejas, encuestas) |
| `/ventas/...` | Clientes, referidos, plantillas, contratos y firma |
| `/contratacion-publica/...` | Entidades, contratos, puestos, horarios, informes, entregas (revisión con vista previa, historial y bandejas) |
| `/sistemas/...`, `/tools` | Soporte tecnico e inventario de herramientas |

## Tecnologia
- **Frontend**: React 18 + Vite + TypeScript, react-router, React Hook Form + Zod
- **Backend**: NestJS 11 + TypeScript + Prisma ORM v7
- **Base de datos**: PostgreSQL 16 (Cloud SQL `gemeseg-db` en produccion)
- **Autenticacion**: JWT (Passport.js)
- **Validacion**: class-validator (backend) + Zod (frontend)
- **IA**: Google Vertex AI (Gemini) — ver `AGENTS.md` y `.agents/modules/agents-ai.md`
- **Integraciones**: Google Drive y Gmail (cuenta de servicio), SignWell (firma electronica), LibreOffice (DOCX a PDF), PDFKit
- **Estilos**: CSS custom con paleta corporativa GEMESEG
- **Deploy**: Cloud Run (backend) + Firebase Hosting (frontend) + Cloud SQL (DB), todo desde `cloudbuild.yaml`

## Colores corporativos
- Azul oscuro: `#100F31`
- Azul claro: `#12375F`
- Naranja: `#EE3B1B`
- Gris claro: `#E6E6E6`

## Ramas del repositorio
- `main` — produccion; todo entra por Pull Request.
- `feature/<nombre>` — funcionalidades nuevas.
- `fix/<nombre>` — correcciones.

Siempre se crea la rama desde un `main` recien actualizado (`git pull origin main`).

## Historias de usuario completadas
- [x] HU-ADM-01: Registro e inicio de sesion
- [x] P1-04: Crear proyectos
- [x] P1-05: Listar proyectos
- [x] T-01: CRUD de tareas
- [x] T-02: Tablero Kanban
- [x] CHT-01: Chat flotante
- [x] CHT-02: Chat con IA (hoy Google Vertex AI; antes GitHub Models)
- [x] DASH-02: Gestion de usuarios (Admin)
- [x] DASH-03: Panel de proyectos (Admin)
- [x] SIS-01: Acceso a Herramientas
- [x] SIS-02: CRUD de Herramientas por Usuario
- [x] USER-01: Visualizacion de perfil de usuario
- [x] COMP-01: Gestion de empresas (CRUD, branding, logo)
- [x] COMP-02: Datos por empresa (asociacion usuario-empresa, super admin)

Desde entonces se sumaron, sin codigo de historia asignado: permisos por seccion, Cacao, Custodias, Recursos Humanos, Ventas y CRM, Contratacion Publica, Sistemas, notificaciones y la base de conocimiento del agente.
