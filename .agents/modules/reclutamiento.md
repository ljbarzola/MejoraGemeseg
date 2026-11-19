# Módulo Reclutamiento

Candidatos postulantes sincronizados desde Google Drive (solo lectura, salvo contratar), vacantes (`JobPosition`), revisión documental, contratación y análisis con IA de PDFs. Parte de `Personal`. No existe Kanban de candidatos (eliminado; no reintroducirlo).

## Arquitectura
- Backend: `DriveService.syncReclutamientoCandidates()`, `DriveService.contratarCandidato()`, `services/reclutamiento-ia.service.ts`, endpoints en `drive.controller.ts`. Frontend: `pages/personal/ReclutamientoPage.tsx`, `pages/personal/reclutamiento/AnalisisArchivoUnicoModal.tsx`, ruta `/rrhh/reclutamiento`.
- Candidatos en Drive (`Reclutamiento/<Vacante>/<Apellidos Nombres>/`); no hay candidatos en BD. Raíz de Drive fija en código (`HARDCODED_DRIVE_FOLDERS.RECLUTAMIENTO`, mismo ID que el portal); no se usa `FolderConfig` para este tipo.
- Flujo: crear vacante (BD + JSON espejo en Drive) → postulantes suben a Drive → "Sincronizar" → RRHH completa datos y aprueba/rechaza documentos → "Marcar como Contratado".
- Permisos: escritura (contratar, borrar vacante, IA, reasignar) con `@Section('RRHH','write')`; config Drive y borrar empleados solo ADMIN.
- **Portal de postulación en OTRO repo** (`RECLUTAMIENTO`, módulo `recruitment`); se comunican solo por Drive. `uploadCandidateJson` del portal reconstruye `candidato.json` desde cero con seis claves (`datosFormulario`, `puesto`, `puestoId`, `fechaPostulacion`, `archivos`, `modoSubida`): cualquier clave añadida aquí se pierde si el candidato vuelve a postular. Por eso los datos propios van en archivos aparte. `estado`/`fechaContratacion` no se pierden: al contratar la carpeta sale de Reclutamiento.
- `drive.module.ts` duplica el registro de `DriveController`/`DriveService`; manda `personal.module.ts`.

## Algoritmo `syncReclutamientoCandidates` (solo lectura)
1. Lista vacantes y carpetas de candidato; carga los `JobPosition`.
2. Por candidato: parsea nombre (cédula desde `candidato.json` si no está), lee `candidato.json`, empareja `puestoAplicado` con la vacante, calcula `completitudPercent`.
3. `nombre`/`cedula`/`telefono`/`email` salen de `datosFormulario` por coincidencia insensible a mayúsculas/acentos (`buscarDatoFormulario`), nombre de carpeta de respaldo. Se conservan fallbacks `nombre completo`/`nombreCompleto` para JSON viejos.
4. Expone `modoSubida` (default `'individual'`), `tipoContratacion` (de la vacante) y `archivosAdicionales` (sin `.json`).
- `completitudPercent` = obligatorios encontrados / total obligatorios.
- Matching archivo↔requisito por nombre (`scoreMatch`/`matchDocuments`): frase completa > todos los términos > 60 % con 3+; cada archivo a un solo tipo; gana el más reciente. `hasMatchingFile()` acepta archivos crudos de Drive (`.name`) y de BD (`.fileName`).

## Sprint 9 — Estándar de nombres y limpieza del formulario de vacante
1. **Un solo esquema:** `Apellidos` + `Nombres` (orden de la carpeta), únicos campos bloqueados (`isLockedCampo`).
2. **La cédula es campo normal** (quitable/opcional). Es la llave postulación ↔ ficha ↔ cumplimiento ↔ nómina, pero vive en `candidato.json`, no en el nombre de carpeta (`recursos-humanos.md` punto 13).
3. Campo por defecto **Celular**. Sin extensión marcada = acepta cualquier tipo.
5. **Eliminar vacante:** `DELETE /personal/reclutamiento/puestos/:id` manda la carpeta a la **papelera** de Drive (reversible); `ConfirmDialog` indica cuántos postulantes hay. `CERRADA` retira sin eliminar.
6. "Completar fichas" eliminado (botón, endpoint `backfill-postulacion`). El traspaso automático al contratar sigue (`recursos-humanos.md` punto 11).

## Sprint 8.3 — Recontratación, modales propios, scroll a errores
1. **Recontratar tras una salida:** `contratarCandidato` consulta `MovimientoPersonalService.isActivo(companyId, cedula)` antes de bloquear. `EmployeeDriveFolder` (`@@unique([companyId, cedula])`) nunca se borra al registrar salida; si NO está activo se permite (`crearEntrada()` abre un `ENTRADA` nuevo, idempotente). Si sigue activo se bloquea sin sugerir "Fusionar cédulas" (eso es para cédulas distintas de una persona).
2. **Nunca `window.confirm/alert/prompt`:** `ConfirmDialog`/`PromptDialog` (`frontend/src/components/common/`).
3. **Errores en modal con scroll:** `useEffect` + `ref` + `scrollIntoView({ behavior: 'smooth', block: 'center' })` (`contratarError`, `salidaError`); el botón está en el footer fijo y el banner arriba.
4. Kanban eliminado del código (`recursos-humanos.md` punto 2, `movimientos-personal.md`).

## Sprint 8 — Análisis con IA del "archivo único"
Con `modoSubida='archivo_unico'` el candidato entrega un solo PDF; como todo matchea por nombre, el checklist salía vacío.
- **Se parte el PDF** (no se anotan rangos): al confirmar se crea un archivo por documento en la misma carpeta, conservando el original. El candidato pasa a comportarse como `individual` y nada aguas abajo cambia.
- **Vertex AI + Gemini multimodal** (los PDFs son fotos/escaneos; Document AI se descartó por costo y entrenamiento).
- **Auth:** Vertex NO acepta API keys, exige OAuth2; la org GCP bloquea crear claves de service account, así que se reutiliza la de Drive (`GOOGLE_SERVICE_ACCOUNT_JSON`) con scope `cloud-platform`, `aiplatform.googleapis.com` habilitada y `roles/aiplatform.user`.
- **Variables:** `GOOGLE_VERTEX_PROJECT` (vacía = función deshabilitada, Reclutamiento sigue a mano), `GOOGLE_VERTEX_LOCATION`, `GOOGLE_VERTEX_MODEL_FUERTE` (esta función usa el nivel fuerte). Gemini 3.x solo responde por el endpoint `global`. Detalle en `agents-ai.md` punto 4. Deben estar en `cloudbuild.yaml`: `--set-env-vars` **reemplaza** todas las variables planas, lo puesto a mano en la consola se pierde.
- **`ReclutamientoIaService`:**
  1. `analizar` NUNCA escribe; solo propone. Lo que toca Drive pasa por `aplicar` con lo confirmado por RRHH.
  2. Fallos visibles y accionables (`NO_CONFIGURADO`, `SIN_PDF`, `VARIOS_PDF`, `SIN_REQUISITOS`, `PDF_ILEGIBLE`, `PDF_MUY_GRANDE`, `ERROR_DRIVE`, `ERROR_IA`, `RESPUESTA_INVALIDA`, `SIN_ESPACIO_RESPUESTA`). A la UI solo viaja el código; el detalle de Vertex va al log.
  3. Parseo defensivo: se descartan requisitos inventados y rangos fuera del PDF; rango a medias = "no encontrado"; los omitidos se agregan como "no encontrado".
  4. **Confianza:** el modelo da `probabilidad` 0-100; alta solo desde 85 **y** con frase visible que nombre el documento; media 55-84; baja <55 (sin preselección). La etiqueta del modelo se ignora si contradice el número.
  5. `aplicar` recibe una **lista de páginas por documento** (`AsignacionConfirmada { requisito, paginas: number[] }`): un documento puede ser no consecutivo. Requisito repetido se rechaza. **Valida todo antes de escribir el primer archivo.** Archivos: `"<Requisito> - <original>.pdf"`, igual que `reassignReclutamientoFile`, así `findMatchingFile` los reconoce. Borra `analisis-ia-pendiente.json` al terminar.
  6. Petición: `thinkingConfig: { thinkingBudget: 0 }` (el razonamiento consume el cupo de `maxOutputTokens` y dejaba sin espacio la respuesta), `maxOutputTokens: 4096`, `responseMimeType: 'application/json'`. `MAX_TOKENS` con texto vacío = `SIN_ESPACIO_RESPUESTA`; `RESPUESTA_INVALIDA` solo si la respuesta no es JSON válido.
  7. Si falla conociendo ya archivo y páginas (`ERROR_IA`, `RESPUESTA_INVALIDA`, `SIN_ESPACIO_RESPUESTA`) el resultado igual incluye `archivo`, `totalPaginas`, `requisitos` para etiquetar a mano.
- **Trazas en la carpeta del candidato (NUNCA en `candidato.json`):** `analisis-ia.json` (confirmado), `analisis-ia-pendiente.json` (propuesta; `GET .../analisis-pendiente` la devuelve sin llamar a la IA y el modal la lee primero), `revision-archivos-ia.json`. No son documentos del postulante.
- **Revisar con IA (archivos sueltos):** `POST .../revisar-archivos` califica cada casilla con alta/media/baja y describe cada adicional; no parte ni renombra. PDF e imágenes, Word no.
- **Agent `Revisor de Documentos (IA)`:** `scope: 'RECLUTAMIENTO'`, `createdBy: null`, autocreado en el primer uso, releído de BD en cada análisis (sin caché); inactivo = criterio por defecto. Solo controla el CRITERIO (límite 2.000 caracteres de `UpdateAgentDto.systemMsg`); lista de requisitos, total de páginas y contrato JSON (`{"documentos": [...]}`) los agrega el código SIEMPRE, para que editar el criterio no rompa el parseo. Solo ADMIN lo edita en `/admin/agents`.
- **Frontend (`AnalisisArchivoUnicoModal`):** miniaturas por página (`pdfjs-dist`, JPEG 1000 px q0.9, una sola vez en memoria) con desplegable de documento y badge de confianza como el de `ComplianceChecklist`; clic amplía. Importado con `React.lazy` (pdfjs pesa ~370 kB). "Reintentar"/"Analizar de nuevo" fuerza llamada fresca (confirma si hay páginas etiquetadas).
- **Entradas:** aviso morado (si `modoSubida === 'archivo_unico'`, autodetecta el único PDF) y botón por archivo `.pdf` en "Archivos Adicionales" (`analizarArchivoUnico(folderId, file.id)`, sin importar `modoSubida`); ambos con `canWrite('RRHH')`. Imágenes sueltas no tienen análisis.
- **Trampa:** enviar `{}` (no `null`) en `api.post` sin body: axios serializa `null` como `"null"` y el body-parser estricto de Express lo rechaza con 400 antes del controller (curl sin body no lo reproduce).
- **Proxy de PDF** `GET .../candidatos/:folderId/pdf/:driveFileId`: valida que el archivo esté dentro de la carpeta indicada para no leer ids de Drive arbitrarios.

## Sprint 7 — Destino de contratación según la vacante
- `JobPosition.tipoContratacion` (`'GUARDIA' | 'ADMINISTRATIVO'`, default `'GUARDIA'`), normalizado con `normalizeTipoContratacion` (desconocido = `GUARDIA`), espejado al JSON; `syncJobPositionsFromDrive` solo lo lee del JSON al crear una vacante detectada en Drive.
- Contratar **renombra** la carpeta a `Apellidos Nombres` (`recursos-humanos.md` punto 13) en la **misma llamada** `files.update` que el movimiento. `parseEmployeeFolderName`/`parsePersonalAdminFolderName` conservan formatos viejos.
- La cédula se escribe en `candidato.json` (con `estado`/`fechaContratacion`/`tipoContratacion`).
- Duplicados: Guardias por cédula contra `EmployeeDriveFolder`; Administrativos (sin cédula guardada) por `employeeName` normalizado entre `folderType='PERSONAL_ADMIN'` (más débil).
- Sin carpeta destino configurada se bloquea antes de tocar nada.
- Vacante resuelta por la carpeta **padre** (`JobPosition.driveFolderId`), si falla por `puestoId` de `candidato.json`, si no `GUARDIA`.
- El controlador sincroniza el destino correcto (`syncPersonalAdminFolder` o `syncEntidadesFolder`).
- UI: selector "Al contratar, esta persona entra como" en el modal de vacante, distintivo "Administrativo", y `ConfirmDialog` que nombra destino y nombre nuevo.

## Sprint 6 — Contratar un postulante
"Marcar como Contratado" en el modal del candidato (`canWrite('RRHH')`, con `ConfirmDialog`); sin tablero intermedio.
- `DriveService.contratarCandidato(companyId, folderId)`: (1) acepta "Apellidos Nombres" (cédula en `candidato.json`) y formatos viejos "Apellidos - Nombres" / "… - Cédula" de 10 dígitos; sin cédula rechaza; (2) chequeo de duplicado (Sprints 7 y 8.3); (3) marca `estado: 'CONTRATADO'` y `fechaContratacion` en `candidato.json`; (4) Guardias: resuelve o crea la carpeta **"Sin Asignar"**, tercer bucket de la raíz de Guardias (`FolderConfig type='CUMPLIMIENTO'`) junto a `Público`/`Privado`; (5) mueve con `addParents`/`removeParents` (sin copiar ni borrar documentos).
- `POST /personal/reclutamiento/candidatos/:folderId/contratar` sincroniza además el destino en la misma request.
- `syncEntidadesFolder` reconoce "Sin Asignar": sus subcarpetas son guardias directamente (un nivel menos), se sincronizan igual pero **nunca abren `AsignacionGuardia`** (quedan "sin asignación" hasta mover la carpeta a mano). Lógica compartida en `DriveService.syncGuardiaFolder(...)` (`entidad = null`).

## Sprint 5 — Requisitos obligatorios/opcionales y expediente
- `obligatorio: boolean` en `camposRequeridos`/`archivosRequeridos` (default `true`; `normalizeCampo`/`normalizeArchivo`; en BD y JSON de Drive). Solo archivos obligatorios cuentan en `completitudPercent`; en campos es informativo.
- **Expediente:** `DriveService.saveCandidatoDatos(folderId, datos, companyId)` crea/actualiza `candidato.json` con merge dentro de `datosFormulario` (preserva otras claves); `PATCH /personal/reclutamiento/candidatos/:folderId/datos`.
- **Reclasificar adicionales:** `DriveService.reassignReclutamientoFile(driveFileId, archivoNombre, companyId)` renombra el archivo en Drive con el nombre del requisito (`PATCH /personal/reclutamiento/documentos/:driveFileId/reassign`); sin columna de asociación.
- `updateJobPosition` lista la carpeta del puesto, usa el `.json` que realmente existe y autorrepara `driveFileId` en BD.

## Sprint 4 — Sincronización BD↔Drive de vacantes
- **Postgres es la única fuente de verdad** de `camposRequeridos`/`archivosRequeridos`/`descripcion`; el JSON de Drive es espejo de salida.
- `updateJobPosition` se autorrepara (crea `driveFolderId`/`driveFileId` si faltan) y devuelve `driveWarning` si Drive falla (el banner de `ReclutamientoPage` lo muestra).
- `syncJobPositionsFromDrive` NO copia esos campos del JSON a la BD en puestos existentes (solo repara el enlace); copiarlos revertía ediciones.
- **Reasignar a documento requerido (Cumplimiento):** `DriveService.reassignDocumentType(driveFileId, documentTypeId, companyId)` valida misma `folder`, renombra (`Cédula - <original>.ext`) y actualiza `EmployeeDocument.fileName`; `PATCH /personal/drive/documents/:driveFileId/reassign-type`. UI: `ReassignControl` en `ComplianceChecklist.tsx`. **No se auto-aprueba.**

## Sprint 3 — Revisión documental (aprobar/rechazar con motivo)
- Motivo obligatorio al rechazar; historial de quién, cuándo y por qué.
- `DocumentReview` (estado actual) + `DocumentReviewHistory` (append-only) en tablas aparte: `deleteEmployeeByCedula` hace `deleteMany` de documentos y una re-subida genera `driveFileId` nuevo. Sin FK a empleado (relación por cédula, deliberado para auditoría).
- Backend: `services/document-review.service.ts`, 3 endpoints en `drive.controller.ts` con `SectionPermissionGuard` + `@Section('RRHH', ...)`. `getCompliance` devuelve por documento `documentTypeId`, `driveFileId`, `review` (con `stale`) y `reviewSummary`; el campo es `compliancePercent`/`documents`.
- Frontend: `components/personal/ComplianceChecklist.tsx` (compartido; `GuardiaDetailModal` en solo lectura).
- No hay aviso al candidato tras un rechazo.

## API Endpoints (prefijo `/personal`; todos JWT)
- Vacantes: `GET|POST /reclutamiento/puestos`, `PATCH|DELETE /reclutamiento/puestos/:id` (DELETE: RRHH write), `POST /reclutamiento/puestos/:id/duplicate` (RRHH write).
- `POST /reclutamiento/sync` sincroniza candidatos.
- Candidatos (RRHH write salvo los GET, RRHH view): `POST .../candidatos/:folderId/contratar`, `PATCH .../datos`, `PATCH /reclutamiento/documentos/:driveFileId/reassign`, `POST .../analizar`, `GET .../analisis-pendiente`, `POST .../aplicar-analisis`, `POST .../conflictos-separacion` (avisa qué requisitos ya tienen archivo para reemplazar/mantener), `POST .../revisar-archivos`, `GET .../revision-archivos`, `GET .../pdf/:driveFileId`.
- Drive: `/drive/config` (POST ADMIN), `/drive/test`, `/drive/sync-entidades`, `/drive/sync-personal-admin`, `/drive/compliance/:cedula`, `/drive/tree`, `DELETE /drive/employee/:cedula` (ADMIN).

## Modelo `JobPosition`
`puesto`, `descripcion?`, `camposRequeridos` (Json `{nombre, tipo?, obligatorio}`; tipo TEXTO/ALFANUMERICO/NUMERICO/CORREO/TELEFONO/FECHA, solo guía visual), `archivosRequeridos` (Json `{nombre, extensiones?, obligatorio}`; extensiones solo guía, no se valida), `driveFileId?` (JSON del puesto), `driveFolderId?` (carpeta con el JSON y las carpetas de postulantes), `estado` (`ABIERTA | CERRADA`), `tipoContratacion`, `companyId` (`onDelete: Cascade`). `VerificationCheck` ya no existe (`movimientos-personal.md`).

## Deuda técnica
1. Sin notificaciones cuando un candidato sube documentos o completa el checklist.
2. Sin exportación de candidatos a CSV/PDF.
3. Sin OCR de respaldo: si el modelo no reconoce un documento, RRHH lo ubica a mano.
4. Sin probar contra Drive real: `aplicar-analisis` end-to-end y contratación de administrativos (mueven y renombran carpetas reales).
