# Gemeseg Mejora - Guia para agentes

Reglas globales del proyecto. Las reglas de cada modulo estan en `.agents/modules/<modulo>.md` (ver «Modulos»): leer solo el del modulo que se toca. `CLAUDE.md` anade comandos y arquitectura transversal. Las reglas de pantalla estan en `.agents/modules/frontend-ui.md` y `.agents/RECOMENDACIONES_UX_UI.md`. El schema (`backend/prisma/schema.prisma`) es la unica fuente de modelos y enums.

## Contexto
- **Empresa:** GEMESEG (Ecuador). Ecosistema web (no movil) para centralizar y automatizar procesos internos; multiempresa (white-label).
- **URLs:** app `https://app.gemeseg.com` (dominio sobre Firebase Hosting, que reenvia `/api/**`, `/health`, `/docs/**` a Cloud Run); `https://mejora-gemeseg.web.app`; API Docs (Swagger) en `/docs` del backend.

## Stack
- **Backend:** NestJS v11 + TypeScript, Prisma v7 (`prisma.config.js`; `schema.prisma` NO lleva `url` en el datasource), PostgreSQL 16, Passport JWT (7 dias) + bcryptjs, class-validator, Swagger.
- **IA:** Google Vertex AI (Gemini) para el chat y la revision de documentos. No usar GitHub Models. Ver `agents-ai.md`.
- **Frontend:** React 18 + Vite, react-router-dom, React Hook Form + Zod, Axios con interceptor JWT, CSS propio con paleta corporativa.
- **Produccion (GCP, proyecto `mejora-gemeseg`):** Cloud SQL PostgreSQL 16 (`gemeseg-db`), Cloud Run (`mejora-gemeseg-backend`, us-central1), Firebase Hosting, Artifact Registry, Secret Manager.
- **Desarrollo:** Postgres 16 y Redis en Docker, backend `localhost:3000`, frontend `localhost:5173`.

## Convenciones de codigo
- **NestJS:** un modulo por dominio; DTOs con `class-validator` en toda entrada; `@Roles(UserRole.ADMIN)` + `RolesGuard`; responses consistentes; nombres en ingles. El id del usuario autenticado es `req.user.userId` (no `sub`); `companyId` y `role` salen de `req.user` y filtran los datos.
- **React:** componentes PascalCase; servicios Axios en `src/services/`, paginas en `src/pages/`, tipos en `src/types/`; `noUnusedLocals`/`noUnusedParameters` activos.
- **Prisma:** migraciones con `prisma migrate dev --name <nombre>`; seed en `prisma/seed.js`. Las tablas y columnas nuevas se crean ademas al arrancar (ver `CLAUDE.md`).
- **TypeScript:** sin `any` sin justificacion.

## Git y entrega
- Ramas: `main` (produccion), `feature/<nombre>`, `fix/<nombre>`. `git pull origin main` ANTES de crear una rama. Commits `feat:`, `fix:`, `refactor:`, `docs:`, `test:`. Nunca commits directos a `main`.
- **Push, PR y merge solo con autorizacion explicita del usuario en ese momento.** Al terminar un bloque: verificar que compila y que la prueba manual pasa; luego, con permiso, commit → push → PR hacia `main` con resumen, como verificarlo y lo pendiente.
- Autoria: `Leidy Barzola <sistemas@gemeseg.com>`, nunca el asistente. Sin trailers de IA (`Co-Authored-By`, «Generated with») en commits ni PR.
- **El repositorio de GitHub es PUBLICO** (`ljbarzola/MejoraGemeseg`): nunca subir claves, `.env`, service accounts, contrasenas ni datos reales de personas o clientes.
- Ramas fusionadas se borran; las viejas sin fusionar se archivan como etiqueta `archive/<nombre>`. No dejar trabajo largo en `git stash`.
- Tras probar, borrar carpetas `git worktree`, bases de prueba, scripts y capturas temporales (salvo las de una funcion con problemas pendientes). En Windows un worktree puede tener `node_modules` como junction: quitar el enlace con `rmdir` antes de borrar.

## Despliegue
- **Un solo pipeline:** `cloudbuild.yaml` (Cloud Build) se dispara al empujar a `main`: construye `backend/Dockerfile` (solo API) y lo despliega en Cloud Run; luego construye el frontend y lo despliega en Firebase Hosting. No se despliega a mano con `firebase deploy` ni `gcloud run deploy`. No hay workflows de GitHub Actions: no reintroducir un deploy por esa via.
- Los secretos de Cloud Run son los de `--set-secrets` en `cloudbuild.yaml`; un secreto nuevo se crea en Secret Manager ANTES de anadirlo ahi, o el despliegue falla. Nunca `.env` en produccion.
- `GOOGLE_SERVICE_ACCOUNT_JSON` es el contenido de `backend/google-service-account.json` (gitignored, no entra a la imagen); si se rota la cuenta, actualizar tambien el secreto.
- Frontend: `VITE_API_URL` apunta a la API; nunca hardcodear URLs.
- **Local:** `docker compose up -d db redis`, luego en `backend/`: `npx prisma generate`, `npx prisma db push`, `npm run seed:minimal`. La BD local esta separada de produccion. Variables: `DATABASE_URL` (Postgres del `docker-compose.yml`), `JWT_SECRET` (largo, aleatorio, distinto al de produccion), `FRONTEND_URL`; opcionales `GOOGLE_VERTEX_*` (sin ellas la IA cae a modo mock) y las de Bitacora (ver `bitacora.md`).
- **Produccion solo lectura:** unicamente por Cloud SQL Auth Proxy (`mejora-gemeseg:us-central1:gemeseg-db`, puerto local alterno) con una `DATABASE_URL` temporal; nunca conexion directa a la IP publica ni como `.env` por defecto.
- **Cloud SQL (`gemeseg-db`):** conexion de Cloud Run por socket del conector; SSL obligatorio en acceso directo y sin redes autorizadas; copia diaria nativa (7 retenidas, sin PITR) mas copia manual antes de cada deploy con cambios de esquema o datos (`gcloud sql backups create --instance=gemeseg-db --project=mejora-gemeseg`); proteccion contra borrado activa; mantenimiento fijo domingo 06:00 UTC; una zona, region `us-central1`; `db-f1-micro` (no subir pool Prisma `max=3` ni `max-instances`); Cloud Run `--min-instances=0` (cold start). Alertas de copia fallida llegan al correo de Sistemas. `cloudbuild.weekly-backup.yaml` esta sin uso: su job se borro. Pasa siempre `--project=mejora-gemeseg` en `gcloud`.

## Autenticacion
Login `POST /auth/login` devuelve JWT `{ sub, email, role }` (7 dias, bcrypt salt 10). No hay registro publico: las cuentas las crea un administrador (`POST /users`). Detalle y endurecimiento en `users.md`.

## Reglas de negocio generales
- **Super Admin** (`companyId: null`): ve y gestiona todas las empresas y secciones. **Admin de empresa:** solo su empresa; es OWNER automatico de todos los proyectos de su empresa y no aparece como miembro para usuarios normales.
- **Proyectos:** cualquier usuario autenticado crea; OWNER y MEMBER editan; solo OWNER/ADMIN eliminan. Owners agregan/quitan miembros, no pueden quitar al ultimo OWNER ni a si mismos. Viewers ven los botones deshabilitados (no ocultos) y no crean ni editan tareas. Detalle en `proyectos-tareas.md`.
- **Empresas (white-label):** nombre, slug, logo, colores, dominio de correo; usuarios ligados por `companyId`; proyectos y datos se filtran por membresia. `GET /companies/slug/:slug` es publico (branding del login). El logo se guarda en `StoredFile` y se sirve en `GET /api/uploads/logos/:archivo`; toda pantalla que muestre un logo usa `resolveLogoUrl` de `ThemeContext`.
- **Agentes de IA:** solo ADMIN los gestiona; el `agentId` del chat se valida en cada mensaje (asignacion o creador; el de Ventas exige ademas permiso de Ventas). Ver `agents-ai.md`.

### Permisos: dos capas independientes (revisar ambas en toda ruta nueva)
1. **RolesGuard** (`@Roles(...)`): rol grueso ADMIN/MANAGER/EMPLOYEE por endpoint.
2. **Secciones** (`PermissionsService`, `ALL_SECTIONS`): DASHBOARD, PROJECTS, ADMIN, CACAO, COMPANY_SETTINGS, COMPANIES, RRHH, VENTAS, CONTRATACION_PUBLICA, OPERACIONES, SISTEMAS, BITACORA, CONTABILIDAD. Una seccion se ve si es `alwaysEnabled` o la activa el super admin por empresa (`CompanySection`); dentro, `UserPermission.canView/canWrite` restringe por usuario. CUSTODIAS y TOOLS no son secciones: las gobiernan OPERACIONES y SISTEMAS.
- **Al agregar un modulo:** anadirlo a `ALL_SECTIONS`, proteger sus endpoints (`@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)` + `@Section('SECCION', 'view'|'write')`) y envolver sus rutas front en `<SectionRoute section="...">`. Un endpoint con `RolesGuard` correcto sigue expuesto si falta la seccion.
- `SectionPermissionGuard` (usar cuando el acceso depende del modulo, no del cargo): super admin pasa; seccion no habilitada → 403; con fila `UserPermission` manda su `canView/canWrite`; **sin fila se permite** (default permisivo para usuarios antiguos, cubierto por test: no invertirlo), salvo en las secciones cerradas por defecto (`SECCIONES_CERRADAS_POR_DEFECTO`: SISTEMAS, BITACORA, CONTABILIDAD), donde sin fila no hay acceso.
- Un usuario nuevo no debe depender del default permisivo: `UsersService.create()` siembra filas explicitas (ver `users.md`).
- **SISTEMAS es `alwaysEnabled` y debe seguir siendolo** (si no, el menu de Herramientas y Agentes desaparece para todas las empresas). DASHBOARD y PROJECTS son `siempreVisible` y no se niegan por usuario.
- **Modulos fijos por empresa** (`CompanySection.fixedForAll`, `POST /permissions/sections/:companyId/fixed`, `SetFixedSectionsDto` acepta lista vacia): se ignoran en la capa `UserPermission` sin borrar el dato individual.
- **MANAGER** ve Administracion, Mi Empresa y Permisos usuarios en solo lectura por rol (`SECCIONES_VISTA_GERENTE`); solo los GET aceptan `@Roles(ADMIN, MANAGER)`, todo lo que escribe es solo ADMIN; los botones bloqueados se ven y abren `SoloAdminDialog`.
- **Nunca redirigir a una ruta fija al negar acceso:** `SectionRoute` usa `landingRoute` (primera seccion visible; si no hay ninguna, un mensaje) para no crear bucles.
- Endpoints: `GET /permissions/my` (la sesion lo consulta al cargar; `PermissionsContext` + `usePermissions` exponen `canView`), `GET/POST /permissions/sections/:companyId` (POST solo super admin), `GET/POST /permissions/users/...`.

## Modulos
Cada modulo tiene sus reglas, decisiones y trampas en su archivo de `.agents/modules/`. Leerlo antes de tocar ese modulo.

| Modulo (ruta/seccion) | Archivo |
|---|---|
| Auth, Users, perfil, sesiones | `users.md` |
| Proyectos y tareas | `proyectos-tareas.md` |
| Sistemas: herramientas, notificaciones, correo, base de conocimiento | `sistemas.md` |
| Agentes de IA: chat, Agente Gemeseg, Ventas, Cacao, Custodia | `agents-ai.md` |
| Mejora continua (agente semanal) | `mejora-continua.md` |
| Recursos Humanos (Personal, Guardias, quejas, encuestas) | `recursos-humanos.md` |
| Reclutamiento | `reclutamiento.md` |
| Movimientos de personal | `movimientos-personal.md` |
| Ventas y CRM, contratos, documentacion | `ventas-contratos.md` |
| Cotizador | `ventas-cotizador.md` |
| Bot de WhatsApp | `whatsapp-bot.md` |
| Cacao | `cacao.md` |
| Custodias (viajes) | `custodias.md` |
| Contabilidad | `contabilidad.md` |
| Contratacion Publica | `contratacion-publica.md` |
| Operaciones (contratos, horarios, bitacoras de guardiania, inventario, faltas) | `operaciones.md` |
| Bitacora del equipo | `bitacora.md` |
| Reglas de pantalla (tablas, cabeceras, modales, filtros) | `frontend-ui.md` |

## Cuentas de prueba
Solo en la base **local**: las crean los seeds de `backend/prisma/` (super admin, admin por empresa y empleados de ejemplo). El repo es publico: aqui no se escribe ninguna contrasena ni correo de persona. Las cuentas de seed no deben existir en produccion con contrasena de seed; antes de cada despliegue comprobar que las reales (sobre todo el super admin) tienen otra y que `JWT_SECRET` de Secret Manager no coincide con ningun ejemplo.

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
- Hardcodear un `z-index` numerico en un boton flotante nuevo: usar la escala compartida `--z-fab`/`--z-report-btn`/`--z-panel` de `styles.css` (o sumar una variable a esa escala).

## Vista movil
Base de escritorio (sidebar fija de 240px); bajo `@media (max-width: 768px)` el sidebar es un cajon deslizante con boton hamburguesa. En pantallas nuevas: sin columnas laterales de `width` fijo (salvo `personal-split-aside`); rejillas con `minmax(min(Npx, 100%), 1fr)`; campos a 16px (iOS hace zoom por debajo); filas de botones con `flexWrap: 'wrap'` y objetivo tactil ~40px.

## Preview en dispositivo
`./scripts/deploy-preview.sh [canal] [caducidad]` publica el frontend en un canal temporal de Firebase Hosting y devuelve una URL publica para abrirla en el telefono (requiere `npx firebase-tools login`).
