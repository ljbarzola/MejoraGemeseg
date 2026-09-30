# Arquitectura del Software

## Vision General
MejoraGemeseg es una plataforma web multi-tenant para gestionar procesos internos de GEMESEG y sus empresas afiliadas.

## Stack Tecnologico

### Backend
- **Framework:** NestJS v11 + TypeScript
- **ORM:** Prisma v7 (con `@prisma/adapter-pg`)
- **Base de datos:** PostgreSQL 17
- **Auth:** Passport.js (JWT, expira 7 dias) + bcryptjs (salt 10)
- **Validacion:** class-validator + class-transformer
- **IA:** Google Vertex AI (Gemini) — chat "Agente Gemeseg" (`GOOGLE_VERTEX_CHAT_MODEL`) y revisión de documentos de RRHH (`GOOGLE_VERTEX_MODEL`), ver `.agents/modules/agents-ai.md`. GitHub Models se retiró del chat el 2026-09-29 (seguía en uso solo por `DocumentExtractionService` de RRHH, pendiente de migrar).
- **PDF:** PDFKit (custodias: orden, nomina, rol de pago)

### Frontend
- **Framework:** React 18 + Vite
- **Routing:** react-router-dom
- **HTTP:** Axios (con interceptor JWT)
- **Estilos:** CSS custom con paleta corporativa

### Infraestructura
- **Desarrollo:** Docker (PostgreSQL + Redis), Backend :3000, Frontend :5173
- **Produccion:** Google Cloud SQL (DB, instancia `gemeseg-db`), Cloud Run (backend), Firebase Hosting (frontend)

## Patrones de Diseno

### Multi-tenancy
- `companyId` en User y modelos de datos
- Super Admin (`companyId: null`) ve todo
- Company Admin solo ve su empresa
- Filtros por `companyId` en todos los queries

### Permisos
- `CompanySection`: que secciones puede ver cada empresa
- `UserPermission`: que puede ver/escribir cada usuario
- `SectionRoute`: wrapper en frontend que redirige si no tiene acceso
- `usePerm()`: hook para verificar permisos en componentes

### Layout
- Sidebar izquierdo colapsable (64px / 240px)
- `main-content` con margin-left dinamico
- `page-container` para contenido de paginas
- `page-card` para tarjetas de formulario

### CSS Classes Principales
- `.page-container`, `.page-header-row`, `.page-eyebrow`
- `.page-card`, `.admin-section`
- `.form-group`, `.form-row`, `.form-actions`, `.cacao-form`
- `.tasks-table-wrapper`, `.tasks-table`
- `.auth-btn`, `.btn-secondary`, `.btn-danger-sm`
- `.status-badge`, `.sidebar-*`

## Colores Corporativos
- Azul Oscuro: `#100F31`
- Azul Claro: `#12375F`
- Naranja: `#EE3B1B`
- Gris Claro: `#E6E6E6`

## Archivos permanentes: `StoredFile` (2026-09-30)
El disco de Cloud Run se borra cada vez que la instancia se recicla (`--min-instances=0`). Todo archivo que la app genera o recibe y que tiene que seguir existiendo (plantillas `.docx` de Ventas y de Contratación Pública, PDFs de contratos de Ventas: generados y firmados) se guarda con `common/utils/stored-file.util.ts`: el contenido real va a la tabla `StoredFile` (clave lógica única, p. ej. `ventas/contracts/<archivo>.pdf`) y el disco queda solo como caché. Al leer: disco → base (y se reescribe el disco); un archivo viejo que existía solo en disco se respalda en la base la primera vez que se lee. Para Ventas, `ventas/ventas-files.util.ts` agrupa las rutas y claves; una plantilla que ya se había perdido se vuelve a bajar de su enlace de Drive si lo tiene. **Cualquier archivo nuevo que deba sobrevivir a un reinicio debe pasar por estas funciones, no por `fs.writeFileSync` directo.** (Pendiente con el mismo problema: los PDFs de informes de Contratación Pública; se pueden regenerar.)

## Sesión vencida en el frontend (2026-09-30)
El JWT dura 7 días. Antes el frontend solo miraba que hubiera un token guardado: con uno vencido la app seguía abierta, todas las llamadas daban 401 en silencio y el menú caía a solo Inicio/Buzón/Encuestas/Proyectos (Ctrl+F5 no lo arreglaba porque el token sigue en `localStorage`; en ventana privada sí funcionaba). Ahora `auth.service.ts` revisa el `exp` del token en `isAuthenticated()` y un interceptor de respuesta cierra la sesión ante cualquier 401 fuera de `/auth/`, mandando a `/login` con el aviso "Tu sesión expiró". `usePermissions` reintenta (1s, 3s) si la carga de permisos falla por otra causa, conserva la última carga buena en vez de vaciar el menú, y si nunca cargó muestra en el sidebar "No se pudieron cargar todos tus módulos" con "Reintentar".
