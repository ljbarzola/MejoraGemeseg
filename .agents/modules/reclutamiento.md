# Modulo Reclutamiento

## Estado actual
Activo en desarrollo. Sprint 1 (estabilizacion Personal), Sprint 2 (verificacion asistida), Sprint 2b (PoC navegador real — veredicto negativo confirmado), Sprint 3 (aprobacion/rechazo documental), Sprint 4 (fix sync BD↔Drive de vacantes + reasignacion de archivos adicionales), Sprint 5 (requisitos obligatorios/opcionales, expediente del postulante, rediseño del modal de vacante) y Sprint 6 (contratar un postulante → Guardia sin entidad) completados. El modulo de Reclutamiento funciona con dos sistemas paralelos: candidatos sincronizados desde Google Drive (solo lectura, salvo la acción de contratar) y candidatos en base de datos (CRUD completo con Kanban) — son sistemas independientes, **no** se alimentan entre sí (ver Sprint 6 y "Decisiones pendientes" punto 1).

## Sprint 6 — Contratar un postulante (Candidatos Postulados → Guardia "Sin Asignar")

**Contexto (aclarado por el usuario 2026-09-10):** la documentación previa de este módulo (y el modal de ayuda del Dashboard de RRHH) describía el Kanban de Candidatos (Sistema B, `/rrhh/kanban`) como el mecanismo real de contratación. El usuario corrigió esto: en la práctica, RRHH no usa ese Kanban para contratar — el flujo real ocurre enteramente sobre el **Sistema A** (candidatos sincronizados desde Drive, "Candidatos Postulados" en `ReclutamientoPage.tsx`): se marca al postulante como contratado y su carpeta pasa a ser, directamente, una carpeta de Guardias — sin entidad todavía, porque eso se decide después. El Kanban (Sistema B) sigue existiendo y sigue siendo funcional (`CandidateService.move()` con `KanbanColumn.triggersHire` sigue creando un `MovimientoPersonal` de tipo ENTRADA), pero sigue siendo un sistema separado, no el que RRHH usa de verdad para esto.

- **Botón "Marcar como Contratado"** en el modal de detalle del candidato (`ReclutamientoPage.tsx`, footer del modal, junto a "Ver Carpeta en Drive"), visible solo con `canWrite('RRHH')`. Confirmación previa vía `window.confirm` (mismo patrón que el botón de salida en `GuardiasList.tsx`) porque mueve una carpeta real de Drive.
- **`DriveService.contratarCandidato(companyId, folderId)`** (`drive.service.ts`, cerca de `saveCandidatoDatos`):
  1. Lee la carpeta del candidato y parsea "Nombre - Cédula" (mismo parser de 10 dígitos que usa `syncEntidadesFolder`, `parseEmployeeFolderName`) — si no parsea, rechaza con un mensaje claro en vez de mover una carpeta con identidad ambigua.
  2. **Chequeo de duplicado** (mismo espíritu que evitó el caso de los "Juan Perez"): si ya existe un `EmployeeDriveFolder` con esa cédula, rechaza sin mover nada.
  3. Marca `estado: 'CONTRATADO'` y `fechaContratacion` en el `candidato.json` de la carpeta (mismo patrón create-vs-update que `saveCandidatoDatos`).
  4. Resuelve (o crea, la primera vez) una carpeta **"Sin Asignar"** como tercer bucket de primer nivel dentro de la raíz de Guardias (`FolderConfig type='CUMPLIMIENTO'`), junto a `Público`/`Privado`.
  5. Mueve la carpeta del candidato ahí (mismo mecanismo `addParents`/`removeParents` que `archivarCarpetaGuardia` — no copia ni borra ningún documento).
- **Endpoint:** `POST /personal/reclutamiento/candidatos/:folderId/contratar` (`drive.controller.ts`, `@Section('RRHH', 'write')`). El controlador llama a `contratarCandidato` y, si sale bien, corre `syncEntidadesFolder` de inmediato en la misma request — RRHH ve al guardia ya aparecer en Listado de Guardias sin tener que ir a apretar "Sincronizar Drive" a mano.
- **`syncEntidadesFolder`** ahora reconoce "Sin Asignar" como un tercer bucket de primer nivel (junto a `publico`/`privado`, mismo criterio de normalización sin tildes/mayúsculas): sus subcarpetas son guardias directamente (un nivel menos de anidación que Público/Privado/Entidad), se sincronizan igual (identidad por `EmployeeDriveFolder.folderId`, documentos, `Datos_Personales.json`) pero **nunca abren una `AsignacionGuardia`** — quedan "sin asignación" (mismo estado que ya expone el KPI "Guardias sin asignación" del Dashboard de RRHH) hasta que alguien mueva su carpeta a `Público/Privado/<Entidad>` a mano. La lógica compartida de sincronizar una carpeta de guardia se extrajo a `DriveService.syncGuardiaFolder(companyId, guardiaFolder, entidad, vistos, result)` (privado), llamado tanto desde el recorrido de Entidades como desde el de "Sin Asignar" (`entidad = null`).
- **Tests:** `drive.service.spec.ts` → `describe('DriveService.contratarCandidato', ...)` (cédula no parseable, cédula duplicada, creación/reutilización de la carpeta "Sin Asignar") y un caso nuevo en `describe('DriveService.syncEntidadesFolder', ...)` para el bucket "Sin Asignar".
- **Pendiente de probar con el usuario contra Drive real** antes de considerarse verificado end-to-end (mueve carpetas reales) — no se probó contra producción en esta sesión.

## Sprint 5 — Requisitos obligatorios/opcionales, expediente del postulante y rediseño del modal de vacante

### `obligatorio` en `camposRequeridos`/`archivosRequeridos`

Cada campo/archivo de un `JobPosition` ahora tiene `obligatorio: boolean` (default `true` si no viene, para no aflojar de golpe puestos ya creados). `normalizeCampo`/`normalizeArchivo` en `drive.service.ts` lo normalizan y lo persisten en Postgres y en el JSON del puesto en Drive. Solo los `archivosRequeridos` con `obligatorio !== false` cuentan en el `completitudPercent` de `syncReclutamientoCandidates` (mismo criterio que `DocumentType.required` en Cumplimiento por Entidad) — uno opcional que falte no baja el porcentaje. `camposRequeridos.obligatorio` es informativo (no altera ningún porcentaje), se usa solo para marcar qué datos del postulante son indispensables en el expediente.

### Expediente del postulante (`candidato.json` → `datosFormulario`)

Antes nada en la app escribía `candidato.json` (solo se leía si alguien lo creaba a mano). Ahora RRHH puede cargar/editar los datos del postulante (uno por cada `campoRequerido` del puesto) desde el modal de detalle del candidato en `ReclutamientoPage.tsx`:
- **Backend:** `DriveService.saveCandidatoDatos(folderId, datos, companyId)` — busca el `candidato.json` de la carpeta (crea uno si no existe), hace merge de `datos` dentro de `datosFormulario` (preserva otras claves como `puestoAplicado`). Endpoint `PATCH /personal/reclutamiento/candidatos/:folderId/datos`, DTO `SaveCandidatoDatosDto`.
- `syncReclutamientoCandidates` deriva `nombre`/`cedula`/`telefono`/`email` buscando esas claves dentro de `datosFormulario` por coincidencia case/acento-insensible (`buscarDatoFormulario`), con el nombre de la carpeta como respaldo.
- Reclasificación de archivos "adicionales" propia de Reclutamiento (candidatos de Drive, no `EmployeeDocument`): `DriveService.reassignReclutamientoFile(driveFileId, archivoNombre, companyId)` renombra el archivo en Drive incluyendo el nombre del requisito, vía `PATCH /personal/reclutamiento/documentos/:driveFileId/reassign`. `syncReclutamientoCandidates` expone `archivosAdicionales` (excluye `.json`, son metadata del expediente, no documentos).

### Vacante: sin botón de eliminar, self-heal del JSON en Drive

- Se quitó el botón de eliminar vacante de la UI (borrar de verdad trashea la carpeta de Drive completa, con todas las carpetas/documentos de sus candidatos dentro — pérdida real reportada por el usuario). El endpoint `DELETE /personal/reclutamiento/puestos/:id` sigue existiendo por si hace falta desde fuera de la UI. La única vía en la UI para "retirar" una vacante es marcarla `CERRADA`.
- `updateJobPosition` ya no confía en el `driveFileId` guardado en BD para saber qué archivo de Drive sobrescribir: antes de escribir, lista la carpeta del puesto y usa el `.json` que realmente existe hoy ahí (autorreparando el id en BD si estaba desincronizado). Sin esto, una edición podía "tener éxito" escribiendo sobre un archivo huérfano mientras el JSON real en Drive nunca cambiaba.
- **Ojo con procesos de backend viejos**: como el repo vive bajo `Documents` (típicamente sincronizado con OneDrive en Windows), `nest start --watch` puede no recargar con cambios de archivo — si un fix "no aparece" reiniciar el proceso del backend antes de sospechar del código.

### Rediseño del modal Crear/Editar Puesto

El modal usaba una paleta genérica tipo Tailwind (`#eff6ff`/`#1d4ed8`/`#fed7d7`/`#c53030`/`#e2e8f0`, heredada de `.cacao-form .form-section-title`) que no correspondía a la identidad real de la app (`--azul-oscuro #100F31`, `--azul-claro #12375F`, `--naranja #EE3B1B`, `--gris-claro #E6E6E6`), y los requisitos se mostraban como chips envueltos en vez de una lista ordenada. Ahora: modal más ancho (700px), requisitos en filas tipo checklist (nombre / tipo o extensiones / interruptor Obligatorio-Opcional / quitar) en vez de chips, un componente `Switch` accesible (`role="switch"`, operable con teclado) en naranja (el color de "atención" que ya usa la app) para el estado obligatorio, y toda la sección usa exclusivamente los tokens de color de la app.

## Sprint 4 — Fix sync BD↔Drive de vacantes + reasignación de archivos adicionales

### Bug: un campo nuevo en una vacante "desaparecía" tras editarla

Al editar un `JobPosition` y agregar un campo a `camposRequeridos`/`archivosRequeridos`, el cambio se guardaba en Postgres pero luego se revertía. Causa raíz, en `drive.service.ts`:

1. `updateJobPosition` solo reescribía el JSON del puesto en Drive `if (position.driveFileId)`, y si Drive fallaba, el error se tragaba con `logger.warn` sin avisar al frontend (a diferencia de `createJobPosition`, que sí retorna `driveWarning`).
2. `syncJobPositionsFromDrive` — que corre automáticamente al abrir `ReclutamientoPage` y en "Sincronizar Carpeta" — comparaba el JSON de Drive contra la BD y, si diferían, **sobrescribía la BD con el JSON** (incluyendo `camposRequeridos`/`archivosRequeridos`/`descripcion`). Si el JSON había quedado desactualizado por (1), esta sync revertía la edición reciente.
3. `syncReclutamientoCandidates` (la que valida a los candidatos) lee esos campos desde la BD, así que terminaba validando contra los datos viejos.

**Fix:** Postgres es ahora la única fuente de verdad para `camposRequeridos`/`archivosRequeridos`/`descripcion`; el JSON en Drive es solo un espejo de salida.
- `updateJobPosition` se autorrepara: si falta `driveFolderId`/`driveFileId` los crea en vez de saltarse la sincronización, y ahora retorna `driveWarning` si Drive falla (el frontend lo muestra en el banner de `ReclutamientoPage`).
- `syncJobPositionsFromDrive` dejó de copiar `camposRequeridos`/`archivosRequeridos`/`descripcion` desde el JSON hacia la BD para puestos que ya existen — solo autorrepara el enlace `driveFolderId`/`driveFileId` roto. Esos campos solo se leen del JSON al crear un puesto nuevo detectado directamente en Drive (carpeta sin fila en BD).
- Tests: `drive.service.spec.ts` → `DriveService.updateJobPosition`, `DriveService.syncJobPositionsFromDrive`.

### Reasignar archivos "adicionales" a un documento requerido

RRHH puede decirle al sistema "este archivo que subió el postulante como adicional en realidad es el documento X que faltaba" (p. ej. la cédula subida fuera de su casilla). No se agregó una columna de asociación nueva: se reutiliza el matching por nombre ya existente (`scoreMatch`/`matchDocuments`), renombrando el archivo en Drive para que incluya el nombre del tipo de documento.

- **Backend:** `DriveService.reassignDocumentType(driveFileId, documentTypeId, companyId)` — valida que el `DocumentType` sea de la misma `folder` que el `EmployeeDocument`, renombra el archivo en Drive (`Cédula - <nombre original>.ext`) y actualiza `EmployeeDocument.fileName` en Postgres. Endpoint `PATCH /personal/drive/documents/:driveFileId/reassign-type`, DTO `ReassignDocumentTypeDto` (`document-type.dto.ts`), protegido por `@Section('RRHH', 'write')`.
- **Frontend:** `ComplianceChecklist.tsx` → `ReassignControl`, un selector en cada fila de "Archivos sin reconocer" con los documentos requeridos aún faltantes (`compliance.documents.filter(status === 'missing')`); al confirmar llama `reassignDocumentType` (`personal.service.ts`) y recarga el checklist. El archivo pasa a mostrarse como presente en su fila, pero **no se auto-aprueba** — RRHH sigue usando el botón Aprobar/Rechazar existente.
- Tests: `drive.service.spec.ts` → `DriveService.reassignDocumentType`.

## Sprint 3 — Revision documental (aprobar/rechazar con motivo)

RRHH puede aprobar o rechazar cada documento del checklist de cumplimiento, con motivo obligatorio al rechazar, y queda historial de quien, cuando y por que.

- **Modelos:** `DocumentReview` (estado actual) + `DocumentReviewHistory` (traza append-only). Migracion `20260907_add_document_reviews`.
- **Por que tabla aparte y no columnas en `EmployeeDocument`:** `deleteEmployeeByCedula` hace `deleteMany` de los documentos, y una re-subida tras un rechazo genera un `driveFileId` nuevo (fila nueva). La traza no puede vivir en una tabla que se vacia y se repuebla.
- **Backend:** `services/document-review.service.ts`, `dto/document-review.dto.ts`, 3 endpoints en `drive.controller.ts` protegidos por `SectionPermissionGuard` + `@Section('PERSONAL', ...)`.
- **`getCompliance` ahora devuelve** `documentTypeId`, `driveFileId`, `review` (con `stale`) por documento, `review` en cada `unmatchedFile`, y `reviewSummary`.
- **Frontend:** `components/personal/ComplianceChecklist.tsx` (compartido), `DocumentReviewModal.tsx`, `DocumentReviewHistory.tsx`, `reviewStatus.ts`. Consumido por `CompliancePanel`, `AdministrativeStaff` y `GuardiaDetailModal` (este ultimo en modo solo lectura).
- **Tests:** `document-review.service.spec.ts`, `drive.service.spec.ts`, `section-permission.guard.spec.ts`.

### Bugs preexistentes corregidos de paso
1. **`findMatchingDoc` reventaba `syncReclutamientoCandidates`**: recibia archivos crudos de la API de Drive (que traen `.name`, no `.fileName`), asi que lanzaba `TypeError` y el `catch` del bucle se lo tragaba. Efecto: **todo candidato cuyo puesto tuviera `archivosRequeridos` configurados desaparecia del sync**. Ahora `hasMatchingFile()` acepta ambas formas.
2. **Match difuso demasiado laxo**: bastaba una palabra de +2 letras, asi que un mismo archivo aparecia en varias filas del checklist. Ahora se puntua (frase completa > todos los terminos > 60 % con 3+) y cada archivo se asigna a un solo tipo. **Ojo: esto puede mover porcentajes de cumplimiento ya vistos por RRHH.**
3. **`employeeDocument.findMany` sin `orderBy`**: con documentos duplicados, cual ganaba el match era no determinista. Ahora gana el mas reciente.
4. **`GuardiaDetailModal` leia `compliancePercentage` / `checklist`** cuando el backend devuelve `compliancePercent` / `documents`: mostraba `undefined%` y nunca listo el checklist.

### Deuda que queda abierta
- La traza sobrevive al borrado del empleado (sin FK a `Candidate`, relacion por cedula). Es deliberado — auditoria — pero genera filas huerfanas si el borrado fue por error.
- No hay aviso al candidato tras un rechazo: el motivo queda solo en la traza interna. Depende de Sprint 5 (correo) / Sprint 6 (WhatsApp), que requieren montar cron y proveedor de correo desde cero.

## Arquitectura del modulo

El modulo de Reclutamiento es parte del modulo `Personal` y opera con **dos sistemas de candidatos** que se complementan:

### Sistema A: Candidatos sincronizados desde Google Drive (solo lectura, salvo Contratar)
- **Backend:** `DriveService.syncReclutamientoCandidates()`, `DriveService.contratarCandidato()` (Sprint 6)
- **Frontend:** `ReclutamientoPage.tsx`
- **Fuente de datos:** Carpetas en Google Drive dentro de `Reclutamiento/<Nombre>-<Cedula>/`
- **Almacenamiento:** No crea registros en BD — los datos se leen de Drive al momento del sync
- **Proposito:** Monitorear postulantes externos que suben documentos a Drive, y **contratarlos** (Sprint 6): esta es la vía real de contratación que usa RRHH, no el Kanban (Sistema B).
- **Funcionalidades:** Tracking de completitud, checklist de documentos, links a carpetas de Drive, "Marcar como Contratado" (mueve la carpeta a Guardias/Sin Asignar)

### Sistema B: Candidatos en base de datos (CRUD completo)
- **Backend:** `CandidateService`
- **Frontend:** `RecruitmentKanban.tsx`, `CandidatesList.tsx`, `CandidateForm.tsx`
- **Fuente de datos:** Tabla `Candidate` en PostgreSQL
- **Almacenamiento:** Registros completos con asignacion a columnas Kanban
- **Proposito:** Gestion interna del pipeline de RRHH
- **Funcionalidades:** Kanban drag-and-drop, historial de movimientos, generacion de contratos, verificacion

## Flujo end-to-end

```
1. Admin crea un Puesto/Vacante en ReclutamientoPage
   -> POST /personal/reclutamiento/puestos
   -> DriveService.createJobPosition()
     -> Crea JobPosition en PostgreSQL
     -> Crea archivo JSON en Google Drive/Reclutamiento/

2. Postulantes suben documentos a Google Drive/Reclutamiento/<Nombre>-<Cedula>/

3. RRHH hace click en "Sincronizar" en ReclutamientoPage
   -> POST /personal/reclutamiento/sync
   -> DriveService.syncReclutamientoCandidates()
     -> Lee cada carpeta de candidato desde Drive
     -> Lee candidato.json (si existe) para datos extra
     -> Compara el puesto contra los JobPosition definidos
     -> Calcula porcentaje de completitud
     -> Retorna lista de candidatos al frontend

4. RRHH agrega candidatos prometedores al Kanban
   -> POST /personal/candidates
   -> CandidateService.create()

5. RRHH mueve candidatos por las etapas del pipeline
   -> PATCH /personal/candidates/:id/move
   -> CandidateService.move() (crea registro de historial)

6. RRHH genera contrato para candidato aprobado
   -> POST /personal/contracts/generate
   -> ContractService genera contrato desde plantilla
```

## Archivos clave

### Backend

| Archivo | Descripcion |
|---------|-------------|
| `backend/src/modules/personal/drive.controller.ts` | Endpoints REST de Drive + Reclutamiento |
| `backend/src/modules/personal/personal.controller.ts` | Endpoints REST de Candidatos + Kanban |
| `backend/src/modules/personal/services/drive.service.ts` | Integracion Drive + logica de Reclutamiento |
| `backend/src/modules/personal/services/candidate.service.ts` | CRUD candidatos + movimiento |
| `backend/src/modules/personal/services/kanban.service.ts` | Gestion de columnas Kanban |
| `backend/src/modules/personal/personal.service.ts` | KPIs del dashboard |
| `backend/src/modules/personal/personal.module.ts` | wiring del modulo |
| `backend/src/modules/personal/dto/job-position.dto.ts` | DTOs de puestos |
| `backend/src/modules/personal/dto/candidate.dto.ts` | DTOs de candidatos |
| `backend/src/modules/personal/dto/kanban.dto.ts` | DTOs de kanban |
| `backend/src/modules/personal/dto/drive.dto.ts` | DTO de configuracion Drive |
| `backend/src/modules/personal/dto/document-type.dto.ts` | DTOs de tipos de documento |
| `backend/prisma/schema.prisma` | Modelos JobPosition, Candidate, KanbanColumn, etc. (lineas 608-938) |
| `backend/prisma/migrations/20260904_add_job_positions/migration.sql` | Migracion JobPosition |
| `backend/prisma/migrations/20260904_add_verification_checks/migration.sql` | Migracion VerificationCheck |

### Frontend

| Archivo | Descripcion |
|---------|-------------|
| `frontend/src/pages/personal/ReclutamientoPage.tsx` | Pagina principal de Reclutamiento (567 lineas) |
| `frontend/src/pages/personal/recruitment/RecruitmentKanban.tsx` | Tablero Kanban drag-and-drop (163 lineas) |
| `frontend/src/pages/personal/candidates/CandidatesList.tsx` | Tabla de candidatos (129 lineas) |
| `frontend/src/pages/personal/candidates/CandidateForm.tsx` | Formulario crear/editar candidato (196 lineas) |
| `frontend/src/pages/personal/PersonalDashboard.tsx` | Dashboard del modulo Personal (82 lineas) |
| `frontend/src/services/personal.service.ts` | Todas las funciones API |
| `frontend/src/App.tsx` | Definicion de rutas (lineas 280-294) |
| `frontend/src/components/layout/Sidebar.tsx` | Navegacion lateral |

## API Endpoints

### Reclutamiento (Puestos/Vacantes)

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| `GET` | `/personal/reclutamiento/puestos` | JWT | Listar todos los puestos de la empresa |
| `POST` | `/personal/reclutamiento/puestos` | JWT | Crear puesto (guarda en BD + JSON en Drive) |
| `PATCH` | `/personal/reclutamiento/puestos/:id` | JWT | Actualizar puesto (actualiza BD + JSON en Drive) |
| `DELETE` | `/personal/reclutamiento/puestos/:id` | JWT | Eliminar puesto (elimina BD + JSON de Drive) |
| `POST` | `/personal/reclutamiento/sync` | JWT | Sincronizar candidatos desde carpetas de Drive |
| `POST` | `/personal/reclutamiento/candidatos/:folderId/contratar` | JWT+RRHH(write) | Contratar: mueve la carpeta a Guardias/Sin Asignar, marca `candidato.json` y sincroniza Guardias (Sprint 6) |

### Candidatos (Kanban)

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| `GET` | `/personal/candidates` | JWT | Listar candidatos (filtro opcional `?columnId=`) |
| `GET` | `/personal/candidates/:id` | JWT | Detalle candidato con historial |
| `POST` | `/personal/candidates` | JWT | Crear candidato |
| `PATCH` | `/personal/candidates/:id` | JWT | Actualizar candidato |
| `PATCH` | `/personal/candidates/:id/move` | JWT | Mover candidato a columna Kanban |
| `GET` | `/personal/candidates/:id/history` | JWT | Historial de movimientos |

### Columnas Kanban

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| `GET` | `/personal/kanban/columns` | JWT | Obtener columnas con candidatos |
| `POST` | `/personal/kanban/columns` | JWT | Crear columna |
| `PATCH` | `/personal/kanban/columns/:id` | JWT | Actualizar columna |
| `DELETE` | `/personal/kanban/columns/:id` | JWT | Eliminar columna (candidatos desvinculados) |
| `POST` | `/personal/kanban/reorder` | JWT | Reordenar columnas en lote |

### Drive

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| `GET` | `/personal/drive/config` | JWT | Obtener configuracion Drive |
| `POST` | `/personal/drive/config` | JWT+ADMIN | Guardar configuracion Drive |
| `POST` | `/personal/drive/test` | JWT | Probar conexion con Google Drive |
| `POST` | `/personal/drive/sync` | JWT | Sincronizar carpetas de Drive |
| `GET` | `/personal/drive/compliance/:cedula` | JWT | Checklist de cumplimiento por cedula |
| `GET` | `/personal/drive/tree` | JWT | Arbol de carpetas |
| `DELETE` | `/personal/drive/employee/:cedula` | JWT+ADMIN | Eliminar empleado de Drive |

## Modelos de Prisma

### JobPosition
```prisma
model JobPosition {
  id                 Int      @id @default(autoincrement())
  puesto             String
  descripcion        String?
  // Array de { nombre: string, tipo?: string } — tipo es TEXTO/ALFANUMERICO/
  // NUMERICO/CORREO/TELEFONO/FECHA, solo guía visual, no se valida.
  camposRequeridos   Json     @default("[]")
  // Array de { nombre: string, extensiones?: string[] } — extensiones es solo
  // guía visual (ej. CV → pdf/doc), no se valida ni rechaza por extensión.
  archivosRequeridos Json     @default("[]")
  driveFileId        String?     // ID del JSON del puesto en Drive
  driveFolderId      String?     // Carpeta propia del puesto en Drive (contiene el JSON + carpetas de postulantes)
  estado             String   @default("ABIERTA") // ABIERTA | CERRADA
  companyId          Int
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```
**Actualizado 2026-09-09** (antes decía `String[]` para ambos campos y no tenía `driveFolderId`/`estado` — quedó desactualizado tras la migración `20260908_campos_requeridos_json`; ver [recursos-humanos.md](recursos-humanos.md) punto 1 para el contexto de ese cambio).

### Candidate
```prisma
model Candidate {
  id               Int              @id @default(autoincrement())
  fullName         String
  cedula           String
  phone            String?
  email            String?
  positionApplied  String
  availability     String?
  salaryExpected   Float?
  education        String?
  experience       String?
  references       String?
  observations     String?
  cvUrl            String?
  status           CandidateStatus  @default(POSTULADO)
  columnId         Int?             // Columna Kanban actual
  companyId        Int
  createdBy        Int
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  history          CandidateHistory[]
  contracts        Contract[]
  @@unique([companyId, cedula])
}
```

### KanbanColumn
```prisma
model KanbanColumn {
  id        Int      @id @default(autoincrement())
  name      String
  position  Int      @default(0)
  color     String   @default("#718096")
  companyId Int
  candidates Candidate[]
  createdAt DateTime @default(now())
  @@unique([companyId, name])
}
```

### ⚠️ VerificationCheck — eliminado (2026-09-09)
Este modelo ya **no existe**. Fue reemplazado por `SistemaVerificacion`/`MovimientoPersonal`/`MovimientoPersonalItem` (migración `20260909_replace_verificacion_with_movimientos`, que migró cualquier fila existente a un caso histórico `ENTRADA` antes de eliminar la tabla). Ver [movimientos-personal.md](movimientos-personal.md) para el modelo actual.

## Enums

```prisma
enum CandidateStatus {
  POSTULADO
  VALIDACION_DOCUMENTAL
  TEST_PSICOLOGICO
  TEST_MEDICO
  APROBADO
  RECHAZADO
}
```

## Algoritmo de syncReclutamientoCandidates

1. Obtiene la carpeta raiz configurada en `FolderConfig` para la empresa
2. Busca o crea la subcarpeta `Reclutamiento/` dentro de la raiz
3. Carga todos los `JobPosition` de la empresa para conocer archivos requeridos
4. Lista todas las subcarpetas dentro de `Reclutamiento/`
5. Para cada carpeta de candidato:
   a. Parsea el nombre de la carpeta (patron `Nombre Apellido - 1234567890`)
   b. Lee un archivo `candidato.json` (si existe) para datos adicionales
   c. Compara el `puestoAplicado` contra los `JobPosition` definidos
   d. Calcula `completitudPercent` = (archivos requeridos encontrados / total archivos requeridos) * 100
   e. Recopila todos los archivos subidos
6. Retorna `{ puestosCount, candidatosCount, candidatos[] }`

**Nota:** Esta operacion es **solo lectura** — no crea registros en la base de datos.

## Reglas de negocio

### Permisos
- **Cualquier usuario autenticado (EMPLOYEE, RRHH):** Puede ver candidatos, mover en Kanban, crear puestos
- **Solo ADMIN:** Puede guardar configuracion Drive, eliminar carpetas de empleados, eliminar tipos de documento

### Validaciones
- Cedula unica por empresa en candidatos (`@@unique([companyId, cedula])`)
- Nombre unico por empresa en columnas Kanban (`@@unique([companyId, name])`)
- Nombre + folder unico por empresa en tipos de documento (`@@unique([companyId, folder, name])`)

### Integridad de datos
- Todos los modelos tienen `companyId` con `onDelete: Cascade`
- Eliminar una empresa elimina todos sus candidatos, puestos, columnas, etc.
- Eliminar una columna Kanban desvincula los candidatos (no los elimina)
- `CandidateHistory` registra cada movimiento de candidato con `fromColumn`, `toColumn`, `performedBy`

## Dependencias externas

- **Google Drive API:** Requiere service account (`google-service-account.json`) con permisos de lectura/escritura
- **Carpeta compartida:** La carpeta raiz de Drive debe estar compartida con `drive-sync@agentes-504115.iam.gserviceaccount.com`
- **Prisma:** ORM para todas las operaciones de base de datos
- **googleapis:** Libreria oficial de Google para Node.js

## Decisiones pendientes / Deuda tecnica

1. **Dualidad de candidatos:** Los candidatos de Drive y los de BD (Kanban) siguen siendo sistemas separados, sin sincronización entre ellos. Lo que cambió en Sprint 6 es que un candidato de Drive ya no necesita pasar por el Kanban para convertirse en guardia — "Contratar" lo mueve directo a Guardias (Sin Asignar). Un candidato de Drive agregado al Kanban (Sistema B) sigue siendo un registro aparte, sin relación con esto.
2. **Sin notificaciones:** No hay sistema de notificaciones cuando un candidato sube documentos o cuando se completa un checklist.
3. **Sin filtros avanzados en Kanban:** El Kanban no tiene filtros por puesto, fecha, o estado.
4. **Sin exportacion:** No hay exportacion de candidatos a CSV/PDF.
5. **drive.module.ts duplicado:** Existe un `drive.module.ts` que duplica el registro de `DriveController` y `DriveService`. El modulo autoritativo es `personal.module.ts`.

## Rutas frontend
**Actualizado 2026-09-09** — el prefijo pasó de `/personal` a `/rrhh` (ver [recursos-humanos.md](recursos-humanos.md) punto 1); esta sección quedó con las rutas viejas y ya no eran correctas. Lista completa y verificada contra `App.tsx` en recursos-humanos.md — solo las de Reclutamiento aquí:
```
/rrhh                    -> PersonalDashboard
/rrhh/reclutamiento      -> ReclutamientoPage
/rrhh/kanban             -> RecruitmentKanban
/rrhh/candidates         -> CandidatesList
/rrhh/candidates/new     -> CandidateForm (crear)
/rrhh/candidates/:id     -> CandidateForm (editar)
```

## Navegación Sidebar
**Actualizado 2026-09-09** — ver [recursos-humanos.md](recursos-humanos.md) para el árbol completo verificado contra `Sidebar.tsx`. Resumen: ya no hay ítems separados de "Custodios" ni "Verificación SUT/SICOSEP" (reemplazado por "Movimientos de Personal", ver [movimientos-personal.md](movimientos-personal.md)); "Certificaciones", "Tipos de Documento" y "Configuración Drive" ya no aparecen en el Sidebar (quedaron huérfanas o pasaron a modales inline dentro de cada pantalla — ver recursos-humanos.md sección 7).
