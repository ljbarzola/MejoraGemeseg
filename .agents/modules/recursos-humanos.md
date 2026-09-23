# Módulo: Recursos Humanos (RRHH)

## Nota de nomenclatura (2026-09-08)
El módulo se llamaba **"Personal"** y pasa a llamarse **"Recursos Humanos (RRHH)"** de cara al usuario. El rename se pidió en dos capas — visible (menú/textos) **y** estructural (rutas `/personal/*` → `/rrhh/*`, clave de permisos `PERSONAL` → `RRHH`) — y **ambas ya están implementadas** (ver Backlog, punto 1, marcado como hecho). Deliberadamente **no** se tocó el prefijo de la API REST (`@Controller('personal')` sigue siendo `personal`, y `frontend/src/services/personal.service.ts` sigue llamando a `/personal/...`) ni ningún nombre de archivo/carpeta interno (`backend/src/modules/personal/`, `frontend/src/pages/personal/`, `PersonalDashboard.tsx`, etc.): es un contrato interno invisible para el usuario, y renombrarlo en los ~35 call sites que lo usan habría sido riesgo innecesario sin beneficio visible. Este documento describe el sistema **tal como existe hoy** y señala explícitamente qué falta para las otras iniciativas en curso. Este archivo reemplaza a `personal.md` (renombrado).

## Descripción
Gestión integral de RRHH: reclutamiento externo, contratos, movimientos de entrada/salida de guardias, bitácoras, y cumplimiento documental de Entidades/Guardias + Personal Administrativo sincronizado desde Google Drive (Drive es la fuente de la verdad de en qué entidad está cada guardia — ver punto 3).

## Submódulos (estado actual)

### 1. Reclutamiento (`/personal/reclutamiento`)
Documentado en detalle en [reclutamiento.md](reclutamiento.md) — no se duplica aquí. Resumen: `JobPosition` ahora tiene carpeta propia en Drive por puesto (contiene el JSON + carpetas de postulantes), campos de formulario con tipo de dato (`camposRequeridos: {nombre, tipo}[]`) y archivos requeridos con extensiones permitidas (`archivosRequeridos: {nombre, extensiones}[]`) — migraciones `20260908_add_job_position_drive_folder` y `20260908_campos_requeridos_json`. Candidatos sincronizados desde Drive son de solo lectura salvo por una acción: **"Marcar como Contratado"** (Sprint 6 de reclutamiento.md, 2026-09-10) — mueve la carpeta del candidato a Guardias (carpeta "Sin Asignar", todavía sin entidad) y la marca en su `candidato.json`. **Esta es la única vía de contratación que usa RRHH.**

### 2. ~~Kanban de Candidatos~~ — ELIMINADO POR COMPLETO (2026-09-17)
Hasta el 2026-09-17 existió aquí un tablero Kanban en BD (`/rrhh/kanban`, `/rrhh/candidates`, modelos `Candidate`/`KanbanColumn`/`CandidateHistory`), independiente del sync de Drive. **Nunca fue el mecanismo real de contratación** (ver punto 1) y, según confirmó el usuario, tampoco estaba enlazado desde ningún menú ni se usaba en la práctica — en la base de datos local solo había una fila de prueba. A pedido explícito del usuario ("no existe tal cosa como kanban en la parte de reclutamiento... bórralo") se eliminó por completo: modelos de Prisma, servicios (`candidate.service.ts`, `kanban.service.ts`), DTOs, endpoints, páginas (`RecruitmentKanban.tsx`, `CandidatesList.tsx`, `CandidateForm.tsx`) y rutas. El único mecanismo real que dependía de él — crear automáticamente un caso `ENTRADA` en Movimientos de Personal al contratar — ya se había migrado antes (2026-09-16) a `DriveService.contratarCandidato()`, ver [movimientos-personal.md](movimientos-personal.md). Si en el futuro se quiere un tablero de reclutamiento, se construye de cero — no queda nada de este código para reactivar.

**Otras 5 dependencias vivas que se encontraron y se desengancharon al eliminarlo** (todas ya eran datos vacíos/inertes en la práctica, así que no cambió nada visible):
- `custodias.service.ts::getAvailableCustodios()` — el "estado" de cada custodio (columna del Kanban) siempre caía a `'Inscrito'`; ahora es un valor fijo `'Inscrito'` sin consultar nada.
- `personal.service.ts::getDashboard()` — el KPI "guardias sin asignación" ya no une candidatos del Kanban con puesto "custodio".
- `contract.service.ts::buildAutoFillValues()` — el autocompletado de NOMBRE/PUESTO/SALARIO al generar un contrato ya no tiene un respaldo secundario en `Candidate`; si `GuardiaFichaPersonal` no tiene el dato, el campo queda vacío para llenarlo a mano (igual que antes, cuando ese respaldo casi nunca tenía datos reales).
- `drive.service.ts::getCompliance()` — el tipo de documento "Contrato" era condicionalmente no-obligatorio según una columna del Kanban que siempre estaba vacía; se preservó ese mismo resultado (siempre no-obligatorio) de forma fija, con una nota en el código para quien quiera revisar esta regla de negocio a futuro.
- `drive.service.ts::syncFichaPersonal()` — `Datos_Personales.json` ya no mezcla datos de `Candidate` como respaldo; usa solo `GuardiaFichaPersonal` + el nombre de la carpeta.
- `cedula-merge.service.ts` — se quitó `'candidate'` de la lista de tablas que chequea la fusión de cédulas duplicadas.

### 3. Documentación — generador de documentos (`/rrhh/contracts`) — 2026-09-10
Hasta el 2026-09-10 era un stub: `ContractTemplate`/`Contract` solo guardaban un registro en `DRAFT`, sin generar ningún documento real. Ahora replica el pipeline ya probado en `ventas-contratos.service.ts`/`ventas-templates.service.ts` (extraído a un helper compartido, `backend/src/common/docx-templating/docx-merge.util.ts`, sin nada de BoldSign): plantilla `.docx` pegada por link de Drive → detectar variables **formato `[VARIABLE]` únicamente** (no `<<VARIABLE>>`, se sacó ese formato a propósito para no confundir a quien arma la plantilla) → mapear cada una a un dato conocido del guardia (`ContractField.systemField`) o dejarla manual → generar PDF.

- Página renombrada de cara al usuario a **"Documentación"** (`ContractsList.tsx`, título visible; el path interno sigue siendo `/rrhh/contracts` — mismo criterio que el rename Personal→RRHH del punto 0: no tocar rutas/nombres internos solo por el nombre visible). Desde ahí: "+ Nueva plantilla" (`ContractTemplateConfig.tsx`) y "+ Generar Documento" (`GenerarDocumento.tsx`, página propia — **no vive en Listado de Guardias**, deliberado: elegir guardia + tipo de documento es el punto de entrada de Documentación, no una acción rápida de fila).
- `ContractTemplate.type` es **texto libre**, no un enum — el usuario puede escribir cualquier tipo de documento, no solo los 3 originales. `GET /personal/contracts/templates/types` devuelve los tipos ya usados por la empresa para ofrecerlos en un select con opción "+ Agregar nuevo tipo...".
- **Alcance actual: solo Guardias.** Extender esto a todo tipo de empleado queda pendiente para después.
- `Contract` no tiene FK — se identifica por `cedula`/`nombreGuardia` (mismo patrón que `AsignacionGuardia`/`GuardiaFichaPersonal`).
- Los datos que se autocompletan (nombre, cédula, puesto, entidad asignada, horario, salario, fecha, empresa) salen de `AsignacionGuardia`/`Entidad` + `GuardiaFichaPersonal` — ver `ContractService.buildAutoFillValues`. **Horario, puesto formal y salario acordado son campos nuevos en `GuardiaFichaPersonal`** (no en `AsignacionGuardia`, que es un historial de solo lectura generado por el sync de Drive — ver comentario en el modelo), editables desde `GuardiaFichaModal.tsx` en Listado de Guardias. (Hasta 2026-09-17 había un respaldo secundario en `Candidate`/Kanban, eliminado junto con ese sistema — ver punto 2; si falta el dato en la ficha, el campo queda vacío para llenarlo a mano.)
- Firma: **física** (se genera el PDF, se imprime y se firma a mano) — no hay firma electrónica (SignWell ni ningún otro proveedor) en este alcance.
- PDFs y `.docx` se guardan en disco local (`uploads/hr-templates`, `uploads/hr-contracts`), que en Cloud Run es **efímero**: el contenedor se apaga al quedar inactivo (`--min-instances=0`) y vuelve a arrancar con el disco vacío, y varias instancias no comparten filesystem. **Desde el 2026-09-22 eso ya no rompe el flujo** (ver punto 14): esos directorios se tratan como caché, no como almacén — la plantilla `.docx` se vuelve a bajar de Drive sola (`ensureDocxLocal`) y el PDF ya generado se rehace a partir de la plantilla + los `fieldValues` guardados en BD (`ensureContractFile`). Ventas conserva la limitación original, no se tocó.
- **Modo manual (2026-09-22):** "Generar Documento" tiene dos modos — elegir un guardia del padrón (autocompleta su ficha) o **"Llenar a mano"**, para documentos dirigidos a alguien que no está en el listado de guardias (un tercero, o un guardia que todavía no tiene ficha). En modo manual la **cédula deja de ser obligatoria**; lo único imprescindible es el nombre, que es como aparece el documento en Documentos Generados y también da nombre al PDF. `GenerateContractDto.cedula` pasó a `@IsOptional()`.

### 4. ~~Certificaciones y Alertas de Vencimiento~~ — ELIMINADO POR COMPLETO (2026-09-22)
Existieron `Certification` + `CertificationAlert` con su servicio, DTOs y endpoints `/personal/certifications`. **Nunca tuvieron página en el frontend**: el KPI que los contaba en el dashboard de RRHH tampoco se llegó a mostrar, y el único consumidor real de "vencimientos" terminó siendo `RequisitoDocumento` del módulo de Entidades (punto 7 / Backlog punto 3), que cubre lo mismo con más contexto (por entidad, no solo por empleado).

A pedido explícito del usuario ("limpia lo de certificaciones, que no quede rastro") se eliminó todo el 2026-09-22, **incluida la tabla** — el usuario confirmó explícitamente que quería la migración destructiva de una sola vez, no dejarla huérfana:
- Backend: `certification.service.ts`, `dto/certification.dto.ts`, los 4 endpoints, el provider en `personal.module.ts`.
- `personal.service.ts::getDashboard()` — se quitaron los KPIs `activeCertifications` y `alertCount` (ningún componente del frontend los leía).
- `personal-alerts.service.ts` — `GET /personal/alerts` ahora devuelve **solo** capacitaciones (`trainingsVencidas`, `trainingsPorVencer`); ya no incluye `certifications`.
- `cedula-merge.service.ts` — se quitó `'certification'` de las tablas que recorre la fusión de cédulas.
- Frontend: los 4 wrappers de `personal.service.ts`, la etiqueta en `CedulaMergeModal.tsx` y la mención en la descripción de la sección RRHH de `SuperAdminPermissions.tsx`.
- Prisma: migración `20260922_drop_certification` (`DROP TABLE CertificationAlert` + `Certification`, en ese orden por la FK).

No queda nada que reactivar. Si RRHH vuelve a necesitar certificaciones con vencimiento, el camino es `RequisitoDocumento`, no resucitar esto.

### 5. Bitácoras — ❌ RETIRADA de la navegación (2026-09-10)
Existían 4 plantillas (permiso de ingreso, respuesta a administrador de contrato, novedad operativa, salida de personal) en `/rrhh/logs` (`LogEntries.tsx`). A pedido del usuario ("no sirve más") se quitó el link del Sidebar y del Dashboard de RRHH — el backend (`log.service.ts`, `GET/POST /personal/logs/templates`, `GET/POST /personal/logs/entries`) y los datos ya guardados **siguen intactos**, no se borró nada, solo dejó de ser alcanzable desde la UI. No reintroducir el link sin que el usuario lo pida.

### 6. Movimientos de Personal — entrada/salida de guardias — 2026-09-09, pantalla fusionada a Historial el 2026-09-10
Reemplaza al viejo submódulo de "Verificación" (`VerificationCheck`/`VerificacionPage`, huérfano de nav) por un sistema organizado por **caso** en vez de log plano. Documentado en detalle en [movimientos-personal.md](movimientos-personal.md) — resumen aquí, no se duplica todo. El scraping automatizado sigue descartado (spike en `backend/scraping-poc/`: WAF + captcha en SICOSEP, login de empleador en SUT) — la acción en el portal la hace una persona, el sistema solo guarda la traza.

- **Es un registro, no un formulario de alta** (decisión explícita del usuario 2026-09-09): no existe "crear entrada manual" en ningún lado de la UI ni endpoint `POST /movimientos/entrada`. Si alguien necesita entrar, se hace desde Reclutamiento (kanban) o subiendo su documentación a la carpeta de Drive de Guardias; si alguien necesita salir, desde el botón de salida en `GuardiasList.tsx` o borrando su carpeta de Drive — Movimientos de Personal solo refleja lo que ya pasó por esos caminos.
- **Catálogo configurable** `SistemaVerificacion` (`nombre`, `urlPortal?`, `activo`, `orden`, por `companyId`) — IsyPlus, IESS, SUT, SICOSEP ya sembrados para `companyId=1` (GEMESEG). No es una página propia — vive como modal (`ConfiguracionSistemasModal.tsx`, botón "⚙ Configurar sistemas") dentro de la pantalla que lista movimientos. Título visible: "Configuración de Sistemas de Ingreso/Salida".
- **Caso/expediente** `MovimientoPersonal` (`tipo`: ENTRADA/SALIDA, `estado`: EN_PROCESO/COMPLETADO, `cedula`, `nombreGuardia`, `origen`, `candidateId?`) + `MovimientoPersonalItem` (uno por sistema, snapshot de `nombreSistema` al crear el caso, `completado`/`notas`/`completadoPor`/`completadoAt`). Cuando todos los items de un caso quedan completados, el caso pasa solo a COMPLETADO (y viceversa si se desmarca uno).
- **Entrada**: única vía es automática — al contratar a alguien desde Reclutamiento (`DriveService.contratarCandidato()`, botón "Marcar como Contratado", ver punto 1), se crea automáticamente su caso de ENTRADA (idempotente: no duplica si ya hay uno abierto para esa cédula). Si la cédula ya tenía un caso de SALIDA completado (guardia que se fue y vuelve a postular), esto se permite igual — no se bloquea la recontratación. Hasta 2026-09-16 esto lo disparaba `KanbanColumn.triggersHire` al mover un candidato en el Kanban de Candidatos (eliminado por completo el 2026-09-17, ver punto 2 de este documento y [movimientos-personal.md](movimientos-personal.md)).
- **Salida**: ícono (`LogOut`) por fila en `GuardiasList.tsx` (`/rrhh/guardias`) — sin formulario, doble validación con `ConfirmDialog` (`frontend/src/components/common/ConfirmDialog.tsx`, modal propio — hasta 2026-09-17 usaba `window.confirm`, ver nota de "Recontratación" abajo), usa la cédula/nombre que ya trae la fila; idempotente igual que la entrada (no duplica si ya hay una salida abierta para esa cédula). Una vez que la salida queda `COMPLETADO`, `MovimientoDetalleModal.tsx` habilita un botón **"Archivar carpeta"** que mueve (no borra) la carpeta de Drive del guardia a una ubicación de archivo configurable (nuevo `FolderConfig.type='GUARDIAS_ARCHIVO'`, ver `DriveService.archivarCarpetaGuardia`) — acción manual, nunca automática.
- **Recontratación de un guardia que ya salió (fix 2026-09-17):** `DriveService.contratarCandidato()` rechazaba SIEMPRE que ya existiera una fila `EmployeeDriveFolder` con la misma cédula ("Ya existe un guardia con la cédula X"), sin importar si ese guardia seguía activo o ya se había dado de baja — `EmployeeDriveFolder` nunca se borra al salir (ancla por `@@unique([companyId, cedula])`, se actualiza sola en el próximo "Sincronizar Drive"), así que esto bloqueaba **para siempre** cualquier recontratación legítima de alguien que ya trabajó y volvió a postular. Encontrado probando el Flujo 1 de la checklist de abajo con un guardia de prueba que ya había pasado por salida. Fix: antes de bloquear, se consulta `MovimientoPersonalService.isActivo(companyId, cedula)` — si el guardia **no** está activo (su último movimiento es `SALIDA`/`COMPLETADO`), se permite continuar con la contratación (crea un caso `ENTRADA` nuevo, no reabre el de `SALIDA`); si sigue activo, se mantiene el bloqueo. El mensaje de error para el caso bloqueado ya **no** menciona "Fusionar cédulas duplicadas" (ese flujo es para dos cédulas *distintas* que resultan ser la misma persona — no aplica a una colisión de la *misma* cédula); ahora solo indica revisar Listado de Guardias.
- **Fusión con Asignaciones (2026-09-10):** `MovimientosList.tsx` (`/rrhh/movimientos`) y `AsignacionesGuardias.tsx` (`/rrhh/asignaciones`) contaban la misma historia del guardia desde dos ángulos separados (entradas/salidas vs. asignación a entidades). Se reemplazaron ambas por una sola pantalla, **`HistorialGuardia.tsx`** (`/rrhh/historial`, "Historial"), que combina la línea de tiempo de `AsignacionGuardia` con los casos de `MovimientoPersonal` por guardia. Las rutas viejas (`/rrhh/movimientos`, `/rrhh/asignaciones`) redirigen a `/rrhh/historial` (`<Navigate>` en `App.tsx`) para no romper enlaces guardados; el Sidebar solo muestra la entrada nueva. Se conservó de `AsignacionesGuardias.tsx` el botón de eliminar una asignación mal generada por el sync (válvula de seguridad), y de `MovimientosList.tsx` el acceso a `ConfiguracionSistemasModal.tsx` y `MovimientoDetalleModal.tsx`.
- Migración `20260909_replace_verificacion_with_movimientos` migra cualquier dato existente de `VerificationCheck` a un caso histórico ENTRADA por `(companyId, cedula)` antes de eliminar la tabla vieja.

### 7. Cumplimiento documental — Entidades/Guardias (Drive como fuente de la verdad) + Personal Administrativo
Rediseñado por completo el 2026-09-09 (ver Backlog punto 3 más abajo para el detalle). Reemplaza al viejo diseño de "Custodios" con catálogo manual de asignaciones — **`CompliancePanel.tsx` y su ruta `/rrhh/compliance` ya no existen**, no reintroducirlos.

- **`GuardiasList.tsx`** (`/rrhh/guardias`, "Listado de Guardias"): punto central de configuración y sincronización de este submódulo, no solo un listado de lectura.
  - Sigue llamando a `getAvailableCustodios()` (módulo Custodias) para la lista base de guardias — deliberado, ver nota de `folderType='CUSTODIAS'` abajo.
  - Botón **"Configurar Drive"**: modal que explica la estructura de carpetas esperada y guarda `FolderConfig.type='CUMPLIMIENTO'` (mismo `type` que usaba el viejo diseño — ver ⚠️ en la tabla de abajo), además del `type='GUARDIAS_ARCHIVO'` para la carpeta de archivo del punto 6.
  - Botón **"Sincronizar Drive"** → `POST /personal/drive/sync-entidades` (`DriveService.syncEntidadesFolder`) — ver Backlog punto 3 para el algoritmo completo. El formato actual de carpeta de guardia es **"Apellidos - Nombres"** (la cédula se lee de `candidato.json` / `datos.json`); las carpetas viejas `"… - Cédula"` de 10 dígitos siguen funcionando. Una carpeta nueva sin cédula en el nombre ni en el JSON queda en `guardiasNoReconocidos` (ver punto 11). Desde 2026-09-10 reconoce un tercer bucket de primer nivel, **"Sin Asignar"** (junto a Público/Privado): guardias directamente ahí se sincronizan igual (identidad, documentos, ficha personal) pero sin abrir ninguna `AsignacionGuardia` — es donde caen los recién contratados desde Reclutamiento (ver punto 1 y Sprint 6 de [reclutamiento.md](reclutamiento.md)).
  - Botón **"Configurar campos"**: abre `PersonalFieldsConfigModal.tsx` (ver punto 7-bis abajo) para los campos personalizados de la ficha de guardia.
  - Guardias cuyo último `MovimientoPersonal` es una `SALIDA` con `estado='COMPLETADO'` (ver punto 6) se **ocultan por defecto** de la tabla y de los KPIs — botón discreto "Mostrar fuera (N)" para verlos igual, atenuados con etiqueta "Fuera". `GET /personal/movimientos/guardias-fuera` calcula esto mirando solo el movimiento más reciente por cédula. Desde 2026-09-23, en esas filas hay una **X** (`DELETE /personal/drive/guardia/:cedula/lista`, con confirmación): quita el registro de la lista y manda la carpeta a la **papelera del dueño** en Drive (no la borra para siempre; se restaura desde esa papelera). Si la carpeta la creó `drive-sync`, primero se le transfiere la propiedad a la persona dueña de la carpeta padre y después se manda a su papelera, impersonando a esa persona (hace falta delegación de dominio del scope Drive; si Google responde `unauthorized_client`, no se quita de la lista). En una unidad compartida va a la papelera de esa unidad. Solo si ya está fuera. El historial de movimientos se conserva. Un `no-mostrar-en-lista.txt` dejado por la versión anterior (que no tocaba Drive) sigue impidiendo que el sync recree a esa persona.
- **`EntidadesList.tsx`** (`/rrhh/entidades`, "Entidades y Requisitos"): catálogo de `Entidad` + `RequisitoDocumento` en 3 capas (Global/Pública/Privada/Específica), editable a mano. Las entidades también se crean solas al sincronizar Drive (ver Backlog punto 3) — este catálogo nunca se borra por un accidente de Drive. **El campo "Tipo" (Pública/Privada) es editable a mano desde 2026-09-10** (ya no tiene candado): si el tipo guardado no coincide con el de la carpeta de Drive, el sync sigue solo avisando (`entidadesTipoDistinto`), nunca lo sobreescribe — el aviso ahora indica explícitamente que se puede corregir desde aquí. Desde aquí, un ADMIN también puede abrir **`CedulaMergeModal.tsx`** ("Fusionar cédulas duplicadas") para fusionar dos cédulas *distintas* que resultaron ser la misma persona (típicamente un typo al parsear "Nombre - Cédula" de Drive) — **no aplica** a que la misma cédula ya exista y esté activa, ese es un caso distinto (ver "Recontratación" en el punto 6). Muestra una vista previa (carpeta de Drive, historial y contratos que se moverían) antes de confirmar, y deja traza en `CedulaMergeLog`. **Gating deliberado por `role === 'ADMIN'`** (`isAdmin` en `EntidadesList.tsx`), no por `canWrite('RRHH')` como el resto de los botones de este módulo — el backend (`cedula-merge.controller.ts`) lo restringe así a propósito ("mueve/borra datos de producción de forma irreversible... mismo nivel que `deleteDriveEmployee`"). Un usuario RRHH con rol `EMPLOYEE` (el caso típico, ver punto de Reglas más abajo) **no verá este botón aunque tenga acceso de escritura a RRHH** — no es un bug, es la razón más común por la que "no se encuentra" esta función.
- **`HistorialGuardia.tsx`** (`/rrhh/historial`, "Historial"): ver punto 6 — reemplaza a `AsignacionesGuardias.tsx`/`MovimientosList.tsx`.
- **`CumplimientoEntidades.tsx`** (`/rrhh/cumplimiento`, "Cumplimiento"): tabla semáforo (🟢 al día / 🟡 por vencer / 🔴 faltante o vencido) con búsqueda y filtros por entidad/estado. Clic en un guardia abre `GuardiaComplianceModal.tsx` con el checklist completo, ficha personal editable y envío manual de recordatorio.
- **`AdministrativeStaff.tsx`** (`/rrhh/administrativo`, "Personal Administrativo"): mecanismo de checklist independiente, para personal de oficina. Desde 2026-09-08 tiene **carpeta y botón de configuración propios** (`FolderConfig.type='PERSONAL_ADMIN'`) — no comparte raíz ni lógica con Entidades/Guardias. Ver Backlog punto 2.
- Modelos de checklist compartidos con Personal Administrativo: `EmployeeDriveFolder`, `DocumentType`, `EmployeeDocument`, `DocumentReview` + `DocumentReviewHistory`.
- Modelos propios de Entidades/Guardias: `Entidad`, `RequisitoDocumento`, `AsignacionGuardia` (historial de solo lectura), `GuardiaContacto` (correo para recordatorios), `GuardiaFichaPersonal` (ficha editable — teléfono, dirección, fecha de nacimiento, contacto de emergencia, `activo` calculado, `camposPersonalizados` JSON), `AlertaVencimiento` (bookkeeping de envíos). Ver Backlog punto 3 para el detalle de cada uno.

### 7-bis. Campos personalizados de la ficha de guardia (`PersonalFieldDefinition`) — 2026-09-10
A pedido del usuario, la ficha de cada guardia admite campos extra sin tocar código. Es **configuración general de la empresa**, no algo que se define por guardia:
- **`PersonalFieldsConfigModal.tsx`**, abierto desde el botón "Configurar campos" en `GuardiasList.tsx` (`scope='GUARDIA'`) — cualquier usuario con acceso de escritura a RRHH puede crear/renombrar/borrar un campo, agrupados visualmente por **categoría**: "Datos personales" o "Datos laborales" (`PersonalFieldDefinition.category`, enum `PERSONAL`/`LABORAL`).
- El valor de cada campo por guardia se guarda en `GuardiaFichaPersonal.camposPersonalizados` (JSON), no en una tabla nueva por campo.
- En `GuardiaFichaModal.tsx`, los campos dinámicos se renderizan **dentro** de las secciones existentes "Datos personales"/"Datos laborales" (filtrados por `category`) — no hay un bloque aparte de "Otros datos".
- `PersonalFieldDefinition` tiene `scope` (`GUARDIA` | `PERSONAL_ADMIN`) para poder reusarse en Personal Administrativo sin mezclar catálogos.
- **`DriveConfig.tsx`** (`/rrhh/drive-config`) y **`DocumentTypeConfig.tsx`** (`/rrhh/document-types`) siguen existiendo como rutas pero **están huérfanas: ningún link/botón de la UI navega a ellas** (verificado 2026-09-09, ni el Sidebar ni ninguna página las referencian). Es deuda de una época anterior a que cada submódulo tuviera su propio modal de configuración inline — no borrarlas sin confirmar con el usuario que de verdad no se usan, pero tampoco asumir que son parte de ningún flujo activo.

### 8. Capacitaciones (`/rrhh/capacitaciones`) — 2026-09-15
Cumplimiento **general, no por guardia**: una capacitación se marca completada una sola vez para todo el grupo (`Training.completed`/`completedAt`/`completedBy`), no hay seguimiento de qué guardia individual asistió — decisión explícita del usuario tras una primera versión que sí llevaba registro por guardia (`TrainingCompletion`, eliminada).
- **Tipo** (`Training.type`): catálogo fijo del frontend (`TRAINING_TYPES` en `personal.service.ts`: Inducción, Seguridad física, Primeros auxilios, Uso de armas, Manejo defensivo, Legal, Otro) — no es un enum de Prisma, es un `String` simple, para poder agregar categorías sin migración; "Otro" revela un campo de texto libre.
- **Adjuntos múltiples e ilimitados** (`TrainingAttachment`, `kind`: `DOCUMENTO` o `EVIDENCIA`): tanto el documento del plan/temario como la evidencia de cumplimiento admiten varios archivos y enlaces a la vez, cada uno agregado/quitado individualmente (`POST/DELETE /personal/trainings/:id/attachments`).
- **Requiere carpeta de Drive de Capacitaciones** (`HARDCODED_DRIVE_FOLDERS.CAPACITACIONES` desde 2026-09-21, ver punto 12) — ya no hay tuerca de configuración. El listado tiene **"Ver carpeta"** que abre Drive. Si el ID en código está vacío, `getConfig` lee en solo lectura la última fila `FolderConfig` (ya no se puede guardar). Sin ningún ID, se puede igual dar de alta la capacitación, la fecha y un enlace; **subir un archivo** sí se rechaza.
- **Cada capacitación tiene su propia carpeta (2026-09-23).** Al guardar, si hay carpeta raíz: una puntual se crea directo en Capacitaciones (`<raíz>/<Nombre>`); una del plan anual se crea dentro de `<raíz>/Anual/<Nombre>`. Si "Anual" no existe, se crea sola, sin preguntar y sin error. Si la carpeta de la capacitación ya existe (mismo nombre, sin importar mayúsculas), la API responde **409** `code: 'CARPETA_EXISTE'` y la pantalla pregunta: **Agregar a esa carpeta** (los documentos van ahí; si esta capacitación ya tenía otra carpeta, sus archivos se mueven) o **Cambiar nombre** (la capacitación pasa a llamarse igual que la carpeta nueva). `Training.driveFolderId` guarda el id. Los archivos se suben a esa carpeta, no sueltos en la raíz. Al crear, el archivo se queda en el navegador hasta pulsar Crear (así el nombre y si es anual ya están definidos); al editar o al registrar cumplimiento, se sube en el momento a la carpeta de esa capacitación. `POST /personal/trainings/upload` acepta `trainingId` (y `folderAction`/`folderName` si hubo 409).
- **Subida de archivos va directo a Drive real**, nunca a disco local — `DriveService.uploadFile(folderId, buffer, fileName, mimeType)`. `POST /personal/trainings/upload` devuelve `{ url: "https://drive.google.com/file/d/<id>/view" }`, guardado tal cual en `TrainingAttachment.url`. No existe ya el viejo `TrainingFileController` que servía archivos desde `uploads/hr-training-evidence/` en disco — se eliminó junto con ese enfoque.
- Botón de completar renombrado explícitamente a pedido del usuario: **"Registrar cumplimiento"** (no "Marcar completada") abre un modal donde se puede adjuntar evidencia antes de confirmar; una vez completada, el botón pasa a **"Revertir cumplimiento"** (con confirmación). El modal de edición muestra la sección "Evidencia de cumplimiento" tanto si la capacitación ya está completada como si ya tiene evidencia cargada (para no perder acceso a ella si se revierte el estado).
- `PersonalAlertsService.getAlerts` (`GET /personal/alerts`) considera una capacitación "pendiente" si tiene `dueDate` dentro de los próximos 30 días (o ya vencida) y `completed=false` — sin cron, se calcula al pedirlo, consumido por un widget en `PersonalDashboard.tsx`.

### 9. Buzón de Quejas y Sugerencias (`/rrhh/quejas` enviar, `/rrhh/quejas/gestion` gestionar) — 2026-09-15
Deliberadamente **dos pantallas separadas**, no una sola mezclando envío y gestión (la primera versión las mezclaba y se corrigió a pedido del usuario):
- **`ComplaintsPage.tsx`** (`/rrhh/quejas`): solo el formulario de envío. Accesible a **cualquier empleado autenticado**, sin exigir el permiso de sección `RRHH` (entrada de nivel superior en el Sidebar, no dentro del submenú de RRHH) — cualquiera puede tener algo que reportar, tenga o no acceso al módulo. Sin sección de "mis quejas enviadas": mezclar un historial personal con la opción de anonimato no tiene sentido (decisión explícita del usuario).
- **`ComplaintsManagementPage.tsx`** (`/rrhh/quejas/gestion`, dentro del submódulo RRHH, gateada por sección): **tablero Kanban arrastrable** con las 5 etapas fijas del proceso (`ComplaintStatus`: `RECIBIDA → EN_SENSIBILIZACION → EN_COMUNICACION → EN_SOLUCION → CERRADA`) — drag-and-drop HTML5 nativo (sin librería), no relacionado con el Kanban de Candidatos del punto 2 (eliminado). Click en una tarjeta abre el detalle con el historial completo de cambios de etapa (`ComplaintStageChange`, con nota opcional en cada transición).
- **Anonimato real**: si `isAnonymous=true`, `Complaint.submittedBy` queda `null` — no se guarda el autor ni siquiera de forma oculta (verificado en pruebas: una queja anónima no aparece ligada a ningún usuario en ningún endpoint, ni siquiera para RRHH).
- **Campos configurables por RRHH** (`ComplaintFieldDefinition`: `label`, `type` `TEXT`/`NUMBER`/`DATE`, `required`): la descripción y el checkbox de anónimo son siempre fijos; RRHH puede agregar campos extra (ej. Departamento, Cargo) desde "Configurar campos del formulario" en `ComplaintsManagementPage.tsx`, marcando cada uno obligatorio u opcional — mismo patrón que `PersonalFieldDefinition` (String simple, no enum). Las respuestas se guardan en `Complaint.customFieldValues` (JSON, keyed por el id del campo).
- No existe `GET /personal/complaints/mine` (se eliminó tras quitar la sección de "mis quejas") — evitar reintroducirlo sin que alguien lo vaya a consumir de verdad.

### 10. Encuestas (`/rrhh/encuestas` responder, `/rrhh/encuestas/gestion` gestionar) — 2026-09-15
Tipo "Google Forms": RRHH define preguntas dinámicas, elige a qué usuarios de la empresa enviarla, y ve un resumen de resultados agregados.
- **Se crea y se publica en un solo paso** — no hay un estado de borrador editable por separado, para no complicar el flujo de esta primera versión (`Survey.status` empieza directo en `PUBLISHED`).
- **Dos canales, combinables en la misma encuesta (enlace público añadido el 2026-09-22):**
  - *Destinatarios de la app* (`SurveyRecipient.userId` → `User`): la reciben en "Mis Encuestas", responden una sola vez y quedan identificados.
  - *Enlace público* (`Survey.publicEnabled` + `Survey.publicToken`): una URL `/encuesta/<token>` que **cualquiera abre sin cuenta ni login**, desde el computador o el celular. Pedido explícito del usuario para llegar a externos (proveedores, clientes, postulantes) que nunca van a tener usuario en la app.
  - Al crear la encuesta debe quedar activo **al menos uno** de los dos, si no no le llegaría a nadie — lo valida `SurveyService.create`, no el DTO (`recipientUserIds` pasó a opcional).
- **Quién responde por el enlace público:** decisión explícita del usuario — **no se pide nada fijo**. Si RRHH quiere nombre, correo o cédula, los agrega como preguntas normales de la encuesta. Por eso `SurveyResponse.respondentId` pasó a **opcional**: `null` = respuesta llegada por el enlace. En Postgres un `UNIQUE` con `NULL` no colisiona, así que el `@@unique([surveyId, respondentId])` sigue impidiendo que un usuario con cuenta responda dos veces, y a la vez admite tantas respuestas públicas como personas abran el enlace.
- **Seguridad del enlace:** el token (24 bytes aleatorios en hex) **es la única credencial**. `PublicSurveyController` va sin `AuthGuard` ni `SectionPermissionGuard` a propósito, y el service devuelve únicamente título, descripción y preguntas — nunca destinatarios, respuestas de otros ni nada de la empresa. La búsqueda es por `(publicToken, publicEnabled)`, así que adivinar un `id` no sirve: una encuesta sin enlace activo no se puede leer ni responder por esa vía. Desactivar el enlace **conserva** el token, para que reactivarlo no invalide una URL ya repartida.
- **Nunca llega a guardias por la vía interna**, que no tienen login propio — pero desde el enlace público sí se les puede hacer llegar una encuesta sin darles cuenta.
- **Tipos de pregunta** (`SurveyQuestionType`, enum real de Prisma — a diferencia de `PersonalFieldDefinition`/`ComplaintFieldDefinition`, aquí sí se usó un enum porque es un conjunto cerrado que no necesita ampliarse por RRHH): `SHORT_TEXT`, `LONG_TEXT`, `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `RATING` (escala 1-5).
- **Respuestas identificadas** (`SurveyResponse.respondentId`, único por `(surveyId, respondentId)` — no se puede responder dos veces), a pedido explícito del usuario, para que RRHH pueda saber quién falta por responder.
- **Notificación**: sin sistema de notificaciones completo (fuera de alcance) — un aviso "Encuestas pendientes" dentro de la app (`PendingSurveysBanner.tsx`, en el Dashboard general de toda la empresa, no solo RRHH) usando `GET /personal/surveys/pending/mine`.
- **Resultados agregados** (`GET /personal/surveys/:id/results`): conteos por opción para preguntas de elección, promedio + distribución para escala, lista de respuestas para texto libre — junto con tasa de respuesta (`totalResponses`/`totalRecipients`).
- No se puede eliminar una encuesta que ya tiene respuestas (se debe "Cerrar" en su lugar) — mismo criterio de protección que otros módulos con historial (ej. `ContractTemplate` con contratos generados). Desde 2026-09-23 una cerrada se puede **volver a abrir** (`PATCH /personal/surveys/:id/reopen`): pasa otra vez a `PUBLISHED`, no se borran las respuestas, quien ya respondió sigue sin poder repetir, y el enlace público —si seguía activo— vuelve a aceptar respuestas. Es para el cierre por error.

### 11. Formato de carpetas de Guardias y Entidades — 2026-09-21
Pedido explícito del usuario al ver el Listado de Guardias y el Drive real:

- **Guardias:** el formato pasó a "Apellidos - Nombres". La cédula **no** va en el nombre de la carpeta: se lee de `candidato.json` o `datos.json` (10 dígitos). ⚠️ **Superado el 2026-09-22 por el punto 13**, que quitó también el guion: el formato vigente es `Apellidos Nombres`. Lo que sigue valiendo de aquí: las carpetas viejas se siguen parseando (no hay que renombrar nada), contratar no exige cédula en el nombre, y una carpeta nueva sin cédula ni en el nombre ni en el JSON sigue yendo a `guardiasNoReconocidos` (no se inventa identidad).
- **Entidades:** el formato recomendado sigue siendo "Provincia - Nombre", pero el parser **deja de exigir el espacio exacto alrededor del guion**. `GUAYAS- ZUMOCACAO`, `Guayas-Zumocacao` y `Guayas - Zumocacao` cuentan como válidos (provincia sin tildes/mayúsculas). **No se renombra la carpeta en Drive** y no se muestra aviso — el usuario no tiene que "arreglar" nada. Un nombre sin provincia reconocible (ej. `Banco Pichincha`) sigue marcándose como formato inválido, solo como aviso, igual que antes.
- ~~**Botón "Completar fichas con datos de postulación"** (antes "Rescatar datos de postulación")~~ — **ELIMINADO el 2026-09-22**. Era un backfill de una sola vez (`POST /personal/drive/backfill-postulacion`) para fichas contratadas antes de que el formulario de postulación se copiara solo a la Ficha Personal. Se había relabeleado con un texto explicativo porque RRHH no entendía qué hacía, y aun así siguió sin entenderse ("Completar fichas sigo sin entenderla, borra ese botón"). Se quitaron el botón, su diálogo de confirmación, el wrapper del frontend, el endpoint y `DriveService.backfillPostulacion()`. El traspaso automático de datos de postulación al contratar (`POSTULACION_STASH_KEY`) sigue funcionando igual — era solo el rescate retroactivo lo que sobraba.

### 12. Carpetas de Drive fijas vs configurables — 2026-09-21
Pedido explícito: **nadie debe poder cambiar** las carpetas de Reclutamiento, Capacitaciones ni Contratos de ventas desde la app; solo Sistemas, en código (`backend/src/modules/personal/constants/hardcoded-drive-folders.ts`).

- **Fijas:** `RECLUTAMIENTO`, `CAPACITACIONES`, `VENTAS_CONTRATOS`, `RRHH_DOCUMENTOS` (documentos generados desde RRHH > Documentación, ver punto 16c — no confundir con `VENTAS_CONTRATOS`). `POST /personal/drive/config` las rechaza. `GET` responde el ID quemado (Reclutamiento coincide con el portal de postulación). En cada listado hay **"Ver carpeta"** (abre Drive); ya no hay tuerca de configuración. IDs vacíos de Capacitaciones/Contratos: se lee `FolderConfig` en solo lectura hasta completar el constante.
- **Siguen configurables** (tuerca, como hasta ahora): Listado de Guardias (`CUMPLIMIENTO`), archivo de guardias (`GUARDIAS_ARCHIVO`), Personal Administrativo (`PERSONAL_ADMIN`).

No compartir un mismo ID de Drive entre empresas en el frontend: el ID vive en el backend y `GET /personal/drive/config` lo entrega por `companyId` del usuario.

### 13. Estándar único de nombre de persona: "Apellidos Nombres" — 2026-09-22
Pedido explícito del usuario: *"para reclutamiento, listado de guardias, administrativos, todo siempre debe ser apellidos y nombres, sin cédula, sin puesto, sin nada, sin guion; así es como se debe guardar las carpetas, mostrar en listados y todo"*.

Hasta ahora cada submódulo nombraba sus carpetas distinto (`Apellidos - Nombres` en Guardias, `Apellidos Nombres - Cédula - Puesto` o `Nombre - Puesto` en Personal Administrativo), y los listados mostraban lo que cayera. Ahora hay **un solo formato en todas partes**:

```
APELLIDOS NOMBRES
```

sin guion, sin cédula y sin puesto. El estándar vive en un único lugar: `backend/src/modules/personal/utils/nombre-persona.util.ts` (`formatNombrePersona`, `normalizarNombrePersona`, `validarNombrePersona`, `advertenciaNombreCarpeta`).

- **La cédula y el puesto no se pierden**: viajan dentro de `candidato.json` / `datos.json`, en la misma carpeta. El sync los lee de ahí para resolver la identidad (la clave se compara sin importar mayúsculas, tildes ni espacios; "Número de Cédula" también cuenta). Se agregó `puesto` al JSON de Personal Administrativo (`syncFichaAdministrativo`), que antes no lo escribía porque vivía en el nombre de la carpeta.
- **Mayúsculas y minúsculas son el mismo formato (2026-09-23).** `ORDOÑEZ CHILAN ELIAN DALEMBERG` y `Ordoñez Chilan Elian Dalemberg` se sincronizan. Si el nombre ya es "Apellidos Nombres" y todavía no hay cédula en el JSON, **igual se crea el registro** (en la lista se ve "Sin cédula"). La fila necesita una clave interna `ID-<folderId>` porque la cédula es parte de la llave única, pero esa clave **no se muestra y no se escribe en el JSON**: el campo cédula queda vacío. Un sync anterior llegó a guardar los dígitos del id de Drive como si fueran la cédula; el siguiente sync los devuelve a la clave interna y el campo vuelve a quedar vacío. El aviso `guardiasNoReconocidos` queda solo para nombres que no son ese formato (tienen guion, o están vacíos). Cuando RRHH escribe la cédula real en la ficha (o aparece en el JSON), reemplaza la clave interna en la misma fila. Esto deja atrás la regla de 2026-09-09 de no crear nada sin cédula: el usuario pidió que esas carpetas en mayúsculas dejaran de salir en el aviso.
- **No se renombra NADA en Drive** — decisión explícita del usuario (*"no renombres nada, al sincronizar debe decir que el formato está mal, pero igual leerlas"*). Los parsers siguen aceptando los tres formatos viejos y la carpeta **sí se sincroniza**; lo único que cambia es que el sync agrega una advertencia informativa diciendo cuáles conviene renombrar a mano. Se descartó tanto el renombrado automático como un botón de renombrado en lote.
  - Guardias: nuevo `guardiasFormatoInvalido[]` en el resultado de `sync-entidades`, mostrado en `GuardiasList.tsx` junto a los avisos que ya había.
  - Personal Administrativo: la advertencia va en `errors[]` de `sync-personal-admin`.
- **Personal Administrativo identifica por la carpeta, no por la cédula (2026-09-23).** Una carpeta nueva cuyo nombre ya es "Apellidos Nombres" entra a la lista aunque todavía no tenga cédula ni `datos.json`: se guarda con clave interna `ID-<folderId>` y el sync **crea** `datos.json` solo con `nombreCompleto` (la cédula queda vacía hasta que exista). Si el nombre no es ese formato y no hay cédula, se avisa y no se registra. Cuando un sync posterior encuentra la cédula real, reemplaza la clave interna en la misma fila. Sigue anclada por `folderId`. El puesto que ya estaba en BD se conserva cuando el nombre nuevo ya no lo trae.
- **Contratar a un administrativo** ya no exige que la vacante tenga puesto (antes bloqueaba, porque el puesto formaba parte del nombre de la carpeta): el puesto se guarda en su ficha, que es lo que alimenta `datos.json`.
- **Formulario de postulación (Reclutamiento):**
  - Se eliminó el esquema alternativo "Nombre completo". Queda **un solo esquema**: `Apellidos` + `Nombres`, en ese orden (que es el orden en que se arma la carpeta). Son los dos únicos campos bloqueados (no se pueden quitar ni volver opcionales), porque sin ellos no hay con qué nombrar la carpeta.
  - **La cédula dejó de estar bloqueada**: a pedido del usuario es *"un campo como cualquier otro, como teléfono o email"*. Sigue siendo la llave que une postulación ↔ ficha ↔ cumplimiento ↔ nómina, pero ahora vive en el JSON, no en el nombre, así que quitarla de una vacante ya no rompe el nombrado de carpetas.
  - El campo por defecto **"Teléfono" se renombró a "Celular"** (pedido del usuario). El *tipo* de dato sigue llamándose "Teléfono".
- Los fallbacks que leen `nombre completo` / `nombreCompleto` de un `candidato.json` viejo **se conservaron**: sirven para postulaciones que se guardaron con un único campo de nombre.

### 14. Documentación no depende de la máquina donde corre — 2026-09-22
Pedido explícito: *"verifica los flujos que están en RRHH, que funcionen en otra máquina, que no dependan de NADA de lo que yo tengo instalado en mi computadora"*.

Lo que se revisó y su estado:

| Dependencia | Estado |
|---|---|
| LibreOffice headless (`soffice`, conversión .docx→PDF) | ✅ Ya venía instalado en `backend/Dockerfile` (`apk add libreoffice`), en PATH. No hace falta `LIBREOFFICE_PATH`. |
| Chromium/Puppeteer (PDFs de Custodias/RRHH) | ✅ Ya venía instalado en el Dockerfile. |
| Credenciales de Google Drive | ✅ Ya se resuelven por el secreto `GOOGLE_SERVICE_ACCOUNT_JSON` cuando el archivo no está en disco. |
| `uploads/hr-templates` y `uploads/hr-contracts` | ❌ **Era un problema real, corregido acá.** |

El disco de Cloud Run es efímero y no se comparte entre instancias, así que:
- La plantilla `.docx` que se bajaba de Drive una vez y quedaba cacheada desaparecía al reciclarse el contenedor, y "Generar documento" fallaba con *"El documento fuente no está disponible. Descárgalo de Drive primero."* — un error que solo veía quien no fuera la máquina/instancia que la bajó. Ahora `ContractService.ensureDocxLocal()` la vuelve a bajar sola desde `ContractTemplate.driveUrl` cuando la copia local no está, y actualiza `docxPath`. Lo usan `detectVariables` y `generateContract`.
- El PDF generado también desaparecía, rompiendo el enlace de Documentos Generados. `ContractService.ensureContractFile()` lo **regenera** a partir de la plantilla y los `fieldValues` que ya están guardados en el `Contract` — el resultado es idéntico, así que el enlace nunca se rompe. `ContractFileController.serveFile` pasó a `async` y lo usa en lugar de mirar el disco directamente.

Estos dos directorios quedan documentados en código como **caché, no almacén**. Ventas tiene la misma limitación y **no se tocó** en este cambio.

### 15. Correcciones de UX y el bucle de redirección del login — 2026-09-22 (segunda ronda)
Hallazgos al probar la app levantada en local, todos reportados por el usuario.

**a) "A una cuenta le sale el bienvenido y a otras no" — bucle de redirección.**
No era el saludo: esas cuentas **nunca llegaban a ninguna pantalla**. `SectionRoute`, al negar el acceso, redirigía *siempre* a `/dashboard`, pero `/dashboard` está envuelto en su propio `SectionRoute section="DASHBOARD"` — y DASHBOARD, aunque es `alwaysEnabled` a nivel de empresa, **se puede negar por usuario** con `UserPermission.canView = false`. Cuando eso pasaba: login → `/dashboard` → denegado → `/dashboard` → denegado → … pantalla en blanco, sin ningún mensaje. Reproducido con `sistemas@gemeseg.com`, que tiene justamente `DASHBOARD canView=false`.

Arreglo (`hooks/usePermissions.ts` + `App.tsx`):
- Nuevo `landingRoute` en `usePermissions`: la primera sección de `LANDING_ROUTES` que el usuario **de verdad** puede ver. Redirigir ahí siempre es seguro, porque por definición esa sección lo va a dejar pasar.
- `SectionRoute` redirige a `landingRoute` en vez de a `/dashboard` fijo.
- Si `landingRoute` es `null` (le negaron TODAS las secciones) se renderiza `SinSeccionesDisponibles`, un mensaje que le dice a la persona que pida acceso, en vez de redirigir a ningún lado.
- `/` dejó de ser un `<Navigate to="/dashboard">` fijo: ahora es `RootRedirect`, que usa la misma lógica. Y `LoginPage` navega a `/` en vez de a `/dashboard`, para pasar por ahí.

Al agregar una sección nueva conviene sumarla a `LANDING_ROUTES` si tiene sentido como primera pantalla.

**b) El tipo de un campo personalizado ya se puede cambiar.** Antes `UpdatePersonalFieldDefinitionDto` solo aceptaba `label`/`order`/`required`, así que un campo creado como Texto que debía ser Número obligaba a **borrarlo y recrearlo**, perdiendo los valores ya cargados. Ahora acepta `type`. Los valores guardados en `camposPersonalizados` **no se convierten ni se borran** — se reinterpretan con el tipo nuevo, y por eso el frontend avisa de eso en la confirmación.

**c) `PersonalFieldsConfigModal` y `DocumentosRequeridosModal`: edición explícita.** Antes cada cosa se guardaba sola al tocarla (marcar "requerido" disparaba un PATCH inmediato) y el único "guardar" era un ícono de check diminuto al renombrar. Ahora una fila entra en modo edición, se editan todos sus campos juntos, y se confirman con un botón **Guardar** + `ConfirmDialog` que resume exactamente qué va a cambiar. Los dos modales comparten el mismo patrón a propósito: viven uno dentro del otro como pestañas de Configuración de Personal Administrativo, y tenerlos distintos se veía desordenado.

**d) Ancho de los modales de configuración.** Nueva clase `.modal-xl` (760px) en `styles.css`, usada por `PersonalFieldsConfigModal` y `AdministrativeStaffConfigModal`: a 560px una fila con nombre + tipo + "requerido" + acciones se partía en varias líneas.

**e) `RowActionsMenu` (`components/common/RowActionsMenu.tsx`), nuevo.** Menú compacto de acciones secundarias de una fila, con cierre por clic afuera y por Escape. Nace de Gestión de Encuestas, que tras sumar el enlace público llegó a **cinco botones sueltos por fila** y dejó de leerse. Ahí ahora queda visible solo "Resultados" y el resto va en el menú. Reutilizable en cualquier tabla que acumule acciones.

**f) Eliminar vacante desde Reclutamiento.** El endpoint `DELETE /personal/reclutamiento/puestos/:id` existía desde antes pero **ninguna pantalla lo llamaba**. Ahora hay un botón junto al de editar, con confirmación que dice cuántos postulantes sincronizados hay dentro. El backend manda la carpeta a la papelera de Drive (recuperable), no la borra.

**g) `npm run start:dev` se quedaba sin memoria.** El script pasó a `node --max-old-space-size=6144 node_modules/@nestjs/cli/bin/nest.js start --watch`. El Dockerfile ya daba 4 GB en producción (`NODE_OPTIONS`), pero en local no había nada y la compilación moría con "JavaScript heap out of memory". Se usó `node` directo en vez de `cross-env` para no agregar una dependencia.

**h) Conteo de opciones en resultados de encuestas.** `getResults` leía la opción única **solo** de `valueText` e ignoraba `valueJson`. La UI propia manda `valueText`, así que nunca falló ahí — pero con el enlace público abierto, una respuesta con la otra forma se guardaba y **desaparecía de los conteos sin avisar**. Ahora se normaliza con `extraerOpciones()`, que acepta ambas formas para los dos tipos de pregunta. Con test de regresión.

### 16. Limpieza, Drive para documentos generados y reglas de layout — 2026-09-22 (tercera ronda)

**a) Bitácoras eliminadas por completo.** El área las descartó el 2026-09-10 y desde entonces eran código inalcanzable. Se retiraron `log.service.ts`, `dto/log.dto.ts`, los 6 endpoints `/personal/logs/*`, `LogEntries.tsx`, la ruta `/rrhh/logs`, los wrappers del frontend y los modelos `LogTemplate`/`LogEntry` + el enum `LogType`. Migración `20260922_drop_bitacoras` (**destructiva**, confirmada por el usuario). El punto 5 de este documento queda solo como historia.

**b) Pantallas huérfanas eliminadas.** `DriveConfig.tsx` (`/rrhh/drive-config`) y `DocumentTypeConfig.tsx` (`/rrhh/document-types`) se borraron con sus rutas: eran duplicados exactos de la tuerca ⚙ de cada listado y de la pestaña "Documentos requeridos". Ya no hay pantallas huérfanas en RRHH.

**c) Los documentos generados se guardan en Drive.** Nuevo tipo fijo `RRHH_DOCUMENTOS` en `hardcoded-drive-folders.ts` (`1LLnPLU7UFSFvIwi-FpMNyIQDkoZI-B8s`). Al generar, `ContractService` sube el PDF ahí con un nombre legible ("Persona - Tipo - Fecha.pdf") y guarda `Contract.driveFileId`/`driveUrl` (migración `20260922_contract_drive_copy`). Desde 2026-09-23, si se eligió un guardia del padrón, un aviso pregunta si el PDF va a esa carpeta general o a la carpeta de Drive de ese guardia (`guardarEn: 'general' | 'guardia'`). En **"Llenar a mano"** no hay aviso: siempre va a la carpeta general, aunque no haya cédula. Si el guardia no tiene carpeta vinculada, no se genera y se pide sincronizar el listado o usar la carpeta general.

Orden al servir el PDF (`ensureContractFile`): **disco → Drive → regenerar**. Drive va ANTES de regenerar a propósito: regenerar produce un documento *distinto* si la plantilla cambió después de emitirlo, y en un papel ya firmado eso no es aceptable. Regenerar queda solo como último recurso. Si la subida a Drive falla, la generación **no** se cae: el PDF ya está hecho y el fallo queda en el log.

⚠️ Esto es solo RRHH (Documentación de **Guardias**). Los contratos de **Ventas** son otro subsistema, con su propia carpeta (`VENTAS_CONTRATOS`) y firma electrónica — no se tocó ni debe mezclarse.

**d) Reglas de layout estable** (`styles.css`, sección `LAYOUT ESTABLE`). Motivo: escribir en un filtro hacía aparecer "Limpiar filtros", y ese botón empujaba "Exportar" a la línea de abajo; y en varias pantallas los botones de cabecera terminaban abajo a la izquierda al envolverse. Las cuatro reglas están escritas en el CSS. Herramientas nuevas:
- `.page-title-row` — reemplaza el `display:flex; justify-content:space-between; flex-wrap:wrap` suelto que estaba copiado en 15 pantallas. El bloque de texto encoge (`min-width:0`) y las acciones llevan `margin-left:auto`, así que **aunque bajen de línea siguen a la derecha**.
- `.filter-bar-fields` / `.filter-bar-actions` — filtros que encogen a la izquierda, acciones fijas a la derecha.
- `.filter-select` — ancho máximo, para que una entidad de nombre largo no ensanche el select.
- `.icon-btn` — botón cuadrado solo-ícono. "Limpiar filtros" pasó a ser la brocha sin texto y **siempre visible**, deshabilitada cuando no hay nada que limpiar: así nunca cambia el ancho de la fila.
- `.truncate` — recorte con "…" para celdas de tabla.

**No introducir controles que aparezcan y desaparezcan en medio de una fila.** Si algo es condicional, o va deshabilitado, o va en un menú de acciones (`RowActionsMenu`).

**e) Listado de Guardias: columnas Apellidos y Nombres separadas.** El problema: la carpeta guarda "APELLIDOS NOMBRES" en una sola cadena, sin separador, así que de ahí **no se puede saber** dónde terminan los apellidos. `separar-nombre.util.ts` resuelve en dos niveles:
1. **Exacto** — el formulario de postulación guardó "Apellidos" y "Nombres" por separado, y ese dato vive en el stash de postulación de la ficha.
2. **Aproximado** — se asumen dos apellidos (convención ecuatoriana) y se marca `exacto: false`.

La tabla muestra las aproximadas con subrayado punteado y un tooltip que lo explica, en vez de presentar una separación deducida como si fuera un dato real. ⚠️ En carpetas antiguas cuyo nombre está en orden "Nombres Apellidos" la separación sale **invertida**; no hay forma de detectarlo desde la cadena, y por eso se marca. Se corrige sola cuando esa persona tenga el formulario de postulación, o renombrando la carpeta al estándar.

**f) Secciones que no se pueden negar por usuario.** `ALL_SECTIONS` gana `siempreVisible: true` en `DASHBOARD` (etiqueta ahora **"Inicio"**) y `PROJECTS`; Quejas y Encuestas ya estaban abiertas a nivel de ruta. `SectionPermissionGuard` y `usePermissions.canView` las dejan pasar siempre, y `CompanyAdminPermissions.tsx` muestra su casilla bloqueada con la insignia "Siempre visible". Cierra la causa de fondo del bucle del punto 15a: se le podía quitar el Inicio a alguien y dejarlo sin ningún lugar a donde entrar.

**g) Encuestas.** `GET /personal/surveys/:id/individual-results` ahora devuelve `id` por respuesta (`respondentId` es null en todas las públicas, así que no servía ni como clave de lista). Los resultados individuales se agrupan en dos desplegables — "Respuestas por enlace público" y "Respuestas por la app" — y recién dentro va el detalle por persona. Gestión de Encuestas ganó búsqueda por título/descripción y filtros por estado y por canal.

**h) WhatsApp bloqueado.** El botón de `GuardiaComplianceModal` y el campo de `NotificationConfigModal` quedan deshabilitados con la insignia "Próximamente". El código de Twilio sigue ahí; lo que falta es contratar el proveedor y una cuenta de WhatsApp Business aprobada por Meta.

### 17. Cuarta ronda — 2026-09-22

**a) Bitácoras y pantallas huérfanas: eliminadas.** Ver punto 16a/16b. Ya no queda ninguna.

**b) Documentos generados van a una carpeta fija de Drive, con botón para abrirla.** `RRHH_DOCUMENTOS` = `1LLnPLU7UFSFvIwi-FpMNyIQDkoZI-B8s`. La pantalla de Documentación tiene "Ver carpeta" (lee `GET /personal/drive/config?type=RRHH_DOCUMENTOS`, que ya resolvía los tipos fijos). **No confundir con Ventas**, que tiene su propio subsistema de contratos con firma electrónica.

**c) Supabase eliminado de todo el repo.** No se usaba desde hace tiempo pero seguía en el README, en `.agents/architecture.md`, en `.agents/database.md`, en la detección de SSL de `prisma.service.ts` y `seed.js`, y en dos scripts SQL muertos (`scripts/supabase-*.sql`, borrados). La base es Cloud SQL `gemeseg-db`; la detección de SSL ahora mira `cloudsql`/`pooler`.

**d) Claves de cuentas de servicio: el `.gitignore` tenía un hueco.** Listaba los archivos uno por uno, así que una clave descargada con el nombre por defecto de Google (`<proyecto>-<keyid>.json`) quedaba FUERA del ignore, a un commit de publicarse — fue exactamente lo que pasó con `agentes-504115-27cd9fb56874.json`. Ahora el patrón es amplio (`backend/*-*.json`, `backend/google-service-account*.json`) con excepciones explícitas para `package*.json`, `tsconfig*.json` y `nest-cli.json`.

**e) Correo: cuenta de servicio propia.** Ver la sección "Correo saliente" de `AGENTS.md`. `GmailMailService` se movió a `backend/src/modules/mail/` con su `MailModule`, para que Auth pueda usarlo sin depender del módulo de RRHH.

**f) Recuperación de contraseña con código.** El endpoint viejo (`POST /auth/forgot-password`, correo + contraseña nueva, sin verificar nada) **se eliminó**: era apoderamiento de cuenta abierto a cualquiera que supiera un correo, incluidas las de administrador. Ahora son dos pasos:
- `POST /auth/forgot-password/request` — manda un código de 6 dígitos. Responde **siempre lo mismo**, exista o no la cuenta: lo contrario sería una forma de averiguar qué correos existen.
- `POST /auth/forgot-password/confirm` — canjea código + contraseña nueva (mínimo 8 caracteres).

`PasswordResetCode` guarda el código **hasheado con bcrypt**, con caducidad de 15 minutos, un solo uso, máximo 5 intentos (son 6 dígitos: sin tope se podrían probar todos) y un código nuevo invalida los anteriores. Migración `20260922_password_reset_code`.

**g) Encuestas: guardar como borrador.** `guardarComoBorrador` en el alta deja `status: 'DRAFT'`. Un borrador no exige canal (puede estar a medias) y **su enlace público no abre** aunque tenga token — publicarlo sería filtrar algo a medio hacer. `PATCH /personal/surveys/:id/publish` lo publica, y recién ahí se exige que tenga destinatarios o enlace. Los resultados individuales ya no anidan un segundo desplegable: el canal agrupa, y el detalle de cada persona va visible.

**h) Listado de Guardias y tablas en general.** Columnas Apellidos/Nombres separadas (punto 16e), botón de limpiar estándar (`ClearFiltersButton`, escobita sin texto) y **columnas redimensionables** (`useResizableColumns`) con el ancho recordado por persona. Ver la sección de layout en `CLAUDE.md`: aplicar a toda tabla de listado nueva.

**i) WhatsApp bloqueado con "Próximamente"** (punto 16h).

### 19. El remitente de correo por empresa ahora funciona de verdad — 2026-09-22

Pregunta del usuario ("si pongo otro que no es sistemas, ¿funciona?") que destapó un problema: el campo **"Correo de envío"** de *Configurar notificaciones* se **exigía** para poder enviar, pero después **nunca se usaba**. El remitente real salía siempre de `GMAIL_SENDER_ADDRESS`. Escribir `rrhh@gemeseg.com` ahí no cambiaba nada, y no había forma de notarlo salvo mirando el correo recibido.

Qué cambió:
- `GmailMailService` cachea **un cliente por remitente** (`clientesPorRemitente`), no uno solo. La delegación de dominio impersona a una persona concreta, así que cada casilla necesita su propio cliente — con uno solo, el primero en usarse se quedaba fijo para todo.
- `sendMail` acepta `from` y `fromName`. Con nombre, el encabezado sale como `Recursos Humanos <rrhh@gemeseg.com>`, codificado en base64 para no romper las tildes.
- `AlertaVencimientoService` pasa `config.senderEmail` / `config.senderName`.
- El **código de recuperación de contraseña** salía, desde el 2026-09-22, del remitente de la empresa. El 2026-09-23 se revirtió: siempre es `sistemas@gemeseg.com` (`AuthService.REMITENTE_CONTRASENA`). Los recordatorios siguen dependiendo de Configurar notificaciones. Con el criterio anterior, GEMESEG no tenía casilla guardada y el código no se enviaba, aunque la pantalla dijera que sí.
- `NotificationConfigService.upsert` valida la casilla contra Google **antes de guardar** y **sin enviar nada** (`verificarRemitente` pide el token impersonando, que es justo el paso que falla si la casilla no existe).
- `explicarErrorGoogle` ahora busca sobre todas las piezas del error juntas. El código (`invalid_grant`) y el texto (`Invalid email or User ID`) vienen en campos distintos según el fallo, y quedarse con uno solo hacía que la traducción no reconociera el error y saliera el mensaje crudo de Google.

Verificado en local: guardar `noexiste@gemeseg.com` se rechaza con un mensaje entendible y no se guarda; guardar `rrhh@gemeseg.com` se acepta, y el log confirma `Correo enviado a ... desde rrhh@gemeseg.com` aunque `GMAIL_SENDER_ADDRESS` siga siendo `sistemas@`.

**Requisito que no se puede evitar:** el remitente debe ser un usuario REAL del dominio, con buzón propio. Los alias y los grupos no sirven.

### 18. Quinta ronda — 2026-09-22

**a) El correo YA FUNCIONA.** Faltaba habilitar la Gmail API en el proyecto `agentes-504115`. Verificado enviando de verdad a `test@gemeseg.com` (id `1a0cadba8d0dbf9c`) y por el flujo real de recuperación de contraseña. Remitente: `sistemas@gemeseg.com`; cuenta de servicio `correo-gemeseg-com@` (client_id `115386168102739974811`). Las casillas `correo@`, `info@` y `admin@gemeseg.com` **no existen** en el dominio.

**b) Bug real en `useResizableColumns`: las columnas nunca fueron arrastrables.** El hook usaba `useRef` y su efecto corría al montar, cuando la tabla todavía no estaba en el DOM (la pantalla mostraba "Cargando..."), así que los tiradores no llegaban a colocarse nunca. Ahora devuelve un **callback ref**: el montaje de la tabla dispara la instalación, y la reinstala si la tabla se desmonta y vuelve. Además el tirador ahora corta también el `click`, porque si no, soltar tras arrastrar reordenaba la columna.

**c) Ordenamiento por columna: `useSortableTable`** (`hooks/useSortableTable.tsx`). Mismo aspecto que el listado de tareas del Inicio (de ahí sale el patrón). Compara con `localeCompare(…, 'es')` para que tildes y ñ queden bien, y manda los vacíos al final en las dos direcciones. Aplicado a Guardias, Personal Administrativo y Gestión de Encuestas.

**d) Tuerca de módulos fijos también en la pantalla del super admin.** Estaba solo en `/admin/user-permissions`, que exige ser ADMIN **con empresa** — un usuario EMPLOYEE ni siquiera ve ese ítem del menú, y por eso parecía que no existía. Ahora también está en `/admin/permissions` (Gestión de Secciones por Empresa), que es donde el super admin ya trabaja.

**e) La barra lateral muestra el CARGO, no el rol.** Debajo del nombre salía "EMPLOYEE", que no le dice nada a nadie. Ahora muestra `User.position` (campo que ya existía y se edita desde Administración de usuarios), y si está vacío muestra el correo. `position` se agregó a la respuesta de login/registro. **Ojo:** las sesiones ya abiertas guardan el usuario viejo en el navegador, así que hay que volver a entrar para verlo.

## Arquitectura de carpetas Drive (`FolderConfig`)
`FolderConfig` tiene un campo `type`, único por `(companyId, type)`:

| `type` | Usado por | Cómo se define | Estructura actual |
|---|---|---|---|
| `CUMPLIMIENTO` | Entidades/Guardias (`syncEntidadesFolder`, desde 2026-09-09) | **Configurable** (tuerca en `/rrhh/guardias`) | `<raíz>/Público\|Privado/<Provincia - Entidad>/[Apellidos - Nombres]` (cédula en JSON; carpetas viejas `… - Cédula` siguen válidas). El guion de la entidad admite espacios de más o de menos. |
| `RECLUTAMIENTO` | Vacantes/candidatos | **Fija en código** (punto 12). Botón "Ver carpeta" en `/rrhh/reclutamiento` | `<raíz>/<Puesto>/` — carpeta por puesto, contiene el JSON del puesto + carpetas de postulantes `[Apellidos - Nombres]` |
| `PERSONAL_ADMIN` | Personal Administrativo (carpeta propia, desde 2026-09-08) | **Configurable** (tuerca en `/rrhh/administrativo`) | `<raíz>/[Apellidos Nombres]` — una subcarpeta por empleado. Si el nombre ya es ese formato, entra a la lista y se crea `datos.json` solo con el nombre, aunque todavía no haya cédula (2026-09-23) |
| `GUARDIAS_ARCHIVO` | Destino de "Archivar carpeta" al completar una salida (desde 2026-09-10, ver punto 6) | **Configurable** (tuerca en `/rrhh/guardias`) | `<raíz>/[Nombre-Cedula]` — la carpeta del guardia se mueve aquí tal cual, sin borrar documentos |
| `CAPACITACIONES` | Adjuntos de Capacitaciones (desde 2026-09-15, ver punto 8) | **Fija en código** (punto 12). Botón "Ver carpeta" en `/rrhh/capacitaciones` | `<raíz>/<Nombre>` si es puntual. `<raíz>/Anual/<Nombre>` si es del plan anual. "Anual" se crea si no está. Nombre repetido: la pantalla pregunta si se usa esa carpeta o se cambia el nombre (2026-09-23) |
| `VENTAS_CONTRATOS` | PDFs de contratos de ventas | **Fija en código** (punto 12). Botón "Ver carpeta" en `/ventas/contratos` | `<raíz>/<Plantilla>/` — subcarpeta por plantilla, creada la primera vez que hace falta |

✅ **Riesgo resuelto (2026-09-17)**: `DriveService.syncFolder` (endpoint `POST /personal/drive/sync`, método viejo, estructura plana `<raíz>/Custodios|Personal/[Nombre-Cedula]`) era código muerto desde 2026-09-09 (ningún botón de la UI lo llamaba) y además dependía del `Candidate` que se eliminó ese mismo día — se borró por completo (el método, el endpoint y la función `syncDriveFolder` del frontend). No reintroducir sin que alguien lo vaya a usar de verdad.

## Modelos de Prisma relevantes (fuera de los ya cubiertos en reclutamiento.md)
- `EmployeeDriveFolder`, `DocumentType`, `EmployeeDocument` — checklist de cumplimiento por empleado (Personal Administrativo).
- `DocumentReview` / `DocumentReviewHistory` — estado de revisión (PENDIENTE/APROBADO/RECHAZADO) y traza append-only; sobrevive al borrado del empleado (relación por cédula, no FK — deliberado, para auditoría).
- `FolderConfig` — una fila por `(companyId, type)`, ver tabla arriba.
- `Entidad`, `RequisitoDocumento`, `AsignacionGuardia`, `GuardiaContacto`, `GuardiaFichaPersonal`, `AlertaVencimiento` — módulo de Entidades/Cumplimiento, ver Backlog punto 3.
- `SistemaVerificacion`, `MovimientoPersonal`, `MovimientoPersonalItem` — Movimientos de Personal (entrada/salida de guardias), ver punto 6. La entrada automática la dispara `DriveService.contratarCandidato()` al contratar desde Reclutamiento (antes `KanbanColumn.triggersHire`, eliminado junto con el Kanban de Candidatos — ver punto 2).
- `Training`, `TrainingAttachment` — Capacitaciones, cumplimiento general (no por guardia), ver punto 8.
- `Complaint`, `ComplaintStageChange`, `ComplaintFieldDefinition` — Buzón de Quejas y Sugerencias, ver punto 9.
- `Survey`, `SurveyQuestion`, `SurveyRecipient`, `SurveyResponse`, `SurveyAnswer` — Encuestas, ver punto 10. `Survey.publicToken`/`publicEnabled` y `SurveyResponse.respondentId` opcional son del enlace público (migración `20260922_survey_public_link`).
- ~~`Certification` / `CertificationAlert`~~ — eliminados por completo el 2026-09-22 junto con su tabla, ver punto 4.

## Endpoints (fuera de Reclutamiento, ver ese doc para los suyos)
- ~~`/personal/logs/*`~~ — Bitácoras, eliminadas por completo el 2026-09-22 (punto 16a).
- `GET/POST/PATCH/DELETE /personal/sistemas-verificacion` — catálogo de sistemas (IsyPlus/IESS/SUT/SICOSEP), consumido desde el modal `ConfiguracionSistemasModal.tsx` dentro de `/rrhh/movimientos`, no tiene página propia
- `GET /personal/movimientos` (+ `/:id`), `GET /personal/movimientos/guardias-fuera`, `POST /personal/movimientos/salida`, `PATCH /personal/movimientos/:id/items/:itemId` — Movimientos de Personal. **No** hay `POST /personal/movimientos/entrada` (deliberado, ver punto 6)
- `GET /personal/drive/tree`, `GET /personal/drive/compliance/:cedula`, `DELETE /personal/drive/employee/:cedula`
- `GET/POST /personal/document-types`, `PATCH/DELETE /personal/document-types/:id`
- `GET /personal/drive/config`, `POST /personal/drive/test`, `POST /personal/drive/sync-entidades` (estructura Público/Privado/Entidad/Guardia, la que usa hoy `/rrhh/guardias`), `POST /personal/drive/sync-personal-admin`. (`POST /personal/drive/sync`, estructura plana vieja, eliminado 2026-09-17 — ver nota arriba.) `POST /personal/drive/config` **solo** acepta `CUMPLIMIENTO` / `PERSONAL_ADMIN` / `GUARDIAS_ARCHIVO` (punto 12).
- `POST /personal/drive/documents/review`, `GET /personal/drive/documents/reviews/:cedula`, `GET /personal/drive/documents/review-history`
- `GET/POST/PATCH/DELETE /personal/contracts/templates`, `POST /personal/contracts/generate`, `GET /personal/contracts`
- `GET /personal/dashboard`
- `GET/POST/PATCH/DELETE /personal/entidades`, `/personal/requisitos-documento` — módulo de Entidades/Cumplimiento, ver Backlog punto 3.
- `GET /personal/asignaciones`, `GET /personal/asignaciones/guardia/:cedula/historial`, `DELETE /personal/asignaciones/:id` — historial de solo lectura generado por `sync-entidades`, consumido hoy por `HistorialGuardia.tsx` (`/rrhh/historial`, ver punto 6). `POST /personal/asignaciones` y `PATCH /personal/asignaciones/:id/finalizar` siguen existiendo en el backend (los usa internamente el sync) pero **no tienen consumidor en la UI**, no reintroducir un formulario manual sobre ellos sin volver a confirmar con el usuario.
- `GET/POST/PATCH/DELETE /personal/personal-field-definitions` — catálogo de campos personalizados de la ficha (punto 7-bis), consumido por `PersonalFieldsConfigModal.tsx`. El `PATCH` acepta `type` desde 2026-09-22 (ver punto 15b): cambiar el tipo NO convierte ni borra los valores ya guardados.
- `GET /personal/cedula-merge/preview`, `POST /personal/cedula-merge`, `GET /personal/cedula-merge/historial` — vista previa, ejecución y traza de la fusión de cédulas duplicadas (punto 3 de Entidades; solo ADMIN), consumido por `CedulaMergeModal.tsx`.
- `POST /personal/drive/guardia/:cedula/archivar-carpeta` — mueve la carpeta de Drive de un guardia a `FolderConfig.type='GUARDIAS_ARCHIVO'` tras una salida completada (punto 6), consumido por el botón "Archivar carpeta" en `MovimientoDetalleModal.tsx`.
- `GET /personal/cumplimiento-entidades` (+ `/:cedula`) — cálculo de cumplimiento (estado `CUMPLIDO`/`FALTANTE`/`VENCIDO`/`POR_VENCER`) contra la entidad vigente de cada guardia.
- `GET/PATCH /personal/guardia-contacto/:cedula` — correo de contacto para recordatorios (independiente de `AsignacionGuardia`).
- `GET/PATCH /personal/guardia-ficha/:cedula` — ficha personal editable (teléfono, dirección, fecha de nacimiento, contacto de emergencia); fuente de la verdad del `Datos_Personales.json` que el sync escribe en Drive.
- `POST /personal/cumplimiento-entidades/guardia/:cedula/enviar-recordatorio` — envío manual y personalizado por guardia (reemplaza al viejo cron diario, ver Backlog punto 3). **No** existe ya `POST /personal/alertas-vencimiento/ejecutar` ni ningún cron automático — decisión explícita del usuario.
- `GET/POST/PATCH/DELETE /personal/trainings`, `PATCH /personal/trainings/:id/completed`, `POST /personal/trainings/upload`, `POST/DELETE /personal/trainings/:id/attachments(/:attachmentId)` — Capacitaciones (punto 8).
- `GET /personal/alerts` — capacitaciones vencidas + por vencer. Hasta el 2026-09-22 incluía también `certifications`; ya no, ver punto 4.
- `POST /personal/complaints`, `GET /personal/complaints` (RRHH), `PATCH /personal/complaints/:id/stage`, `GET/POST/PATCH/DELETE /personal/complaint-fields` — Buzón de Quejas y Sugerencias (punto 9).
- `GET/POST /personal/surveys`, `GET /personal/surveys/:id`, `GET /personal/surveys/:id/results`, `GET /personal/surveys/:id/individual-results`, `PATCH /personal/surveys/:id/public-link`, `PATCH /personal/surveys/:id/close`, `PATCH /personal/surveys/:id/reopen`, `DELETE /personal/surveys/:id`, `GET /personal/surveys/pending/mine`, `GET/POST /personal/surveys/:id/respond` — Encuestas (punto 10). `reopen` vuelve a publicar una cerrada sin borrar respuestas.
- **`GET /public/surveys/:token`, `POST /public/surveys/:token/responses`** — encuesta por enlace público. **Sin `AuthGuard` ni `SectionPermissionGuard`**, es la única superficie del módulo que se usa sin sesión (`PublicSurveyController`, punto 10). No agregarles guards "por prolijidad": rompería el caso de uso entero.
- `GET /personal/guardias` — padrón de guardias de la empresa (nombre + cédula), sección `RRHH`. **Reemplaza el uso de `GET /custodias/available-custodios` desde pantallas de RRHH** (2026-09-22): ese endpoint está detrás de la sección `CUSTODIAS`, así que Listado de Guardias y Generar Documento fallaban con *"No tienes acceso a CUSTODIAS"* en una empresa con RRHH pero sin Custodias — un mensaje que además no tenía nada que ver con lo que el usuario estaba haciendo. El dato en sí (carpetas de Drive de guardias) es de RRHH, no del módulo de viajes. `/custodias/available-custodios` **sigue existiendo** para las pantallas de Custodias; `EmpleadoSelect` recibe un prop `source` para elegir cuál usar.
- ~~`POST /personal/drive/backfill-postulacion`~~ — eliminado el 2026-09-22 junto con el botón "Completar fichas", ver punto 11.

## Rutas frontend (actuales, todas bajo `/rrhh`, guardadas con `SectionRoute section="RRHH"` — verificado contra `App.tsx` 2026-09-10)
```
/rrhh                    -> PersonalDashboard  (botón "Ayuda" abre RrhhHelpModal.tsx con la guía funcional de submódulos)
/rrhh/reclutamiento      -> ReclutamientoPage
/rrhh/guardias           -> GuardiasList
/rrhh/administrativo     -> AdministrativeStaff
/rrhh/contracts          -> ContractsList        (Documentación)
/rrhh/entidades          -> EntidadesList       (Entidades y Requisitos; incluye Fusionar cédulas duplicadas)
/rrhh/cumplimiento       -> CumplimientoEntidades
/rrhh/historial          -> HistorialGuardia    (fusiona la vieja Asignaciones + Movimientos, ver punto 6)
/rrhh/drive-config       -> DriveConfig        ⚠️ huérfana, ningún link de la UI la usa (ver nota en sección 7)
/rrhh/document-types     -> DocumentTypeConfig ⚠️ huérfana, ningún link de la UI la usa (ver nota en sección 7)
/rrhh/capacitaciones     -> TrainingsPage      (Capacitaciones, punto 8)
/rrhh/quejas             -> ComplaintsPage     (Buzón de Quejas y Sugerencias — enviar; SIN SectionRoute, accesible a cualquier empleado, ver punto 9)
/rrhh/quejas/gestion     -> ComplaintsManagementPage (gestión Kanban, ver punto 9)
/rrhh/encuestas          -> SurveysPage        (Encuestas — responder; SIN SectionRoute, mismo motivo que Quejas, ver punto 10)
/rrhh/encuestas/gestion  -> SurveyManagementPage (gestión + resultados + enlace público, ver punto 10)
```

**Fuera de `/rrhh` y fuera de `ProtectedLayout`:**
```
/encuesta/:token         -> PublicSurveyPage   (encuesta por enlace público; SIN login, SIN SectionRoute — ver punto 10)
```
**Ya no existen** `/rrhh/certifications` (`CertificationsList.tsx` no existe como archivo) ni `/rrhh/compliance` (`CompliancePanel.tsx` fue eliminado), ni `/rrhh/kanban`/`/rrhh/candidates`/`/rrhh/candidates/new`/`/rrhh/candidates/:id` (Kanban de Candidatos, eliminado por completo el 2026-09-17, ver punto 2) — si ves una referencia a cualquiera de estos en código o en un doc viejo, es texto desactualizado, no algo que reintroducir.

`/rrhh/logs` (`LogEntriesPage`, Bitácoras) **sigue existiendo como ruta** — el backend y el componente no se borraron (ver punto 5) — pero ya no tiene ningún link desde el Sidebar ni el Dashboard, así que en la práctica es huérfana igual que `drive-config`/`document-types`.

`/rrhh/asignaciones` y `/rrhh/movimientos` **ya no son pantallas propias**: siguen registradas en `App.tsx` como `<Navigate to="/rrhh/historial" />` para no romper enlaces guardados (favoritos, correos viejos), pero redirigen de inmediato — no hay `AsignacionesGuardias.tsx` ni `MovimientosList.tsx` en el código.

(Los componentes siguen viviendo en `frontend/src/pages/personal/` — solo cambió la ruta de React Router, no la carpeta ni el nombre de archivo.)

## Reglas
- Multitenant con `companyId`.
- Permiso de sección: `RRHH` (ver `PermissionsService.ALL_SECTIONS`), verificado con `SectionPermissionGuard` — importa que los usuarios de RRHH suelen estar cargados como rol `EMPLOYEE`, no `ADMIN`/`MANAGER` (ver `AGENTS.md`), así que el control de acceso real es por sección, no por rol.
- Historial completo de movimientos de entrada/salida (punto 6) y de revisiones documentales.
- Alertas de vencimiento (Entidades/Guardias, punto 3): envío real por correo, pero siempre manual y por guardia — nunca automático/masivo (decisión explícita del usuario). El submódulo viejo de `Certification`/`CertificationAlert` se eliminó por completo el 2026-09-22 (punto 4).

## Datos de Ejemplo (Seed)
- **5 Certifications**: Roberto Díaz (Nivel 1), Sandra Luna (Reentrenamiento), Fernando Castro (Examen Ocupacional), Eduardo Reyes (Nivel 2), Patricia Acosta (Nivel 1)
- **5 Log Entries**: 2 permisos de ingreso, 1 novedad operativa, 1 salida de personal, 1 respuesta a administrador
- **3 Contract Templates**: Término Indefinido, Término Fijo, Acta de Entrega de Uniformes
- **3 Contracts**: Ana Lucía Vera (SIGNED), Luis Fernando Gómez (DRAFT), Diana Carolina Torres (DRAFT) — nombre/cédula fijos en el seed desde 2026-09-17 (antes venían de `Candidate`, eliminado junto con el Kanban de Candidatos, ver punto 2).

---

## Backlog / Iniciativas en definición — 2026-09-08
Nada de esta sección está implementado todavía. Son decisiones ya conversadas con el usuario; el diseño técnico detallado y la implementación quedan pendientes.

### 1. Rename "Personal" → "Recursos Humanos" (rutas + permisos) — ✅ HECHO (2026-09-08)
Se implementó en dos capas, tal como estaba decidido:
- Backend: `PermissionsService.ALL_SECTIONS` clave `PERSONAL` → `RRHH`; migración `20260908_rename_personal_to_rrhh_section` aplicada a la BD de Cloud SQL para migrar las filas existentes de `CompanySection`/`UserPermission` con `section='PERSONAL'` a `'RRHH'` (sin perder permisos ya otorgados); todos los decoradores `@Section('PERSONAL', ...)` en `drive.controller.ts` ahora usan `@Section('RRHH', ...)`.
- Frontend: rutas de React Router `/personal/*` → `/rrhh/*` (en `App.tsx` y `Sidebar.tsx`), textos visibles "MODULO PERSONAL"/"PERSONAL Y RECURSOS HUMANOS" → "RECURSOS HUMANOS" en cada página, `canView('PERSONAL')`/`canWrite('PERSONAL')` → `'RRHH'`.
- Deliberadamente **NO** se tocó: el prefijo de endpoints (`@Controller('personal')` sigue `personal`, `personal.service.ts` sigue llamando a `/personal/...`) ni ningún nombre de archivo/carpeta interno (`backend/src/modules/personal/`, `frontend/src/pages/personal/`, `PersonalDashboard.tsx`, etc.) — es un contrato interno invisible para el usuario y renombrarlo habría sido riesgo innecesario sin beneficio visible.
- `AGENTS.md` ya no usa el nombre compuesto "Personal y RRHH" — el título de esa sección ahora es "Recursos Humanos (`/rrhh`)" (los endpoints listados debajo siguen como `/personal/...` a propósito, ver punto anterior).

### 2. Personal Administrativo — carpeta y configuración propia — ✅ HECHO (2026-09-08)
Confirmado con el usuario y ya implementado:
- Nuevo `FolderConfig.type='PERSONAL_ADMIN'` (agregado a `FOLDER_CONFIG_TYPES`, hoy en `drive.dto.ts` — vivía en `verification.dto.ts` hasta que ese archivo se eliminó el 2026-09-09 al reemplazar el submódulo de Verificación, ver punto 6), con su propio botón ⚙ "Configurar Drive" en `AdministrativeStaff.tsx` — mismo patrón modal que `GuardiasList.tsx` (probar conexión / guardar, `getDriveConfig`/`saveDriveConfig`/`testDriveConnection` con `type: 'PERSONAL_ADMIN'`). Reclutamiento ya no tiene ese modal (punto 12).
- Estructura real confirmada por el usuario: una subcarpeta por empleado directamente bajo la raíz configurada, nombrada **`Nombre Apellido - Puesto`** (sin cédula, dos segmentos).
- Nuevo campo `EmployeeDriveFolder.puesto` (migración `20260908_employee_drive_folder_puesto`) — el rol/puesto extraído del nombre de carpeta.
- **Riesgo de colisión evitado deliberadamente:** el parser genérico `parseEmployeeFolderName` (usado por Custodios) asume que el segmento tras el último "-" es una cédula (regex `[A-Za-z0-9]{7,13}`), lo cual habría interpretado "Puesto" como una cédula falsa y hecho colisionar en la misma fila a dos empleados con el mismo puesto (`@@unique([companyId, cedula])`). Por eso se creó un parser exclusivo `parsePersonalAdminFolderName` (en `drive.service.ts`, NO toca ni reutiliza `parseEmployeeFolderName`) que separa `name`/`puesto` por el último `" - "` literal, y usa como identidad de fila un `identityKey` sintético `PA-<últimos 16 caracteres del ID de carpeta de Drive>` — estable entre resyncs, único por construcción, nunca colisiona.
- Nuevo método `syncPersonalAdminFolder(companyId, userId)` (endpoint `POST /personal/drive/sync-personal-admin`) — sincroniza solo esta raíz (no re-sincroniza Custodios). Guarda `EmployeeDriveFolder.folderType='PERSONAL_ADMIN'` (valor nuevo y distinto de `'PERSONAL'`, para no mezclar árbol/UI con las filas viejas) pero mantiene `EmployeeDocument.folder='PERSONAL'` (valor existente, deliberado) para que el checklist de `DocumentType` ya configurado para `folder='PERSONAL'` siga aplicando sin que RRHH tenga que reconfigurar nada.
- Las filas viejas `EmployeeDriveFolder.folderType='PERSONAL'` que vinieran del sync compartido de CUMPLIMIENTO **se dejan intactas, sin migrar ni borrar** — simplemente ya no aparecen bajo la clave `PERSONAL_ADMIN` que ahora lee el frontend (`tree.PERSONAL_ADMIN` en vez de `tree.PERSONAL`).
- `getTree()` ahora devuelve un tercer bucket `PERSONAL_ADMIN: []` además de `CUSTODIAS`/`PERSONAL` (sin tocar el comportamiento de esos dos), e incluye `puesto` en cada fila devuelta.
- En la UI, `AdministrativeStaff.tsx` ya no muestra el `cedula` (para estas filas es el `identityKey` sintético, no una cédula real) — muestra `puesto` como badge secundario junto al nombre; `cedula` se sigue usando internamente como key/identificador opaco para `getDriveCompliance`, `getDocumentReviewHistory`, `deleteDriveEmployee`.

### 3. Módulo Entidades (Públicas/Privadas) + Cumplimiento — Drive como fuente de la verdad de la asignación
**Contexto de negocio** (explicado por el usuario): un guardia trabaja para una entidad (pública o privada); puede rotar entre entidades a lo largo del tiempo, incluso volver a una entidad donde ya trabajó antes. Cada entidad puede exigir solo los requisitos mínimos de la empresa, o requisitos adicionales propios (y estos pueden subir si el guardia pasa de una entidad privada a una pública, o viceversa). Ciertos documentos/certificados vencen y hay que avisar con anticipación configurable por tipo de documento. Objetivo central declarado: que RRHH tenga **visión clara de qué falta, a quién, y en qué entidad**.

**Pivote de arquitectura (2026-09-09):** la primera versión (Fase A/B/C de abajo) usaba un formulario manual para crear `AsignacionGuardia` y un cron diario en bulk para las alertas. El usuario, al revisar, aclaró que **RRHH ya tiene en Drive la estructura real** (`raíz → Público/Privado → Entidad → Guardia`) y que **esa carpeta debe ser la fuente de la verdad** de en qué entidad está cada guardia — no un formulario aparte que hay que mantener sincronizado a mano. También rechazó el modelo de alertas masivas automáticas ("no es la idea enviar a todo el mundo de una, sino que sea personalizado"). El diseño actual, ya implementado:

- **`DriveService.syncEntidadesFolder(companyId, userId)`** (`POST /personal/drive/sync-entidades`, botón "Sincronizar Drive" en `GuardiasList.tsx`) recorre `FolderConfig.type='CUMPLIMIENTO'` con la estructura `Público|Privado/<Provincia - Entidad>/<Apellidos - Nombres>` (ver punto 11):
  1. Normaliza el nombre de cada carpeta de primer nivel (sin tildes/mayúsculas) para matchear "publico"/"privado"; lo que no matchea se reporta en `carpetasNoReconocidas` **sin romper el resto del sync**.
  2. Cada subcarpeta de Público/Privado es una `Entidad`, **anclada por `Entidad.driveFolderId`** (2026-09-09, ver "Resiliencia ante accidentes de Drive" más abajo) — si el `driveFolderId` de la carpeta ya está vinculado a una fila, es la MISMA entidad aunque se haya renombrado (solo se actualiza `nombre`); si no, se busca por nombre (case-insensitive) para compatibilidad con entidades creadas antes de este campo o a mano, y se ancla ahí; si no existe ninguna, **se crea sola** con el tipo que indica la carpeta. Si el tipo no coincide con el ya guardado, **no se sobreescribe** (se reporta en `entidadesTipoDistinto`). Si dos carpetas de Drive distintas comparten nombre, se reporta en `entidadesColisionNombre` sin reanclar nada.
  3. Cada subcarpeta de una Entidad es un guardia, **anclado por `EmployeeDriveFolder.folderId`** (mismo principio que el punto anterior, ver más abajo) — se sincronizan sus `EmployeeDocument` (`folder='CUSTODIAS'`, deliberado: el módulo de Custodias/viajes, `custodias.service.ts:getAvailableCustodios`, depende de ese valor y no debía romperse) y se crea/actualiza su `Datos_Personales.json` (ver `GuardiaFichaPersonal` abajo).
  4. Reconcilia `AsignacionGuardia` (historial de solo lectura): abre una fila nueva por cada guardia visto sin asignación activa, cierra (`fechaFin`) la de quien cambió de entidad o desapareció de toda la estructura — **nunca borra `Entidad` ni `RequisitoDocumento`** por un accidente de Drive (carpeta borrada/movida/ID mal puesto). Un guardia sin carpeta detectada simplemente queda "sin asignación" hasta que la carpeta reaparezca con el mismo nombre. **Excepción deliberada** (2026-09-09): si el guardia ya está marcado "fuera" en Movimientos de Personal (ver punto 6), NO se le reabre una asignación aunque su carpeta siga en Drive — se reporta en `guardiasFueraConCarpetaActiva` en vez de reactivarlo en silencio.
  5. Devuelve un resumen (`entidadesCreadas`, `entidadesRenombradas`, `entidadesTipoDistinto`, `entidadesColisionNombre`, `guardiasActualizados`, `documentos`, `fichasPersonales`, `asignacionesAbiertas/Cerradas`, `carpetasNoReconocidas`, `guardiasNoReconocidos`, `renombresIgnorados`, `guardiasFueraConCarpetaActiva`, `errors`) que la UI muestra íntegro — ningún fallo parcial se oculta.

**Resiliencia ante accidentes de Drive (2026-09-09, encontrado probando el flujo real de renombrar una carpeta):** la primera versión de `syncEntidadesFolder` identificaba tanto a la Entidad como al guardia **solo por el nombre/cédula parseado del nombre de carpeta actual**. Esto significa que renombrar una carpeta (a propósito o por error de tipeo) rompía la identidad en vez de solo actualizar un dato:
- Un guardia cuya carpeta se renombra con una cédula distinta (typo) o con un formato irreconocible generaba una fila **nueva** (con la cédula nueva, o con una cédula sintética `ID-<...>` si el nombre no parseaba nada) mientras la fila vieja se cerraba como si el guardia hubiera desaparecido — fragmentando a la misma persona en 2-3 identidades distintas en `AsignacionesGuardias.tsx` y `GuardiasList.tsx`.
- Una entidad cuya carpeta se renombra generaba una entidad **nueva** con el nombre nuevo, dejando la entidad vieja huérfana (con sus `RequisitoDocumento` específicos y el historial de guardias que hubiera tenido, ahora inaccesibles desde la carpeta real).

**Fix**: tanto `Entidad` (`driveFolderId`, campo nuevo) como `EmployeeDriveFolder` (`folderId`, ya existía) ahora anclan la identidad al **ID de carpeta de Drive** (estable entre renombres), no al texto parseado:
- Si el `folderId` ya estaba vinculado a una fila y el nombre cambió, se actualiza el nombre de esa fila — nunca se crea una fila nueva ni se huerfaniza la vieja.
- Si el `folderId` ya estaba vinculado a una fila pero la nueva cédula parseada de un guardia es DISTINTA (typo, o la carpeta ya no trae cédula ni en el nombre ni en JSON), se **mantiene la cédula/nombre originales** por seguridad — se reporta en `renombresIgnorados` en vez de fragmentar. No hay hoy una forma de confirmar manualmente una corrección real de cédula; si hace falta, hablar con el usuario antes de construirla.
- Si una carpeta de guardia nueva (nunca vista) no se puede leer como "Apellidos - Nombres" con cédula en JSON, ni como el formato viejo "… - Cédula", NO se crea ninguna fila — se reporta en `guardiasNoReconocidos`. Antes esto creaba un guardia fantasma con cédula sintética.
- Cubierto extensivamente en `drive.service.spec.ts` (`describe('DriveService.syncEntidadesFolder', ...)`: rename de entidad, backfill de `driveFolderId`, colisión de nombre entre 2 carpetas, rename de guardia con cédula distinta, carpeta de guardia no reconocible, rotación de entidad de un guardia "fuera").
- **`AsignacionGuardia` es 100% de solo lectura desde la UI** — sin `email` (se movió a `GuardiaContacto`). `AsignacionesGuardias.tsx` (`/rrhh/asignaciones`) solo muestra el historial y permite eliminar una fila como válvula de seguridad si el sync generó algo erróneo por una carpeta mal configurada.
- **`GuardiaContacto`** (`cedula, email` por `companyId`) — correo del guardia para recordatorios. Se edita en Datos personales de la ficha (`GuardiaFichaModal`, campo "Correo de contacto"); el modal de cumplimiento sigue pudiendo leerlo. Independiente de en qué entidad esté hoy (sobrevive a que rote).
- **`GuardiaFichaPersonal`** — ficha editable desde `GuardiaFichaModal.tsx` (sección "Datos personales"), **nunca desde Drive**. Cédula, apellidos, nombres y correo de contacto se muestran siempre, aunque no estén en los campos configurables: la ficha solo listaba lo que cada empresa tenía en `PersonalFieldDefinition`, y esos cuatro no eran campos del catálogo (el correo existía como "Email" y, encima, Cumplimiento leía otra tabla). La cédula se muestra vacía mientras no haya 10 dígitos. Apellidos y nombres, cuando los dos están escritos, actualizan el nombre de la lista; la carpeta de Drive no se renombra. Es la fuente de la verdad de `Datos_Personales.json`, que `syncEntidadesFolder` crea o sobrescribe en la carpeta de cada guardia en cada sincronización. (Hasta 2026-09-17 se mezclaba con datos de `Candidate` si el guardia venía del Kanban de Reclutamiento — ya no, ver punto 2.) El archivo en Drive es un espejo de solo lectura — nunca se lee de vuelta. Un fallo al escribirlo (ej. la carpeta raíz solo está compartida como "Lector" en vez de "Editor") se reporta en `errors` del resultado del sync pero no interrumpe el resto.
- **Estados de cumplimiento**: `CUMPLIDO` / `FALTANTE` / `VENCIDO` / `POR_VENCER` (dentro de la ventana `anticipacionValor`/`anticipacionUnidad` del requisito). **Fix 2026-09-09**: un requisito configurado como "no vence" (`duracionValor: null`) nunca se marca `VENCIDO`/`POR_VENCER`, sin importar qué `expiryDate` haya extraído Drive/IA del documento — antes sí se colaba una fecha extraída y avisaba igual, contradiciendo la config de RRHH. Cubierto por test en `cumplimiento-entidad.service.spec.ts`.
- **`CumplimientoEntidades.tsx`** (`/rrhh/cumplimiento`): tabla semáforo (verde/amarillo/rojo) por guardia, con búsqueda (nombre/cédula) y filtros por entidad y por estado — ya no hay botones de "Requisitos" ni "Probar alertas ahora" en esta pantalla (ver siguiente punto).
- **Recordatorios: manuales y personalizados, sin cron.** `AlertaVencimientoService.enviarRecordatorio(companyId, cedula, medio)` (`POST /personal/cumplimiento-entidades/guardia/:cedula/enviar-recordatorio`, botón "Enviar recordatorio" en `GuardiaComplianceModal.tsx`) — RRHH decide a qué guardia, por qué medio (hoy solo `EMAIL`; `WHATSAPP` deshabilitado en la UI, anotado para el futuro) y en qué momento notificar. **No existe ningún cron ni endpoint de "ejecutar para todos"** — se eliminó `AlertaVencimientoScheduler` y el viejo `POST /personal/alertas-vencimiento/ejecutar` por decisión explícita del usuario ("no es la idea enviar a todo el mundo de una, sino que sea personalizado"). El envío sigue bloqueado en producción hasta que se configure domain-wide delegation en Google Workspace (ver checklist en Fase C más abajo, sigue vigente sin cambios).
- **`EntidadesList.tsx`** (`/rrhh/entidades`): modal de "Requisitos Generales" rediseñado con 3 secciones siempre visibles (Global/Pública/Privada, cada una editable) en vez de tabs; los requisitos específicos de una entidad también son editables. Nota de UX 2026-09-09: los inputs/selects sueltos dentro de un modal (sin envolver en `.form-group`) caían al estilo nativo del navegador — se agregó una regla CSS (`styles.css`, cerca de `.modal-body`) que da estilo por defecto a cualquier input/select/textarea dentro de `.modal-body`, para que este tipo de bug no se repita en otros modales del módulo.

**Verificación de este pivote**: cubierta por `cumplimiento-entidad.service.spec.ts`, `movimiento-personal.service.spec.ts`, `guardia-ficha-personal.service.spec.ts` y el nuevo `describe('DriveService.syncEntidadesFolder', ...)` en `drive.service.spec.ts` (creación automática de entidad, creación/actualización de `Datos_Personales.json`, exclusión de la ficha de `EmployeeDocument`, tolerancia a fallos de permisos de Drive, carpetas no reconocidas).

---

**Historial de diseño (fases previas al pivote de arriba, ya no vigentes en su forma original pero documentadas por contexto):**

**Fase A (Entidad/RequisitoDocumento/AsignacionGuardia + dashboard de cumplimiento) — ✅ HECHA, luego reemplazada.** El modelo de datos y los CRUDs se mantienen; lo que cambió es quién escribe `AsignacionGuardia` (ver pivote arriba). Plan original en `C:\Users\leidy\.claude\plans\analiza-este-problema-parallel-pudding.md`.

**Fase B (lectura de fecha por IA) — ✅ HECHA (2026-09-08), solo extracción por texto. Sigue vigente sin cambios.**
- **Flujo**: RRHH pulsa "Leer con IA" (ícono `Sparkles`, `lucide-react`) junto al editor de fecha de un documento ya sincronizado desde Drive, en `ComplianceChecklist.tsx` (nuevo prop opt-in `allowAiExtract`, solo activado en `CumplimientoEntidades.tsx` — el resto de consumidores de ese componente, `CompliancePanel`/`AdministrativeStaff`/`GuardiaDetailModal`, quedan sin cambios). El backend NUNCA guarda el resultado — solo lo propone (`POST /personal/drive/documents/:driveFileId/extract-expiry`, `DocumentExtractionService.extractExpiry`, sección `RRHH`/`write`); el guardado sigue pasando exclusivamente por el `PATCH .../expiry` de la Fase A, una vez que RRHH revisa/corrige los valores pre-rellenados y pulsa "Guardar".
- **Extracción de texto — solo PDFs con capa de texto real, deliberadamente sin OCR todavía.** Se agregó `pdf-parse@1.1.1` (no la v2.x actual del paquete, que depende de `@napi-rs/canvas` — un binario nativo por plataforma vía `optionalDependencies` — incompatible con el requisito de "sin dependencias nativas, seguro para Cloud Run"; v1.1.1 es pura JS). `DriveService.downloadFileBuffer(driveFileId)` (nuevo) trae los bytes del PDF vía `drive.files.get({ alt: 'media' }, { responseType: 'arraybuffer' })`; `pdf-parse` extrae el texto. Si el texto resultante tiene menos de 40 caracteres no-blancos (heurística de "sin capa de texto útil", típico de un PDF escaneado/foto), se falla de inmediato con `{ success: false, reason: 'SIN_TEXTO', message: 'No se pudo leer texto de este PDF automáticamente. Ingresa la fecha manualmente.' }` **sin llamar a la IA** (ahorra la llamada). El soporte de PDFs escaneados/fotografiados vía OCR o visión queda **deliberadamente fuera de esta primera pasada** — se evaluará agregarlo en una fase futura según qué tan seguido resulte necesario en la práctica real (el usuario confirmó que sus documentos reales son una mezcla de ambos tipos).
- **Prompt y cálculo de vencimiento por período de validez**: el texto (truncado a 4000 caracteres) se pasa a `gpt-4o-mini` vía GitHub Models (mismo modelo/endpoint que `ai.service.ts`) pidiendo JSON con `fechaEmision`, `fechaVencimiento`, `confianza` (alta/media/baja) y `notas`. El prompt instruye explícitamente calcular `fechaVencimiento` a partir de `fechaEmision` cuando el documento indica un PERÍODO de validez en vez de una fecha exacta (ej. "vigente por 2 años desde la emisión") — capacidad valiosa para certificados reales redactados así, verificada con una llamada de prueba manual (ver hallazgo abajo). Si no hay información suficiente para una fecha, el prompt pide `null` en vez de adivinar, reflejado en `confianza: "baja"`.
- **`response_format: json_object` no se pudo confirmar en vivo** por el hallazgo de infraestructura de abajo — el código intenta pedirlo primero y, si la llamada falla o la respuesta no es JSON parseable, reintenta sin ese parámetro con un prompt que pide explícitamente "responde ÚNICAMENTE con el JSON, sin texto adicional ni bloques de código", parseando de forma defensiva (recorta fences de markdown, `JSON.parse` con try/catch, y cualquier fallo cae en `{ success: false, reason: 'RESPUESTA_INVALIDA' }` en vez de romper la petición).
- **⚠️ Hallazgo importante, fuera del alcance de esta tarea pero urgente**: al probar la llamada en vivo para verificar esta feature, **GitHub Models devolvió `410 github_models_retirement_brownout`** ("GitHub Models is temporarily unavailable as part of a scheduled retirement brownout") en el endpoint nuevo (`https://models.github.ai/inference/chat/completions`) y el endpoint viejo que usa `ai.service.ts` (`https://models.inference.ai.azure.com/chat/completions`) **ya ni siquiera resuelve por DNS** — probado con `gpt-4o-mini` y `openai/gpt-4o-mini`, con y sin `response_format`, mismo resultado siempre. Esto indica que **GitHub Models está siendo retirado por GitHub/Microsoft**, lo cual muy probablemente ya está afectando en silencio al chat de IA existente (`ai.service.ts`): esa llamada fallaría igual y el código ya tiene un `catch` que cae a `mockResponse`, así que el síntoma en producción sería "el chat responde pero siempre en modo genérico/respaldo", sin error visible. Se recomienda validar esto pronto y decidir a qué proveedor migrar (OpenAI directo, Anthropic, una suscripción real de Azure OpenAI, etc.) — no se tocó `ai.service.ts` en esta tarea porque estaba explícitamente fuera de alcance, pero el mismo problema de fondo aplica a esta nueva feature de extracción de fechas: hasta que se resuelva la migración de proveedor, "Leer con IA" devolverá `RESPUESTA_INVALIDA` o un error de red en producción.

**Fase C (aviso por correo) — rediseñada 2026-09-09: de cron diario en bulk a envío manual y personalizado.** El código y el bloqueo de infraestructura descritos originalmente aquí (cron `AlertaVencimientoScheduler` a las 8am, botón "Probar alertas ahora", `AsignacionGuardia.email`) **ya no existen** — el usuario rechazó explícitamente el modelo de notificación masiva automática. Lo vigente hoy:
- `AlertaVencimientoService.enviarRecordatorio(companyId, cedula, medio)` — se dispara a demanda, un guardia a la vez, desde el botón "Enviar recordatorio" en `GuardiaComplianceModal.tsx`. Reutiliza `CumplimientoEntidadService.getComplianceForGuardia` para armar un correo consolidado con lo pendiente (`FALTANTE`/`VENCIDO`/`POR_VENCER`), lo envía vía `GmailMailService` (sin cambios respecto al diseño original) y deja constancia en `AlertaVencimiento`.
- El correo de destino sale de `GuardiaContacto` (no de `AsignacionGuardia`, que ahora es un historial auto-generado por Drive — no tiene sentido pedirle un correo manual). Si el guardia no tiene contacto registrado, el botón de envío se deshabilita en la UI con un tooltip explicando por qué, en vez de fallar en silencio.
- **⛔ Sigue bloqueado por lo mismo de siempre**: enviar correo "como" una casilla real de Gmail vía API con una service account requiere **domain-wide delegation**, configurada en la consola de administración de Google Workspace por un administrador del dominio — no es algo que se resuelva con código. El envío falla limpiamente (nunca rompe la petición) hasta que se complete. Checklist para el administrador de Workspace (sin cambios respecto al diseño original):
  1. **Ir a** admin.google.com → Seguridad → Control de acceso y datos → Delegación a nivel de dominio ("Domain-wide Delegation").
  2. **Agregar un nuevo cliente API** con el `Client ID` de la service account que ya usa este sistema para Drive (la misma cuenta, un scope adicional):
     - `client_id`: `110180689092990039996`
     - `client_email` (para referencia, no se pega en ese campo): `drive-sync@agentes-504115.iam.gserviceaccount.com`
  3. **Scope de OAuth a autorizar**: `https://www.googleapis.com/auth/gmail.send`
  4. **Elegir la casilla real que va a "impersonar"** el envío (ej. `rrhh@gemeseg.com` o la que decida el usuario) y configurarla como variable de entorno del backend: `GMAIL_SENDER_ADDRESS=<esa casilla>`. Debe ser un buzón real dentro del Workspace del dominio que autorizó la delegación.
  5. **Configurar también** `RRHH_CONTACT_EMAIL=<correo de RRHH>` (a dónde le pide el correo al guardia que envíe el documento renovado) — si no se configura, el correo usa una frase genérica ("contacta a Recursos Humanos") en vez de un correo roto o vacío.
  6. **Cómo probar una vez esté lista la delegación**: usar el botón "Enviar recordatorio" sobre cualquier guardia con algo pendiente en `GuardiaComplianceModal.tsx`, o `POST /personal/cumplimiento-entidades/guardia/:cedula/enviar-recordatorio` directamente — el resultado (`enviado`, `cantidadNotificada`) confirma de inmediato si el envío real está funcionando. Antes de que la delegación esté lista, este mismo botón sirve para probar el resto del pipeline (cálculo de pendientes) — solo el envío en sí fallará, y el motivo queda registrado en `AlertaVencimiento.errorMessage`.
- **Fuera de alcance todavía**: WhatsApp como canal (selector ya existe en la UI, deshabilitado con "Próximamente"), y una pantalla de historial de alertas dedicada.

## Flujos de prueba end-to-end (RRHH completo) — 2026-09-17

Checklist de pruebas manuales para verificar que **todo el módulo funciona junto**, no solo cada pantalla por separado — pocos flujos completos que de punta a punta atraviesan casi todas las piezas, en vez de un caso por submódulo. Pedido explícito del usuario: "que lleven un guardia desde contratarlo hasta sacarlo... para verificar TODO".

### ⚠️ Antes de empezar

- **No corras esto contra la carpeta de Drive de producción sin avisar a nadie.** Varios pasos mueven/renombran carpetas reales (contratar un candidato, archivar un guardia) — usa una vacante/candidato de prueba explícitamente marcado como tal (ej. nombre "PRUEBA QA — no usar"), y bórralo/archívalo al terminar.
- Corre esto contra tu Postgres **local** (`docker compose up -d db redis`, `npx prisma db push`, `npm run seed:minimal` si hace falta), no contra Cloud SQL de producción.
- Usuario sugerido: `sistemas@gemeseg.com` (ver `README.md` → "Credenciales de prueba"), empresa GEMESEG — es donde vive el catálogo real de `SistemaVerificacion` (IsyPlus/IESS/SUT/SICOSEP) y donde tiene sentido de negocio probar Guardias. Rol EMPLOYEE alcanza para casi todo; si algún paso pide ADMIN (fusión de cédulas, alguna configuración), usa `admin@gemeseg.com`.
- **Precondiciones de configuración** (si ya están hechas en tu entorno, sáltate esto — son de una sola vez, no por prueba):
  - [ ] Al menos una vacante en Reclutamiento con `tipoContratacion = GUARDIA` y su carpeta de Drive.
  - [ ] `FolderConfig` configurado para `CUMPLIMIENTO`, `GUARDIAS_ARCHIVO` y `PERSONAL_ADMIN` (botones "Configurar Drive" en `/rrhh/guardias` y `/rrhh/administrativo`).
  - [ ] Al menos una `Entidad` con `RequisitoDocumento` definidos, en `/rrhh/entidades`.
  - [ ] Al menos una plantilla de contrato en `/rrhh/contracts` → "+ Nueva plantilla", con `driveUrl` apuntando a un `.docx` con variables `[Variable]`.
  - [ ] Catálogo de `SistemaVerificacion` revisado en el modal "⚙ Configurar sistemas" (dentro de `/rrhh/historial`).
  - [ ] Si vas a probar el envío de recordatorio por correo: sabe de antemano que **va a fallar limpiamente** salvo que ya se haya hecho la delegación de dominio de Gmail (ver Backlog punto 3, Fase C, arriba) — no es un bug si falla, es el estado esperado hoy.

### Flujo 1 — Ciclo de vida completo de un Guardia (contratar → cumplimiento → capacitación → salida)

El flujo principal: un guardia entra por Reclutamiento y sale por Movimientos de Personal, tocando en el medio Cumplimiento, Documentación y Capacitaciones.

**1.1 Reclutamiento → Contratar**
- [ ] En `/rrhh/reclutamiento`, pestaña "Candidatos Postulados", abre un candidato de prueba.
- [ ] Botón **"Marcar como Contratado"** en el modal de detalle → confirmar en el modal propio (`ConfirmDialog`, ya no `window.confirm` desde 2026-09-17).
- [ ] Verificar: la carpeta del candidato se mueve a la carpeta de Guardias, con `estado: 'CONTRATADO'` y `fechaContratacion` en su `candidato.json`.
- [ ] Ir a `/rrhh/guardias` → el guardia debe aparecer ahí, en la entidad **"Sin Asignar"** (sync automático, no hace falta apretar "Sincronizar Drive" a mano).
- [ ] Si intentas contratar la misma cédula dos veces **mientras sigue activo**, debe rechazarlo por duplicado en vez de crear un segundo registro. Si en cambio esa cédula ya había salido (`SALIDA`/`COMPLETADO`), debe **permitir** la recontratación sin bloquear (ver "Recontratación" en el punto 6 arriba).

**1.2 Ficha del guardia y campos personalizados**
- [ ] Abrir la ficha del guardia (`GuardiaFichaModal.tsx`) desde `/rrhh/guardias` → completar teléfono, dirección, fecha de nacimiento, contacto de emergencia, **horario**, **puesto formal** y **salario acordado**.
- [ ] Si tienes algún campo personalizado definido (botón "Configurar campos" → `PersonalFieldsConfigModal.tsx`), confirmar que aparece en esta ficha y que el valor se guarda.
- [ ] Configurar el correo de `GuardiaContacto` (necesario para el recordatorio del punto 1.3).

**1.3 Cumplimiento documental**
- [ ] Ir a `/rrhh/cumplimiento` → buscar al guardia, confirmar que aparece con semáforo 🔴 o 🟡 (documentación incompleta es lo esperado recién contratado).
- [ ] Abrir su `GuardiaComplianceModal.tsx` → ver el checklist completo contra los `RequisitoDocumento` de su entidad.
- [ ] Subir a su carpeta de Drive (Guardias) uno o más de los documentos que faltan, con el nombre esperado por el checklist.
- [ ] Sincronizar y confirmar que el semáforo mejora (pasa a 🟢 si ya subiste todo lo obligatorio).
- [ ] Probar el botón **"Enviar recordatorio"** — si Gmail no está delegado todavía, debe fallar con un mensaje claro (no romper la pantalla); si ya está delegado, confirmar que llega el correo consolidado.

**1.4 Documentación (generar contrato)**
- [ ] Ir a `/rrhh/contracts` → **"+ Generar Documento"** (`/rrhh/contracts/generar`).
- [ ] Elegir el guardia de prueba + un tipo de plantilla ya configurada.
- [ ] Confirmar que el autocompletado trae bien: nombre, cédula, puesto formal, horario, salario acordado (de `GuardiaFichaPersonal`), entidad asignada (de `AsignacionGuardia`), fecha.
- [ ] Generar el PDF y abrirlo — confirmar visualmente que los datos insertados son correctos y legibles.
- [ ] Confirmar que el contrato queda listado en la pantalla de Documentación, no solo como un archivo suelto.

**1.5 Capacitaciones**
- [ ] En `/rrhh/capacitaciones`, crear una capacitación de prueba con `dueDate` dentro de los próximos 30 días, sin marcar completada.
- [ ] Ir a `/rrhh` (Dashboard) → confirmar que aparece en el widget de alertas pendientes (`GET /personal/alerts`).
- [ ] Volver a Capacitaciones → botón **"Registrar cumplimiento"**, adjuntar al menos una evidencia antes de confirmar.
- [ ] Confirmar que desaparece del widget de alertas.
- [ ] Probar **"Revertir cumplimiento"** → confirmar que la sección "Evidencia de cumplimiento" se sigue viendo (no se pierde el adjunto al revertir).

**1.6 Movimientos de Personal — Salida (offboarding)**
- [ ] En `/rrhh/guardias`, ícono de salida (rojo, `LogOut`) en la fila del guardia de prueba → confirmar en el modal propio (`ConfirmDialog`, ya no `window.confirm` desde 2026-09-17).
- [ ] Ir a `/rrhh/historial` → confirmar que aparece un caso `SALIDA` para este guardia, con sus items por cada `SistemaVerificacion` activo.
- [ ] Marcar todos los items del caso como completados → confirmar que el caso pasa solo a `COMPLETADO` (sin botón manual para eso).
- [ ] Con el caso ya `COMPLETADO`, abrir su detalle (`MovimientoDetalleModal.tsx`) → botón **"Archivar carpeta"** → confirmar que mueve (no borra) la carpeta de Drive del guardia a la carpeta de archivo configurada.
- [ ] Volver a `/rrhh/guardias` → el guardia **no debe aparecer** en la tabla ni en los KPIs por defecto.
- [ ] Botón "Mostrar guardias fuera (N)" → confirmar que ahí sí aparece, atenuado, con etiqueta "Fuera".
- [ ] Revisar `/rrhh/cumplimiento` → el guardia archivado no debería seguir apareciendo como pendiente activo.

**Con esto quedan tocados:** Reclutamiento, Listado de Guardias + ficha + campos personalizados, Cumplimiento documental + recordatorio, Documentación/Contratos, Capacitaciones + alertas, Movimientos de Personal (entrada implícita + salida), Historial, archivado de Drive, y el Dashboard de RRHH.

### Flujo 2 — Personal Administrativo (lo que cambia respecto a Guardias)

No repite todo el Flujo 1 — solo lo que este bucket hace **distinto**.

- [ ] Contratar un candidato de una vacante con `tipoContratacion = ADMINISTRATIVO` (mismo botón "Marcar como Contratado").
- [ ] Verificar que la carpeta termina nombrada **"Nombre - Puesto"** (sin cédula), no "Nombre - Cédula".
- [ ] Verificar que aparece en `/rrhh/administrativo`, no en `/rrhh/guardias`.
- [ ] Confirmar que el control de duplicados es **por nombre normalizado**, no por cédula: intenta contratar dos candidatos con el mismo nombre y confirma que lo rechaza.
- [ ] Confirmar que `/rrhh/administrativo` tiene su propio botón "Configurar Drive" (`FolderConfig.type='PERSONAL_ADMIN'`), independiente del de Guardias.
- [ ] Confirmar que este empleado **no puede** recibir un documento vía `/rrhh/contracts/generar` — alcance actual es solo Guardias (si la UI lo permite, es un bug a reportar, no algo esperado).

### Flujo 3 — Quejas y Encuestas (independientes de un guardia puntual)

Estos dos módulos no dependen de un guardia específico — dependen de **usuarios con cuenta** en la app (nunca guardias, que no tienen login).

- [ ] Como cualquier usuario con cuenta: enviar una queja/sugerencia en `/rrhh/quejas`.
- [ ] Como RRHH: gestionarla en `/rrhh/quejas/gestion`, moverla de etapa y confirmar que el historial de cambios de etapa queda registrado.
- [ ] Como RRHH: crear una encuesta en `/rrhh/encuestas/gestion` con al menos una pregunta de cada tipo (texto corto, texto largo, opción única, opción múltiple, escala 1-5) y asignarle destinatarios.
- [ ] Confirmar que a esos usuarios les aparece el aviso "Encuestas pendientes" en su Dashboard general (`PendingSurveysBanner.tsx`), no solo en RRHH.
- [ ] Responder la encuesta como uno de los destinatarios en `/rrhh/encuestas` → confirmar que no deja responder dos veces.
- [ ] Ver resultados agregados en `/rrhh/encuestas/gestion` → confirmar conteos por opción, promedio de escala, y tasa de respuesta.

### Cosas que esta checklist no puede verificar todavía (bloqueos conocidos, no bugs)

- El envío real de recordatorios por Gmail requiere domain-wide delegation configurada por un administrador de Workspace — sin eso, el fallo es esperado (Backlog punto 3, arriba).
- WhatsApp como canal de recordatorio: deshabilitado en la UI ("Próximamente"), no probar.
- El flujo de "Marcar como Contratado" y "Archivar carpeta" mueven carpetas reales de Drive — si no tienes un entorno de Drive de prueba separado, o usas datos claramente marcados como prueba, o coordinas con el resto del equipo antes de correr este flujo contra el Drive compartido.
- Verificación asistida contra SUT/SICOSEP/IESS por scraping: descartada (ver `backend/scraping-poc/README.md`) — no es parte de ningún flujo de esta checklist.

### Al terminar

- [ ] Archivar o eliminar (según corresponda) al guardia/empleado de prueba creado en el Flujo 1/2, para no dejar datos falsos mezclados con los reales.
- [ ] Si generaste un contrato de prueba, bórralo desde `/rrhh/contracts`.
- [ ] Si creaste una capacitación o encuesta de prueba, ciérrala o bórrala si todavía no tiene respuestas/evidencia real de nadie más.

## Referencias
- [reclutamiento.md](reclutamiento.md) — detalle completo del submódulo de Reclutamiento (más actualizado que este archivo en lo suyo).
- [movimientos-personal.md](movimientos-personal.md) — detalle completo de entrada/salida de guardias (punto 6).
- ⚠️ `C:\Users\leidy\.claude\plans\analiza-este-problema-parallel-pudding.md` — la herramienta de planificación reutiliza nombres de plan entre sesiones; a partir del 2026-09-09 esa ruta contiene el plan del pivote de Entidades/Cumplimiento a Drive (punto 3), **no** el plan de rediseño visual de Reclutamiento que se referenciaba aquí antes. Si necesitas el plan viejo de Reclutamiento, ya no está en esa ruta — no asumir que sigue ahí.
