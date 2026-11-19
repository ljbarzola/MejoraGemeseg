# Módulo: Recursos Humanos (RRHH)

Reclutamiento, documentación de guardias, movimientos entrada/salida, cumplimiento documental (Drive como fuente de la verdad), capacitaciones, quejas, encuestas, vigilante de vencimientos y configuración de RRHH.

## Nomenclatura
- Visible: «Recursos Humanos (RRHH)»; rutas `/rrhh/*`; permiso de sección `RRHH`.
- NO se renombró (contrato interno): prefijo de API `@Controller('personal')`, `frontend/src/services/personal.service.ts`, `backend/src/modules/personal/`, `frontend/src/pages/personal/`, `PersonalDashboard.tsx`.
- Multitenant por `companyId`. Acceso por sección (`SectionPermissionGuard`), no por rol: los usuarios de RRHH suelen ser `EMPLOYEE`.
- Detalle de Reclutamiento: [reclutamiento.md](reclutamiento.md). Entrada/salida: [movimientos-personal.md](movimientos-personal.md).

## Submódulos

### 1. Reclutamiento (`/rrhh/reclutamiento`)
- `JobPosition` tiene carpeta propia en Drive, `camposRequeridos: {nombre, tipo}[]` y `archivosRequeridos: {nombre, extensiones}[]`.
- Candidatos sincronizados son de solo lectura salvo **«Marcar como Contratado»** (mueve la carpeta al destino de la vacante y la marca en `candidato.json`). Es la única vía de contratación.

### 2. ~~Kanban de Candidatos~~ — ELIMINADO
- No existen `Candidate`/`KanbanColumn`/`CandidateHistory`, sus servicios, páginas ni rutas (`/rrhh/kanban`, `/rrhh/candidates*`). Se construiría de cero.
- La entrada de Movimientos la crea `DriveService.contratarCandidato()`. `buildAutoFillValues()` y `syncFichaPersonal()` usan solo `GuardiaFichaPersonal` (dato faltante = campo vacío a mano); el tipo «Contrato» es siempre no-obligatorio en `getCompliance()`.

### 3. Documentación — generador de documentos (`/rrhh/contracts`)
- «+ Nueva plantilla» (`ContractTemplateConfig.tsx`) y «+ Generar Documento» (`GenerarDocumento.tsx`, página propia, no vive en Listado de Guardias).
- Plantilla `.docx` (enlace de Drive o archivo subido) → variables **solo `[VARIABLE]`** (no `<<VARIABLE>>`) → cada una mapeada a un dato del guardia (`ContractField.systemField`) o manual → PDF. Helper compartido: `backend/src/common/docx-templating/docx-merge.util.ts`.
- `ContractTemplate.type` es texto libre (`GET /personal/contracts/templates/types` ofrece los usados). Solo Guardias. `Contract` no tiene FK: se identifica por `cedula`/`nombreGuardia`. Firma física (sin firma electrónica).
- Autocompletado (`ContractService.buildAutoFillValues`): nombre, cédula, puesto, entidad, horario, salario, fecha, empresa, de `AsignacionGuardia`/`Entidad` + `GuardiaFichaPersonal`. Horario, puesto formal y salario acordado son campos de `GuardiaFichaPersonal` (no de `AsignacionGuardia`, historial solo lectura del sync).
- **«Llenar a mano»**: para quien no está en el listado; cédula opcional (`GenerateContractDto.cedula`), el nombre es imprescindible.
- **Subir archivo**: `POST /personal/contracts/templates/:id/upload-docx` (`@Section('RRHH','write')`, multer en memoria, 10 MB, valida firma ZIP «PK»). Guarda en `StoredFile` (`rrhh/templates/<archivo>`), actualiza `docxPath` y **pone `driveUrl = null`** (si no, un reinicio rebajaría de Drive y pisaría lo subido). `ensureDocxLocal` lee disco/`StoredFile` y solo después Drive.
- Una plantilla solo se elimina sin documentos. `DELETE /personal/contracts/:id`: borra copia de Drive (404 se ignora; otro fallo aborta sin tocar la fila), PDF de disco y fila; irreversible.
- Sugerencia «Autocompletar con» por parecido de nombre (`utils/sugerirCampoSistema.ts`; ante la duda queda Manual; nunca pisa lo elegido). Campos agrupados por tema (`utils/agruparCamposDocumento.ts`; «emergencia» antes que «teléfono»). La pantalla final avisa si el PDF quedó en Drive o falló la subida (`Contract.driveFileId` nulo).

### 4. ~~Certificaciones y Alertas de Vencimiento~~ — ELIMINADO
- No existen `Certification`/`CertificationAlert` (tabla incluida) ni `/personal/certifications`. `GET /personal/alerts` devuelve solo capacitaciones. Si hace falta vencimiento, usar `RequisitoDocumento`.

### 5. ~~Bitácoras~~ — ELIMINADAS
- No existen `/personal/logs/*`, `/rrhh/logs`, `LogTemplate`/`LogEntry`/`LogType`.

### 6. Movimientos de Personal — entrada/salida de guardias
Es un registro por **caso**, no un formulario de alta. Scraping de portales (SICOSEP/SUT) descartado: la acción en el portal la hace una persona y el sistema guarda la traza.
- **No existe** `POST /personal/movimientos/entrada`. La entrada se crea sola al contratar (`DriveService.contratarCandidato()`), idempotente por cédula.
- `SistemaVerificacion` (`nombre`, `urlPortal?`, `activo`, `orden`, por `companyId`; IsyPlus, IESS, SUT, SICOSEP). Sin página propia: modal `ConfiguracionSistemasModal.tsx` en Historial.
- `MovimientoPersonal` (`tipo` ENTRADA/SALIDA, `estado` EN_PROCESO/COMPLETADO, `cedula`, `nombreGuardia`, `origen`, `candidateId?`) + `MovimientoPersonalItem` (uno por sistema, snapshot de `nombreSistema`). Todos los items completos → COMPLETADO (y viceversa).
- **Salida**: ícono `LogOut` por fila en `GuardiasList.tsx` + `ConfirmDialog` (nunca `window.confirm`); idempotente. Con salida COMPLETADA, `MovimientoDetalleModal.tsx` habilita **«Archivar carpeta»**: mueve (no borra) la carpeta a `FolderConfig.type='GUARDIAS_ARCHIVO'` (`DriveService.archivarCarpetaGuardia`); manual, nunca automático.
- **Recontratación**: `EmployeeDriveFolder` nunca se borra al salir. `contratarCandidato()` consulta `MovimientoPersonalService.isActivo(companyId, cedula)`: último movimiento SALIDA/COMPLETADO → permite (nuevo ENTRADA); activo → bloquea. «Fusión de cédulas» es para dos cédulas *distintas* de la misma persona, no para esto.
- **Historial** (`HistorialGuardia.tsx`, `/rrhh/historial`) fusiona `AsignacionGuardia` + casos. `/rrhh/movimientos` y `/rrhh/asignaciones` redirigen ahí (`<Navigate>` en `App.tsx`). Conserva eliminar una asignación mal generada por el sync.

### 7. Cumplimiento documental — Entidades/Guardias (Drive) + Personal Administrativo
`CompliancePanel.tsx` y `/rrhh/compliance` no existen.
- **`GuardiasList.tsx`** (`/rrhh/guardias`): «Configurar Drive» (`CUMPLIMIENTO` y `GUARDIAS_ARCHIVO`), «Sincronizar Drive» (`POST /personal/drive/sync-entidades`, ver Notas de diseño 3), «Configurar campos» (7-bis). La lista base sale de `GET /personal/guardias`.
  - Bucket de primer nivel **«Sin Asignar»** (junto a Público/Privado): sincroniza identidad, documentos y ficha sin abrir `AsignacionGuardia`; ahí caen los recién contratados.
  - Guardias con último movimiento SALIDA/COMPLETADO se **ocultan** de tabla y KPIs; «Mostrar fuera (N)» los muestra atenuados con «Fuera» (`GET /personal/movimientos/guardias-fuera`). En esas filas la **X** (`DELETE /personal/drive/guardia/:cedula/lista`, con confirmación) quita al guardia de la lista y manda su carpeta a la **papelera del dueño** en Drive (recuperable; en unidad compartida, a la de la unidad). Si la creó `drive-sync`, se transfiere antes la propiedad al dueño de la carpeta padre y se envía impersonándolo (requiere delegación de dominio del scope Drive; con `unauthorized_client` no se quita). Solo si ya está fuera; el historial se conserva. Un `no-mostrar-en-lista.txt` heredado sigue impidiendo que el sync lo recree.
- **`EntidadesList.tsx`** (`/rrhh/entidades`): catálogo `Entidad` + `RequisitoDocumento` (Global/Pública/Privada/Específica), editable. Las entidades también se crean solas al sincronizar y nunca se borran por un accidente de Drive. «Tipo» es editable; si no coincide con la carpeta el sync solo avisa (`entidadesTipoDistinto`). `CedulaMergeModal.tsx` («Fusionar cédulas duplicadas», vista previa, traza `CedulaMergeLog`) se muestra **solo a `role === 'ADMIN'`** (`isAdmin`, no `canWrite('RRHH')`; el backend `cedula-merge.controller.ts` lo restringe porque mueve/borra datos irreversiblemente): un `EMPLOYEE` con RRHH no lo ve, no es bug.
- **`CumplimientoEntidades.tsx`** (`/rrhh/cumplimiento`): semáforo (verde/amarillo/rojo), búsqueda y filtros; clic abre `GuardiaComplianceModal.tsx` (checklist, ficha, recordatorio manual).
- **`AdministrativeStaff.tsx`** (`/rrhh/administrativo`): checklist independiente con carpeta y configuración propias (`PERSONAL_ADMIN`).
- Modelos compartidos: `EmployeeDriveFolder`, `DocumentType`, `EmployeeDocument`, `DocumentReview`, `DocumentReviewHistory`. Propios de Entidades/Guardias: `Entidad`, `RequisitoDocumento`, `AsignacionGuardia`, `GuardiaContacto`, `GuardiaFichaPersonal`, `AlertaVencimiento`.

### 7-bis. Campos personalizados de la ficha (`PersonalFieldDefinition`)
- Configuración general de la empresa, vía `PersonalFieldsConfigModal.tsx` (`scope='GUARDIA'`), con `category` `PERSONAL`/`LABORAL`. Valores en `GuardiaFichaPersonal.camposPersonalizados` (JSON); `GuardiaFichaModal.tsx` los pinta dentro de «Datos personales»/«Datos laborales». `scope` (`GUARDIA` | `PERSONAL_ADMIN`) separa catálogos.

### 8. Capacitaciones (`/rrhh/capacitaciones`)
- Cumplimiento **general, no por guardia**: `Training.completed`/`completedAt`/`completedBy` una vez para el grupo. `Training.type` es `String` (`TRAINING_TYPES` en `personal.service.ts`; «Otro» abre texto libre).
- Adjuntos múltiples (`TrainingAttachment`, `kind` `DOCUMENTO`/`EVIDENCIA`).
- Carpeta raíz **fija en código** (`HARDCODED_DRIVE_FOLDERS.CAPACITACIONES`, punto 12); «Ver carpeta». ID vacío: `getConfig` lee la última `FolderConfig` en solo lectura; sin ningún ID se puede dar de alta con enlaces pero **subir archivo** se rechaza.
- **Carpeta por capacitación**: puntual `<raíz>/<Nombre>`; anual `<raíz>/Anual/<Nombre>` («Anual» se crea sola). Nombre repetido (sin importar mayúsculas): 409 `code: 'CARPETA_EXISTE'` y la pantalla pregunta «Agregar a esa carpeta» (si ya tenía otra, sus archivos se mueven) o «Cambiar nombre». `Training.driveFolderId`. Al crear el archivo espera en el navegador hasta pulsar Crear; al editar se sube al momento. `POST /personal/trainings/upload` acepta `trainingId` (y `folderAction`/`folderName` tras un 409). Siempre directo a Drive (`DriveService.uploadFile`), nunca a disco; devuelve `{ url }`.
- **«Registrar cumplimiento»** (modal con evidencia) y **«Revertir cumplimiento»** (con confirmación); la sección «Evidencia de cumplimiento» sigue visible al revertir.
- `GET /personal/alerts`: pendiente = `dueDate` en 30 días (o vencida) y no completada; se calcula al pedir; widget de `PersonalDashboard.tsx`.

### 9. Buzón de Quejas y Sugerencias
- **`ComplaintsPage.tsx`** (`/rrhh/quejas`): solo envío; **cualquier empleado autenticado**, sin `@Section`. No existe `GET /personal/complaints/mine`; no reintroducir.
- **`ComplaintsManagementPage.tsx`** (`/rrhh/quejas/gestion`, por sección): Kanban (drag-and-drop HTML5 nativo) con **etapas editables por empresa** (`ComplaintStage`: `key`, `label`, `color`, `order`, `isInitial`, `isFinal`; `Complaint.status` es `String` ligado por FK compuesta `(companyId, key)`). `ComplaintStageService` valida etapa inicial/final y bloquea borrar una etapa con quejas activas. Sembradas por defecto al crear empresa: `RECIBIDA → EN_SENSIBILIZACION → EN_COMUNICACION → EN_SOLUCION → CERRADA`. Historial de cambios en `ComplaintStageChange` (nota opcional).
- **Anonimato real**: `isAnonymous=true` → `submittedBy = null`, sin autor en ningún endpoint.
- Campos extra configurables (`ComplaintFieldDefinition`: `label`, `type` TEXT/NUMBER/DATE, `required`); respuestas en `Complaint.customFieldValues` (JSON por id). Descripción y anónimo son fijos.
- `POST /personal/complaints/:id/reply`: respuesta interna en el historial; **no** notifica al autor (anonimato).
- `ComplaintStageService.create()` fuerza `isInitial = true`/`isFinal = false` si la empresa no tiene etapas (igual `VentasClientesService.createStage()`). Borrar la última etapa se permite (borra sus quejas; el diálogo avisa).

### 10. Encuestas (`/rrhh/encuestas` responder, `/rrhh/encuestas/gestion` gestionar)
- `SurveyQuestionType` (enum Prisma): `SHORT_TEXT`, `LONG_TEXT`, `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `RATING` (1-5).
- Alta publicada (`PUBLISHED`) o `guardarComoBorrador` (`DRAFT`: no exige canal y **su enlace público no abre**). `PATCH /personal/surveys/:id/publish` lo publica y ahí se exige destinatarios o enlace (lo valida `SurveyService`, no el DTO).
- **Dos canales combinables**: *destinatarios de la app* (`SurveyRecipient.userId`; responden una vez, identificados) y *enlace público* (`Survey.publicEnabled` + `publicToken`, `/encuesta/<token>` sin login, llega también a guardias/externos). **No se pide nada fijo** en el enlace: nombre/correo/cédula se agregan como preguntas.
- `SurveyResponse.respondentId` opcional (`null` = por enlace); `@@unique([surveyId, respondentId])` impide doble respuesta de un usuario y admite muchas públicas (UNIQUE con NULL no colisiona).
- **Seguridad**: el token (24 bytes hex) es la única credencial. `PublicSurveyController` (`GET /public/surveys/:token`, `POST /public/surveys/:token/responses`) va **sin `AuthGuard` ni `SectionPermissionGuard` a propósito**; no agregarles guards. Solo devuelve título, descripción y preguntas; busca por `(publicToken, publicEnabled)`. Desactivar el enlace **conserva** el token.
- **Notificación al publicar** (`create()` no borrador y `publish()` → `notifyRecipients()`): por destinatario interno, notificación in-app (`NotificationsService.create()`, `link: '/rrhh/encuestas'`) y correo (`GmailMailService`, remitente de `NotificationConfig`). Cada canal con su `try/catch` y `Logger.error`; un fallo nunca bloquea al otro ni deshace la encuesta. `PersonalModule` importa `NotificationsModule`. Más `PendingSurveysBanner.tsx` (`GET /personal/surveys/pending/mine`).
- **Resultados** (`GET .../results`): conteos por opción, promedio + distribución, texto libre; tasa **por la app** (`recipientsResponded`/`totalRecipients`) y por enlace aparte (`publicResponses`, sin porcentaje; nunca dividir todas las respuestas entre destinatarios). `extraerOpciones()` acepta `valueText` y `valueJson`. `GET .../individual-results` devuelve `id` por respuesta; la UI agrupa por enlace / por app.
- **Destinatarios** (`PATCH .../recipients` `{ add?, remove? }`, `SurveyRecipientsPanel.tsx`): quien ya respondió NO se quita; `CLOSED` no se edita; una publicada no puede quedar sin destinatarios ni enlace; los agregados deben ser de la empresa; en borrador se edita sin avisar. Aviso a los agregados: solo in-app, sin correo (`notifyRecipients(..., enviarCorreo=false)`).
- No se elimina una encuesta con respuestas (se cierra). Una cerrada se **reabre** (`PATCH .../reopen`): vuelve a `PUBLISHED`, conserva respuestas, el enlace activo vuelve a aceptar.
- **Editar en cualquier estado** (`PATCH /personal/surveys/:id`, `RRHH` write, `SurveyService.update`, `UpdateSurveyDto`; `SurveyBuilderModal.tsx` crea y edita): transacción única. Preguntas con `id` se actualizan, sin `id` se crean, y las que ya no llegan **se eliminan con sus respuestas** (la pantalla avisa cuántas). Una pregunta con respuestas no cambia de tipo (salvo texto corto ↔ largo).

### 11. Formato de carpetas de Guardias y Entidades
- Guardias: `Apellidos Nombres` (punto 13); carpetas viejas se siguen parseando; contratar no exige cédula en el nombre; una carpeta nueva sin cédula y sin ese formato va a `guardiasNoReconocidos`.
- Entidades: «Provincia - Nombre»; el parser no exige el espacio exacto alrededor del guion (`GUAYAS- ZUMOCACAO`, `Guayas-Zumocacao` valen). No se renombra ni se avisa. Sin provincia reconocible = formato inválido, solo aviso.
- No existe el botón «Completar fichas con datos de postulación» ni `backfill-postulacion`. El traspaso automático al contratar (`POSTULACION_STASH_KEY`) sigue.

### 12. Carpetas de Drive fijas vs configurables
Solo Sistemas cambia las fijas, en `backend/src/modules/personal/constants/hardcoded-drive-folders.ts`.
- **Fijas:** `RECLUTAMIENTO` (coincide con el portal de postulación), `CAPACITACIONES`, `VENTAS_CONTRATOS`, `RRHH_DOCUMENTOS` (documentos generados de RRHH; no confundir con ventas). `POST /personal/drive/config` las rechaza; `GET` devuelve el ID de código por `companyId`. «Ver carpeta» en cada listado; sin tuerca. ID vacío: se lee `FolderConfig` en solo lectura.
- **Configurables (tuerca):** Guardias (`CUMPLIMIENTO`), archivo (`GUARDIAS_ARCHIVO`), Administrativos (`PERSONAL_ADMIN`).

### 13. Estándar único de nombre: «Apellidos Nombres»
Carpetas y listados de Reclutamiento, Guardias y Administrativos: `APELLIDOS NOMBRES`, sin guion, cédula ni puesto. Un solo lugar: `backend/src/modules/personal/utils/nombre-persona.util.ts` (`formatNombrePersona`, `normalizarNombrePersona`, `validarNombrePersona`, `advertenciaNombreCarpeta`).
- Cédula y puesto viajan en `candidato.json` / `datos.json` de la carpeta; el sync los lee de ahí (clave sin importar mayúsculas, tildes ni espacios). `syncFichaAdministrativo` escribe `puesto`.
- Mayúsculas/minúsculas valen igual. Nombre «Apellidos Nombres» sin cédula: **igual se crea el registro** («Sin cédula») con clave interna `ID-<folderId>` (la cédula es parte de la llave única); la clave no se muestra ni se escribe en el JSON; la cédula real la reemplaza en la misma fila. `guardiasNoReconocidos` queda para nombres con guion o vacíos.
- **No se renombra NADA en Drive** (ni automático ni en lote). Los parsers aceptan los formatos viejos (`Apellidos - Nombres`, `Apellidos Nombres - Cédula - Puesto`, `Nombre - Puesto`) y sincronizan; solo avisan cuáles renombrar a mano: `guardiasFormatoInvalido[]` (Guardias) y `errors[]` de `sync-personal-admin`.
- **Administrativos identifican por la carpeta** (`folderId`): «Apellidos Nombres» sin cédula ni `datos.json` entra con `ID-<folderId>` y el sync **crea** `datos.json` solo con `nombreCompleto`; sin ese formato ni cédula, se avisa y no se registra. El puesto guardado se conserva si el nombre nuevo no lo trae. Contratar un administrativo no exige puesto en la vacante (va a la ficha).
- **Formulario de postulación**: un solo esquema `Apellidos` + `Nombres` (únicos campos bloqueados). La cédula es un campo normal (sigue uniendo postulación ↔ ficha ↔ cumplimiento ↔ nómina, vive en el JSON). Campo por defecto «Celular» (tipo «Teléfono»). Se conservan los fallbacks que leen `nombre completo`/`nombreCompleto`.

### 14. Documentación no depende de la máquina
- LibreOffice (`soffice`) y Chromium vienen en `backend/Dockerfile`; credenciales de Drive por `GOOGLE_SERVICE_ACCOUNT_JSON` si no hay archivo.
- `uploads/hr-templates` y `uploads/hr-contracts` son **caché, no almacén** (disco efímero de Cloud Run). `ContractService.ensureDocxLocal()` rebaja la plantilla (de `StoredFile` o `driveUrl`); `ensureContractFile()` sirve el PDF (`ContractFileController.serveFile`, async). Ventas conserva la limitación.

### 15. UX y bucle de redirección del login
- **`SectionRoute` redirige a `landingRoute`** (`hooks/usePermissions.ts`: primera sección de `LANDING_ROUTES` que el usuario de verdad puede ver), nunca a `/dashboard` fijo (DASHBOARD se puede negar por usuario y causaba un bucle en blanco). `landingRoute` null → `SinSeccionesDisponibles`. `/` es `RootRedirect`; `LoginPage` navega a `/`. Una sección nueva se suma a `LANDING_ROUTES` si sirve de primera pantalla.
- `UpdatePersonalFieldDefinitionDto` acepta `type`; los valores guardados no se convierten ni borran (el frontend lo avisa).
- `PersonalFieldsConfigModal` y `DocumentosRequeridosModal`: edición explícita (modo edición + **Guardar** + `ConfirmDialog` que resume el cambio), mismo patrón a propósito; modales anchos con `.modal-xl`.
- `components/common/RowActionsMenu.tsx`: menú de acciones secundarias de fila; usarlo cuando una fila acumule botones.

### 16. Drive para documentos generados y layout
- **c) Documentos generados**: `ContractService` sube el PDF a `RRHH_DOCUMENTOS` («Persona - Tipo - Fecha.pdf») y guarda `Contract.driveFileId`/`driveUrl`. Con guardia del padrón, un aviso pregunta carpeta general o carpeta de Drive del guardia (`guardarEn: 'general' | 'guardia'`); sin carpeta vinculada no genera y pide sincronizar o usar la general. «Llenar a mano» siempre va a la general. Si falla la subida, la generación no se cae (queda en el log). «Ver carpeta» usa `GET /personal/drive/config?type=RRHH_DOCUMENTOS`.
  - **Orden al servir el PDF (`ensureContractFile`): disco → Drive → regenerar.** Drive antes de regenerar a propósito: regenerar da un documento distinto si la plantilla cambió, inaceptable en un papel firmado.
  - Solo Guardias de RRHH; los contratos de Ventas son otro subsistema con firma electrónica.
- **d) Layout estable** (`styles.css`, sección `LAYOUT ESTABLE`): `.page-title-row` (acciones con `margin-left:auto`), `.filter-bar-fields`/`.filter-bar-actions`, `.filter-select`, `.icon-btn` («Limpiar filtros» = brocha sin texto, siempre visible y deshabilitada si no hay nada), `.truncate`. **No poner controles que aparezcan/desaparezcan en medio de una fila**: deshabilitar o usar `RowActionsMenu`.
- **e) Guardias: Apellidos y Nombres separados** (`separar-nombre.util.ts`): exacto si el formulario de postulación los guardó por separado; si no, aproximado (dos apellidos, `exacto: false`) con subrayado punteado y tooltip. En carpetas «Nombres Apellidos» sale invertido; se corrige con el formulario o renombrando al estándar.
- **f) Secciones no negables**: `ALL_SECTIONS` con `siempreVisible: true` en `DASHBOARD` («Inicio») y `PROJECTS`; `SectionPermissionGuard` y `usePermissions.canView` las dejan pasar; `CompanyAdminPermissions.tsx` las muestra bloqueadas.
- **h) WhatsApp bloqueado** («Próximamente») en `GuardiaComplianceModal` y `NotificationConfigModal`; el código de Twilio sigue, falta proveedor y cuenta Business.

### 17. Seguridad y utilidades transversales
- `.gitignore` con patrón amplio para claves de cuentas de servicio (`backend/*-*.json`, `backend/google-service-account*.json`; excepciones `package*.json`, `tsconfig*.json`, `nest-cli.json`).
- Base: Cloud SQL (`gemeseg-db`); SSL de `prisma.service.ts`/`seed.js` detecta `cloudsql`/`pooler`. `GmailMailService` vive en `backend/src/modules/mail/`; ver «Correo saliente» en `AGENTS.md`.
- **Recuperación de contraseña con código**: `POST /auth/forgot-password/request` responde **siempre lo mismo** exista o no la cuenta; `POST /auth/forgot-password/confirm` canjea código + contraseña (mín. 8). `PasswordResetCode`: 6 dígitos **hasheado con bcrypt**, caduca en 15 min, un solo uso, máx. 5 intentos, uno nuevo invalida los anteriores. Remitente siempre el de sistemas (`AuthService.REMITENTE_CONTRASENA`).
- Tablas: `useSortableTable` (`localeCompare(…, 'es')`, vacíos al final), `useResizableColumns` (**callback ref**, el tirador corta el `click`, ancho recordado por persona), `ClearFiltersButton`. Aplicar a toda tabla de listado nueva (ver `CLAUDE.md`).
- Reportar a Sistemas: «Pegar última captura» (`navigator.clipboard.read()` y Ctrl+V), `POST /sistemas/upload`, tope 10 MB en cliente. `SistemasService` notifica **solo in-app** al reportante (al crear, `EN_REVISION`, `RESUELTO`; solo si cambió el estado). `Notification.companyId` es obligatorio y `TicketSoporte.companyId` puede ser null: se usa la empresa del usuario, si no tiene no se notifica; `link: '/dashboard'`; un fallo nunca revierte. `SistemasModule` importa `NotificationsModule`, nada de correo.

### 18. Remitente de correo por empresa
- `NotificationConfig.senderEmail`/`senderName` se usan de verdad: `GmailMailService` cachea **un cliente por remitente** (`clientesPorRemitente`; la delegación impersona a una persona concreta); `sendMail` acepta `from`/`fromName` (`Nombre <correo>` en base64); `AlertaVencimientoService` los pasa.
- `NotificationConfigService.upsert` valida la casilla contra Google **antes de guardar** sin enviar (`verificarRemitente`). `explicarErrorGoogle` busca sobre todas las piezas del error juntas (código y texto vienen en campos distintos).
- **El remitente debe ser un usuario REAL del dominio con buzón propio**; alias y grupos no sirven. La Gmail API debe estar habilitada en el proyecto de Google.

### 19. Remitente de correo por empresa
Ver punto 18.

### 20. Encuestas: notificación al publicar
Ver punto 10. Cubierto en `survey.service.spec.ts`.

### 21. Administrativos
- **Alta manual**: botón «Nuevo» (solo `RRHH` write) → `POST /personal/drive/personal-admin` (`DriveService.crearPersonalAdministrativo`): crea la carpeta «Apellidos Nombres» bajo `PERSONAL_ADMIN`, la fila `EmployeeDriveFolder`, la ficha (con puesto) y `datos.json`. Cédula opcional (sin ella `ID-<folderId>`). Toda validación (nombre sin guion ni cédula, cédula de 10 dígitos, duplicado por cédula y nombre, raíz configurada) corre ANTES de crear la carpeta. Se crea impersonando al dueño humano (`resolverClienteParaCrear`; una cuenta de servicio no tiene cuota). **No** crea Movimiento de entrada (solo `contratarCandidato`); confirmar si se quiere. Guardias no tiene «Nuevo».
- **`puesto`** (TEXT, LABORAL) es campo por defecto de `PERSONAL_ADMIN` (`DEFAULT_FIELDS_BY_SCOPE`), texto libre, misma clave que guarda `contratarCandidato`. `AdministrativeStaffFichaService.upsert` actualiza `EmployeeDriveFolder.puesto`; `get` lo rescata de la carpeta si la ficha no lo tiene.

## Carpetas Drive (`FolderConfig`, `type` único por `(companyId, type)`)
- `CUMPLIMIENTO` (configurable): `<raíz>/Público|Privado/<Provincia - Entidad>/[Apellidos Nombres]` (cédula en JSON; viejas `… - Cédula` válidas).
- `RECLUTAMIENTO` (fija): `<raíz>/<Puesto>/` con el JSON del puesto + carpetas de postulantes.
- `PERSONAL_ADMIN` (configurable): `<raíz>/[Apellidos Nombres]` por empleado.
- `GUARDIAS_ARCHIVO` (configurable): destino de «Archivar carpeta» (punto 6), la carpeta se mueve tal cual.
- `CAPACITACIONES` (fija): punto 8. `VENTAS_CONTRATOS` (fija): `<raíz>/<Plantilla>/`, creada la primera vez.
- `DriveService.syncFolder` (`POST /personal/drive/sync`, estructura plana vieja) no existe; no reintroducir.

## Endpoints clave (los de cada submódulo están en su punto)
- **Reclutamiento**: `GET/POST/DELETE /personal/reclutamiento/puestos`; `POST .../sync` (devuelve `tipoContratacion` y `modoSubida`); `POST .../candidatos/:folderId/contratar` (mueve y **renombra** a «Apellidos Nombres»; sin carpeta destino configurada bloquea sin mover). `JobPosition.tipoContratacion` (`GUARDIA` | `ADMINISTRATIVO`, default `GUARDIA`) decide la raíz destino.
- `POST .../candidatos/:folderId/analizar` (`?driveFileId=`): la IA **propone** qué documento requerido está en qué páginas de un PDF (sin `driveFileId`, el único PDF de la carpeta; con él, ESE archivo sin importar `modoSubida`). No escribe en Drive.
  - El prompt vive como `Agent` (`name = 'Revisor de Documentos (IA)'`, `scope: 'RECLUTAMIENTO'`), editable en `/admin/agents` (solo ADMIN) sin redeploy; se autocrea. Solo el CRITERIO es editable: requisitos, total de páginas y contrato JSON los agrega el código. Manda `probabilidad` 0-100 (alta desde 85; bajo 55 no se preseleccionan páginas). Ver [reclutamiento.md](reclutamiento.md).
  - **Gotcha axios/Express**: body `null` se serializa como `"null"` y el `body-parser` estricto lo rechaza con 400; mandar `{}`.
- `POST .../aplicar-analisis`: parte el PDF en un archivo por documento (`"<Requisito> - <original>"`, formato de `findMatchingFile`), conserva el original; recibe **lista de páginas** por documento. La traza va a `analisis-ia.json`, **nunca** a `candidato.json` (el portal lo reescribe).
- Vertex: `GOOGLE_VERTEX_PROJECT` (+ `GOOGLE_VERTEX_LOCATION`, `GOOGLE_VERTEX_MODEL_FUERTE`, `GOOGLE_VERTEX_MODEL_LIGERO`; chat: `GOOGLE_VERTEX_CHAT_MODEL`, ver [agents-ai.md](agents-ai.md)). **No acepta API keys**: usa la service account de Drive con scope `cloud-platform`. Vacío = deshabilitado. En producción van en `cloudbuild.yaml`; solo en Cloud Run no dura (`--set-env-vars` reemplaza todas en cada deploy).
- **Gotcha de entorno**: bajo `Documents`/OneDrive, `nest --watch` y Vite pueden dejar de detectar cambios y servir código viejo; si un fix «no aparece», comparar mtime con la hora de arranque del proceso y reiniciar.
- `GET /personal/guardias`: padrón (nombre + cédula), sección `RRHH`. Las pantallas de RRHH usan **este**, no `GET /custodias/available-custodios` (sección `CUSTODIAS`: fallaba con «No tienes acceso a CUSTODIAS»). `EmpleadoSelect` tiene prop `source`.
- **Drive** (`/personal/drive/...`): `tree`, `compliance/:cedula` (incluye `review`/`reviewSummary`), `employee/:cedula` (DELETE), `config`, `test`, `sync-entidades`, `sync-personal-admin`, `personal-admin`, `guardia/:cedula/archivar-carpeta`, `guardia/:cedula/mover-entidad` (`RRHH` write), `guardia/:cedula/lista` (DELETE). `POST config` solo acepta `CUMPLIMIENTO` / `PERSONAL_ADMIN` / `GUARDIAS_ARCHIVO`.
- **Revisión documental** (`SectionPermissionGuard`, no `RolesGuard`): `POST /personal/drive/documents/review` (motivo obligatorio al rechazar, mín. 5 caracteres; `documentTypeId` o `driveFileId`), `GET .../documents/reviews/:cedula`, `GET .../documents/review-history?cedula=`. `DocumentReview` (actual) y `DocumentReviewHistory` (traza) están separados de `EmployeeDocument` a propósito: `deleteEmployeeByCedula` borra documentos y una re-subida genera `driveFileId` nuevo; la traza **sobrevive** al borrado (auditoría, por cédula sin FK). `review.stale = true` si el archivo ya no es el revisado. El match archivo↔tipo exige frase completa, todos los términos, o ≥60 % si son 3 o más; **cada archivo se asigna a un solo tipo**.
- `GET /personal/asignaciones` (+ `/guardia/:cedula/historial`), `DELETE .../:id`; `POST` y `PATCH .../finalizar` existen solo para el sync (sin UI; no reintroducir formulario manual). `cedula-merge` (`preview`, ejecutar, `historial`): solo ADMIN. `POST /personal/guardias/export-pdf` (`RRHH` view).
- `POST /personal/cumplimiento-entidades/guardia/:cedula/enviar-recordatorio`: envío **manual**; **no existe** `POST /personal/alertas-vencimiento/ejecutar` ni cron de correos masivos (decisión explícita).

## Rutas frontend (bajo `/rrhh`, `SectionRoute section="RRHH"`)
`/rrhh` PersonalDashboard (botón «Ayuda» abre `RrhhHelpModal.tsx`) · `/reclutamiento` · `/guardias` · `/administrativo` · `/contracts` («Documentación»; `/contracts/generar`) · `/entidades` · `/cumplimiento` · `/historial` · `/capacitaciones` · `/quejas` (SIN `SectionRoute`) · `/quejas/gestion` · `/encuestas` (SIN `SectionRoute`) · `/encuestas/gestion` · `/configuracion` (`?pestana=avisos|correo|requisitos`).
- Sin login y fuera de `ProtectedLayout`: `/encuesta/:token` (`PublicSurveyPage`) y `/quejas` (`PublicComplaintPage`).
- No existen `/rrhh/certifications`, `/compliance`, `/kanban`, `/candidates*`, `/logs`, `/drive-config`, `/document-types`; `/asignaciones` y `/movimientos` solo redirigen.

## Notas de diseño de Entidades/Cumplimiento (antes «Backlog»)


### Backlog 2. Personal Administrativo — carpeta propia
- `FolderConfig.type='PERSONAL_ADMIN'` (`FOLDER_CONFIG_TYPES` en `drive.dto.ts`); `EmployeeDriveFolder.puesto`.
- **No reutilizar `parseEmployeeFolderName`** (Custodios; trata el segmento tras el último «-» como cédula y haría colisionar a dos empleados con el mismo puesto por `@@unique([companyId, cedula])`); el parser propio es `parsePersonalAdminFolderName` (`drive.service.ts`).
- `syncPersonalAdminFolder` guarda `folderType='PERSONAL_ADMIN'` pero `EmployeeDocument.folder='PERSONAL'` (deliberado: el checklist de `DocumentType` para `'PERSONAL'` sigue aplicando). Filas viejas `folderType='PERSONAL'` se dejan intactas. `getTree()` devuelve `CUSTODIAS`, `PERSONAL`, `PERSONAL_ADMIN`. `cedula` es key opaca (puede ser clave interna) para `getDriveCompliance`, `getDocumentReviewHistory`, `deleteDriveEmployee`.

### Backlog 3. Entidades y cumplimiento — Drive como fuente de la verdad
La estructura `raíz → Público/Privado → Entidad → Guardia` en Drive es la fuente de la verdad de la asignación (sin formulario manual de asignaciones ni alertas masivas). Un guardia puede rotar entre entidades o volver; cada entidad exige los mínimos de la empresa o requisitos propios.

**`DriveService.syncEntidadesFolder(companyId, userId)`** (`CUMPLIMIENTO`):
1. Primer nivel normalizado a «publico»/«privado»; lo demás va a `carpetasNoReconocidas` sin romper el sync.
2. Cada subcarpeta es una `Entidad` **anclada por `Entidad.driveFolderId`**: mismo ID = misma entidad aunque se renombre; sin vincular, se busca por nombre (case-insensitive) y se ancla; si no existe se crea con el tipo de la carpeta. Tipo distinto: no se sobreescribe (`entidadesTipoDistinto`). Dos carpetas con el mismo nombre: `entidadesColisionNombre`, sin reanclar.
3. Cada subcarpeta de entidad es un guardia **anclado por `EmployeeDriveFolder.folderId`**. Sincroniza sus `EmployeeDocument` con `folder='CUSTODIAS'` (deliberado: `custodias.service.ts:getAvailableCustodios` depende de ese valor) y crea/actualiza `Datos_Personales.json` (espejo de solo lectura de `GuardiaFichaPersonal`, nunca se lee de vuelta; un fallo al escribirlo va a `errors` sin interrumpir).
4. Reconcilia `AsignacionGuardia`: abre fila por guardia sin asignación activa, cierra (`fechaFin`) la de quien cambió o desapareció; **nunca borra `Entidad` ni `RequisitoDocumento`** por un accidente de Drive. Si el guardia ya está «fuera» (punto 6) no se reabre: `guardiasFueraConCarpetaActiva`.
5. Devuelve un resumen íntegro (`entidades*`, `guardias*`, `documentos`, `fichasPersonales`, `asignaciones*`, `carpetasNoReconocidas`, `renombresIgnorados`, `errors`) que la UI muestra completo.

**Identidad anclada al ID de carpeta, no al texto**: nombre cambiado → se actualiza el nombre, nunca fila nueva ni huérfana. `folderId` vinculado pero cédula parseada DISTINTA → se **mantienen cédula/nombre originales** y se reporta en `renombresIgnorados` (no hay forma de confirmar una corrección real; hablar con la usuaria antes de construirla). Carpeta nueva ilegible → no crea fila. Tests: `drive.service.spec.ts` (`describe('DriveService.syncEntidadesFolder', ...)`).

- **`GuardiaContacto`** (`cedula, email` por `companyId`): correo de recordatorios, editable en Datos personales; independiente de la entidad.
- **`GuardiaFichaPersonal`**: editable desde `GuardiaFichaModal.tsx`, **nunca desde Drive**. Cédula, apellidos, nombres y correo se muestran siempre (cédula vacía mientras no tenga 10 dígitos); con apellidos y nombres escritos se actualiza el nombre de la lista (la carpeta de Drive no se renombra). Fuente de `Datos_Personales.json`.
- **Estados**: `CUMPLIDO` / `FALTANTE` / `VENCIDO` / `POR_VENCER`. Un requisito «no vence» (`duracionValor: null`) nunca es `VENCIDO`/`POR_VENCER` aunque haya `expiryDate` extraída.
- Inputs/selects de un modal van en `.form-group` (regla CSS junto a `.modal-body` estiliza los sueltos).
- **Recordatorios manuales, sin cron**: `AlertaVencimientoService.enviarRecordatorio(companyId, cedula, medio)` (botón «Enviar recordatorio» en `GuardiaComplianceModal.tsx`; solo `EMAIL`). Correo consolidado de lo pendiente vía `GmailMailService`; constancia en `AlertaVencimiento` (`errorMessage` si falla). Destino: `GuardiaContacto` (sin contacto, botón deshabilitado con tooltip). Requiere **domain-wide delegation** del scope `https://www.googleapis.com/auth/gmail.send` (la configura un admin de Workspace) y una casilla remitente real (`GMAIL_SENDER_ADDRESS`); sin delegación falla limpiamente. `RRHH_CONTACT_EMAIL` define a dónde pide el correo al guardia que envíe el documento renovado.
- **«Leer con IA»** (`ComplianceChecklist.tsx`, prop `allowAiExtract` solo en `CumplimientoEntidades.tsx`): `POST /personal/drive/documents/:driveFileId/extract-expiry` (`DocumentExtractionService.extractExpiry`, `RRHH` write). **Solo propone**; guardar pasa por `PATCH .../expiry`. Solo PDFs con capa de texto (`pdf-parse@1.1.1`, pura JS; la v2 usa binario nativo incompatible con Cloud Run; sin OCR); menos de 40 caracteres → `reason: 'SIN_TEXTO'` sin llamar a la IA. Usa Vertex (`GoogleAuthService`, `GOOGLE_VERTEX_MODEL`) y devuelve JSON `fechaEmision`, `fechaVencimiento`, `confianza`, `notas`; respuesta ilegible → `RESPUESTA_INVALIDA`.


## Configuración única de RRHH y encabezados estándar
- **`/rrhh/configuracion?pestana=avisos|correo|requisitos`** (`ConfiguracionRrhhPage.tsx`): «Avisos de vencimientos» (vigilante), «Correo de envío» (`CorreoEnvioPanel.tsx`) y «Requisitos generales» (`RequisitosGenerales.tsx`, exporta `DuracionAnticipacionFields` y `RequisitoRow`). «Entidades y Requisitos» conserva los requisitos específicos y enlaza a Configuración.
- **Encabezado estándar** `components/personal/RrhhPageHeader.tsx` (módulo «Recursos Humanos», descripción, botones al pie: secundarios primero y el principal al final) en todas las pantallas de RRHH.
- `PanelConfig.tsx`: Guardar y Probar ahora van en la **cabecera** de la pestaña; cambiar de pestaña con cambios sin guardar pregunta (`onSucio`).
- **Aviso de «se movió»**: `components/common/MovidoAConfiguracion.tsx` (línea fija con enlace) en las pantallas de las que salió una opción (Cumplimiento, Entidades y Requisitos; en Contratación Pública: Entidades Públicas, Bitácoras, Horarios). Toda opción movida a una Configuración debe dejarlo.

## Vigilante de vencimientos: aviso diario en la campana
**No hay correos automáticos ni masivos a guardias**: el único aviso automático es una notificación en la campana del personal de RRHH; el correo al guardia es el botón manual. Decisiones de la usuaria (no re-proponer lo contrario): solo campana; el momento lo configura RRHH; los documentos sin fecha se cuentan aparte.
- `backend/src/modules/personal/vigilante/`. Cloud Scheduler llama a diario a `POST /api/personal/vencimientos-cron/run` (header `x-cron-secret` = `CRON_SECRET`; sin la variable 404, secreto malo 401; `?dryRun=true` no deja campanas). Nunca imprimir la salida de `gcloud scheduler jobs create` (muestra el secreto). Sin la corrida programada no avisa nada.
- Revisa cada documento entregado de un requisito que vence (`CumplimientoEntidadService.getDocumentosVigilados` → `{ documentos, faltantes }`). Avisa **el día exacto** en que faltan N días (`avisarDias`, por defecto 30, 7 y 0) y, ya vencido, el primer día y luego cada `repetirVencidoDias` (7; 0 = no repetir). Sin estado: repetir la corrida el mismo día no duplica (comprueba si ese usuario ya recibió el aviso hoy, día de Ecuador). Un día sin corrida pierde ese plazo.
- Cada lunes (`resumenLunes`) resumen de vencidos, sin fecha y **faltantes** (los faltantes solos no disparan aviso entre semana). Un aviso por persona y día (título «Vencimientos de documentos», enlace `/rrhh/cumplimiento`) para quienes escriben en RRHH (`getCompanyUserIdsWithWriteAccess`).
- Config por empresa en `RrhhVigilanteConfig` (se crea al arrancar; sin tabla usa valores de fábrica). `GET|PUT /personal/vigilante-vencimientos/config` (ver = RRHH ver, guardar = RRHH escribir), `POST .../simular` (sin enviar), `POST .../probar` («Probar ahora»: deja solo en la campana de quien lo pulsa el resumen completo; requiere guardar antes).
- **Un solo lugar para los plazos**: el semáforo («por vencer») y el correo «Enviar recordatorio» usan el plazo MÁS LEJANO de `avisarDias` (30 sin config; `CumplimientoEntidadService.ventanaPorVencerDias`). Los formularios de requisito solo piden «¿Cada cuánto vence?». `RequisitoDocumento.anticipacionValor/anticipacionUnidad` siguen en la base pero **no se usan ni muestran** (el servicio pone 30/DIAS al crear).

## Quejas de la inducción: formulario público (`quejas.gemeseg.com`) + etiqueta Interna/Externa
Formulario público al que se llega por **código QR** en la inducción; cae en el mismo tablero de Quejas con etiqueta **Interna** (buzón de la app) o **Externa** (formulario público).
- **Formulario** (`pages/personal/PublicComplaintPage.tsx`, ruta `/quejas`, sin sesión): tipo, sede, fecha de inducción, personas involucradas (opcional), qué ocurrió, «Enviar de forma anónima» (por defecto) y casilla obligatoria de política de privacidad (el servidor exige `aceptaPrivacidad` en true). No anónima: nombre (opcional) y correo o teléfono (al menos uno). Anónima = el servidor no guarda ningún contacto aunque el navegador lo mande, `submittedBy` null, la IP solo sirve para el límite y no se guarda.
- **Dominio**: mismo sitio de Firebase Hosting con dominio personalizado (agregarlo en Firebase Console y crear los registros DNS). En ese host `RootRedirect` manda `/` a `/quejas` (`esDominioDeQuejas()` en `publicComplaint.service.ts`) y el chat flotante no se muestra en `/quejas`. El backend acepta el origen `https://quejas.gemeseg.com` SOLO para `/api/public/quejas...` (`main.ts`).
- **Datos** (se crean **al arrancar**, aditivo: `src/prisma/complaint-externa.schema.ts`): columnas en `Complaint` (`origen` 'INTERNA'|'EXTERNA' por defecto 'INTERNA', `tipo`, `sede`, `fechaInduccion` texto 'YYYY-MM-DD', `contactoNombre/Email/Telefono`, `personasInvolucradas`) y tablas `ComplaintPublicOption` (tipos y sedes por empresa) y `ComplaintPublicSetting` (empresa receptora, `enabled`).
- **Una sola empresa recibe** (Gemeseg). RRHH lo activa con el botón del QR en Gestión de Quejas; si otra empresa ya lo tiene, se rechaza. En producción hay que activarlo a mano una vez (hasta entonces dice «no disponible»). Al activar siembra sedes Guayaquil y Loja y cinco tipos base, editables en `ComplaintPublicConfigModal.tsx` (muestra y descarga el QR con `qrcode.react`). Quitar una opción no toca las quejas recibidas (guardan el texto).
- **Tablero**: etiqueta «Interna» (gris) / «Externa» (amarilla), filtro Todas/Internas/Externas; el detalle de una externa muestra tipo, sede, fecha, personas involucradas y contacto. Cada externa deja el aviso «Nueva queja externa» en la campana de quienes escriben en RRHH (si falla, la queja ya está guardada).
- **Protección** (`public-complaint.controller.ts`, `services/complaint-externa.service.ts`): tipo y sede de la lista de la empresa, fecha de inducción no futura ni de hace más de 5 años, campo trampa oculto (responde «ok» sin guardar), campos desconocidos rechazados, 30 envíos por IP cada 10 min (holgado: un grupo en una sala comparte IP).
- **Endpoints**: públicos `GET /api/public/quejas/formulario` y `POST /api/public/quejas`; RRHH `GET/PATCH /personal/complaints-externas/config`, `POST .../opciones`, `DELETE .../opciones/:id`.

