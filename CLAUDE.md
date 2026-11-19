# CLAUDE.md

Guia para Claude Code en este repo. Leer primero `AGENTS.md` (stack, despliegue, permisos, reglas globales, «LO QUE NO DEBES HACER»); este archivo solo anade comandos y arquitectura transversal. Las reglas por modulo estan en `.agents/modules/<modulo>.md` (indice en `AGENTS.md`); las de pantalla en `.agents/modules/frontend-ui.md`. Mantener los tres en sintonia cuando cambie el codigo.

## Comandos

### Backend (`backend/`)
```bash
npm run start:dev        # http://localhost:3000
npm run build            # nest build
npm run lint             # eslint --fix
npm test                 # jest (*.spec.ts); npm test -- custodias.service filtra por nombre
npm run test:cov
npm run test:e2e         # backend/test/app.e2e-spec.ts
npx prisma migrate dev --name <nombre>
npx prisma generate
node prisma/seed.js          # datos de ejemplo completos (pesado)
npm run seed:minimal         # 1 empresa, 2 usuarios, 1 proyecto, Personal basico
```
`schema.prisma` no lleva `datasource url`: la URL vive en `backend/prisma.config.js` (lee `DATABASE_URL`). No volver a ponerla.

### Frontend (`frontend/`)
```bash
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint
npm test         # vitest, solo logica pura (Cotizador, fechas de la Bitacora); no hay tests de componentes
```

### Extension del navegador (`extension-bitacora/`)
Sin build para probar: `src/` es la extension (cargarla sin empaquetar). `node build.mjs --dev http://localhost:3100/api` genera `dist/` contra el servidor local; `node build.mjs` genera el de produccion; `npm test` corre `node --test` sobre `src/lib.js`. Las reglas del servidor (`backend/src/modules/bitacora/bitacora-extension.util.ts`) y `lib.js` deben mantenerse iguales.

### Infra local
```bash
docker compose up -d db redis     # Postgres 16 (5432) + Redis (6379)
cd backend
npx prisma db push                # esquema completo actual; NO usar `migrate deploy` (la carpeta de migraciones esta incompleta)
npm run seed:minimal
```
- `docker-compose.dev.yml` es solo un override para correr el `backend` dentro de Docker; el flujo normal es `npm run start:dev` fuera de Docker contra los contenedores `db`/`redis`.
- `prisma db push` avisa que borrara tablas que crea el servidor al arrancar (p. ej. `AuthAttempt`): **no aceptar** (`--accept-data-loss`); arrancar el servidor y se crean solas, como en produccion.
- Datos reales de produccion: solo lectura por Cloud SQL Auth Proxy (ver `AGENTS.md`), nunca como `DATABASE_URL` por defecto.

### Patron de tests unitarios del backend
Los servicios reciben un unico `PrismaService`, asi que los specs instancian la clase directo (`new XService(mockPrisma as unknown as PrismaService)`) sin `TestingModule`. `mockPrisma` es un objeto plano de `jest.fn()` con la forma de los delegados que el servicio usa. Ejemplos: `custodias.service.spec.ts`, `permissions.service.spec.ts`, `ventas-contratos.service.spec.ts` (este usa `jest.mock('fs')` / `jest.mock('axios')`: siempre auto-mock; espiar el `fs` real da «Cannot redefine property»). `eslint.config.mjs` baja `no-unsafe-*`/`unbound-method` a warning en `**/*.spec.ts`.

## Arquitectura transversal

### Despliegue
Todo sale de `cloudbuild.yaml` al empujar a `main` (ver `AGENTS.md`, «Despliegue»): backend (solo API) a Cloud Run y frontend a Firebase Hosting en el mismo build; el frontend se publica solo después de que Cloud Run termine de desplegar el backend. `firebase.json` reenvia `/api/**`, `/health` y `/docs/**` de Hosting a Cloud Run, y `app.gemeseg.com` es dominio personalizado sobre Hosting.
- No meter el frontend en `backend/Dockerfile`: es un paso aparte para que un fallo del frontend no bloquee el backend.
- El paso de Firebase usa el builder oficial `us-docker.pkg.dev/firebase-cli/us/firebase` con la identidad ambiental de la cuenta de servicio de Cloud Build. No usar `npx firebase-tools` sobre `node:20` (no toma esa identidad) ni un token personal `firebase login:ci` (se revoca), ni claves de service account (la politica de la organizacion las bloquea).
- Variables de entorno de Cloud Run y secretos: solo en `cloudbuild.yaml` (`--set-env-vars`, `--set-secrets`); lo puesto a mano en la consola se pierde en el siguiente deploy. Pool de Prisma limitado a 3 (`DATABASE_POOL_MAX`).
- `REDIS_HOST` vacio en produccion: `CacheService` queda desactivado (todo `get()` devuelve `null`); en local si hay cache real, asi que un camino de cache-hit probado en local puede no ocurrir en produccion.
- Sin `GOOGLE_SERVICE_ACCOUNT_JSON`, todo lo de Drive (RRHH: Reclutamiento, Cumplimiento, Guardias) falla en produccion aunque funcione en local.

### Tareas programadas: endpoints HTTP llamados por Cloud Scheduler, nunca `@Cron`
`ScheduleModule` existe pero nada usa `@Cron` (con `--min-instances=0` la instancia puede estar dormida y Redis/BullMQ esta apagado). Los trabajos son endpoints publicos protegidos con el header `x-cron-secret` = `CRON_SECRET` (sin variable → 404, header incorrecto → 401, `?dryRun=true` lista sin enviar). Endpoints: recordatorios de tareas `POST /tasks/reminders-cron/run`; Contratacion Publica `entregas-cron/recordatorios`; Ventas `POST /ventas/renovaciones-cron/generar`; RRHH `POST /personal/vencimientos-cron/run`; Operaciones `POST /operaciones/resumen-cron/run`; Bitacora `POST /bitacora/google-cron/sincronizar`. Cada Cloud Scheduler job se crea aparte; el detalle de cada uno esta en su modulo.
- Un secreto nuevo se crea en Secret Manager ANTES de anadirlo a `--set-secrets`.
- Nunca imprimir la salida de `gcloud scheduler jobs create/update` (muestra `x-cron-secret` en claro). `gcloud` local apunta a otro proyecto por defecto: pasar siempre `--project=mejora-gemeseg`.

### Archivos que deben sobrevivir un reinicio van por `StoredFile`
El disco de Cloud Run se borra al reciclar la instancia. Todo archivo que la app genere o reciba y deba conservarse (plantillas `.docx` de Ventas y Contratacion Publica, PDFs de contratos, logos, fotos de bitacoras) se guarda con `common/utils/stored-file.util.ts`: el contenido va a la tabla `StoredFile` (clave logica unica, p. ej. `ventas/contracts/<archivo>.pdf`) y el disco es solo cache (lee disco → BD). `ventas/ventas-files.util.ts` agrupa rutas y claves de Ventas. Nunca `fs.writeFileSync` directo para algo que deba persistir.

### Tablas y columnas nuevas se crean al arrancar (los deploys no corren migraciones)
- **Tablas nuevas:** las crean servicios de esquema propios al arrancar (`VentasSchemaService`, `bitacora.schema.ts`, `contabilidad.schema.ts`, `UserPreference`…); suelen no tener modelo Prisma.
- **Columna nueva en una tabla EXISTENTE:** Prisma selecciona todas las columnas del modelo en cada consulta, asi que declarar en `schema.prisma` una columna que produccion aun no tiene rompe toda consulta a esa tabla (para `User`, todo login). Se agrega con `ADD COLUMN IF NOT EXISTS` dentro de `PrismaService.onModuleInit`, justo despues de conectar (ejemplo: `src/prisma/user-phone.schema.ts`); si falla, el servidor no debe arrancar. Aditiva y nullable para poder revertir el deploy. La carpeta `prisma/migrations/<fecha>_*` queda solo como referencia.

### Seguridad de sesion
- `User.password` se omite de toda consulta (`PrismaService` con `omit` global; solo `auth.service.ts` la pide). Sin registro publico. Login, solicitud de restablecer y cambio de contrasena tienen limite de intentos (`AuthAttempt`). Detalle en `users.md`.
- Cambiar o restablecer la contrasena cierra las otras sesiones (`UserSessionCutoff`, `auth/session-cutoff.service.ts`; `JwtStrategy` rechaza tokens con `iat` anterior, falla abierto, cache de 30 s).
- Autorizacion en dos capas (rol + seccion) y como agregar un modulo: ver `AGENTS.md`, «Permisos».

### Multitenencia por `companyId`
`User.companyId` es el unico limite de tenencia; el resto de los datos (proyectos, tareas, cacao, ventas…) se aisla indirectamente por el usuario que actua, no con un filtro `companyId` propio en todos lados: revisar la consulta de cada servicio antes de asumir aislamiento. `companyId: null` significa super admin, no «sin empresa».

### Modulos de dominio (`backend/src/modules/`)
Cada uno es un modulo NestJS autocontenido en `app.module.ts`. Que hace y que reglas tiene cada uno: `.agents/modules/<modulo>.md` (indice en `AGENTS.md`). Puntos que cruzan archivos:
- `cacao/` (linea blanca por empresa), `custodias/` (viajes; los gobierna la seccion OPERACIONES), `contabilidad/` (pagos de custodias), `contratacion-publica/` (en el codigo viven tambien los contratos, puestos, horarios y bitacoras de guardiania, que son el modulo Operaciones), `operaciones-inventario/`, `personal/` (RRHH), `ventas/` (CRM, Cotizador, Documentacion y firma con SignWell), `whatsapp-bot/`, `bitacora/` (con la extension `extension-bitacora/`).
- Varios integran servicios externos (Google Drive via `googleapis`, SignWell, Meta, Vertex AI): comprobar llaves en entorno/Secret Manager antes de asumir que algo funciona en local.
- Reglas de precio duplicadas: `backend/.../cotizador-precios.util.ts` copia `frontend/src/utils/cotizador/pricing.ts`; un cambio de regla se hace en AMBOS.
- Vocabulario y nombres de pantalla de Ventas (Posibles clientes, Directorio, Oportunidades, Contratos, Documentacion): `ventas-contratos.md`, seccion 17. Las claves de etapa (`RECIBIDO`…`RECHAZADO`) estan hardcodeadas en analitica e IA: solo se cambian etiquetas, nunca claves.

### Frontend
Reglas de layout, cabeceras, tablas, filtros y modales: `.agents/modules/frontend-ui.md`. Cada ruta de modulo va dentro de `<SectionRoute section="...">` en `App.tsx`.
