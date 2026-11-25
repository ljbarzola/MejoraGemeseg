# Modulo: Contratacion Publica

Contratos de seguridad privada con entidades (SERCOP): entidades, contratos, puestos, horarios con patron de rotacion, entregas de documentos entre areas, informes mensuales `.docx`, dashboard. Backend `backend/src/modules/contratacion-publica/`, frontend `frontend/src/pages/contratacion-publica/`. Contratos, Horarios, Bitacoras, Codigos de turno y horas son del modulo **Operaciones** (`/operaciones`, seccion `OPERACIONES`; `.agents/modules/operaciones.md`): API, tablas y reglas de abajo siguen igual; donde diga «Contratacion Publica» para esas pantallas, leer Operaciones. Aqui quedan Dashboard, Entidades Publicas, Por aprobar, Por entregar y Configuracion. Pantallas con `CPPageHeader`.

## Descripcion
Seccion `CONTRATACION_PUBLICA`. Usuario nuevo nace sin permisos (dar «ver» a mano). Usuarios antiguos sin filas de `UserPermission` tienen «escribir» por defecto; `SISTEMAS` es la excepcion (sin fila no hay acceso). Para dejar a alguien en solo «ver» hay que guardarle sus permisos.

## Submodulos backend
`entidades/`, `contratos/` (renovacion = `contratoOrigenId`, adendas, adjuntos), `puestos/` (guardias = snapshot cedula+nombre sin FK a RRHH, a proposito), `codigos-turno/`, `horarios/`, `informes/`, `textos-institucionales/` (oculto), `entregas/`, `bitacoras/`, `dashboard/`.
Rutas bajo `/contratacion-publica/`: `entidades`, `entidad-campos`, `contratos`, `puestos` (+ `:id/guardias`, `:id/patron-rotacion`, `.../preview`), `codigos-turno`, `horarios` (+ `:id/celdas`, `celdas/reemplazar-puesto`, `generar-patron`, `intercambiar-turno`, `estado`, `pdf`, `excel`), `informes`, `textos-institucionales`, `entregas/...`, `bitacoras/...`, `dashboard`.

## Puesto de Servicio
`CPPuestoServicio`: `tipoTurno` 8H|12H|24H, `cantidadGuardias`, `guardiasSimultaneosRequeridos` (default 1; minimo de guardias trabajando cada dia, con o sin generador), `patronRotacion` (uno por puesto).

## Codigos de Turno
`CPCodigoTurno`: `codigo, nombre, color, activo, esDescanso, esCustodia, horaInicio/horaFin` (fin menor que inicio cruza medianoche).
- Un codigo es de UN solo tipo (el servidor lo fuerza): «Turno en el puesto», «Descanso o libre» o «Dia de custodia». Explicito, no se infiere del nombre.
- Descanso y custodia **no cubren el puesto** (cobertura minima, «Hoy en los puestos», bitacoras, reemplazos, faltas: `esDescanso || esCustodia`). La custodia **sigue siendo trabajo** para el cruce con Custodias. No se pide hora para custodias.
- `esCustodia` y las horas se aseguran al arrancar (`prisma/cp-codigo-turno-horas.schema.ts`; si fallan el servidor no arranca).

## Horario Mensual — rango de fechas libre
`CPHorarioMensual`: `fechaInicio/fechaFin` (casi nunca mes calendario; `anio/mes` solo etiqueta derivada), `estado` BORRADOR|ENVIADO|APROBADO|RECHAZADO. `CPHorarioCelda`: fila por guardia x dia, `@@unique([horarioId, puestoId, cedula, fecha])`; reemplazo por puesto = `deleteMany` + `createMany`.
- **Sin solapamiento** con otro horario del mismo contrato, sea cual sea su estado (`assertSinSolapamiento`). Maximo 62 dias.
- `BORRADOR -> ENVIADO -> APROBADO/RECHAZADO`, `RECHAZADO -> BORRADOR`. Solo se edita, genera patron o intercambia en BORRADOR (`assertEditable`).
- `GET /horarios` acepta `contratoId` opcional. «Nuevo horario» propone desde el dia siguiente al ultimo horario del contrato hasta el fin de su ciclo.
- **Eliminar**: cualquier estado. No borrador: `GET horarios/:id/relacionados` (informes, faltas «No llegó», bitacoras) y el servidor exige `?confirmar=true`. Los informes se desvinculan (no se borran); faltas y bitacoras se conservan.
- El editor vuelve a donde se vino (`location.state.volverA`); el detalle de contrato lee `?tab=`; «Crear horario» desde Puestos abre Horarios con `?nuevo=1`.

## Generador de Patron de Rotacion
`calcularPatronRotacion` (`shared/patron-rotacion.util.ts`): misma funcion para preview y generacion real. `CPPatronRotacion`: `tramos [{codigoTurno,dias}]`, `coberturaSimultanea`, `ordenGuardias` (define el desfase), `fechaInicioCiclo`.
- `ciclo` = suma de dias; `numGrupos = guardias / cobertura` y `desfase = ciclo / numGrupos`, ambos enteros o se bloquea (evita cobertura despareja). El grupo `g` arranca desfasado `g * desfase`. Ej.: 3 guardias, cob. 1, 2D-2N-2L: G1 `DDNNLL`, G2 `LLDDNN`, G3 `NNLLDD`.
- `generar-patron` guarda el patron (si `guardarComoPatronDelPuesto`, default true) y reemplaza celdas en transaccion; el frontend pide confirmacion si ya habia celdas.

## Cobertura minima de guardias simultaneos
Cada dia y puesto debe tener al menos `guardiasSimultaneosRequeridos` guardias con codigo que cubra puesto. Se valida **solo** en `cambiarEstado` al pasar `BORRADOR -> ENVIADO`; si falla, bloquea y devuelve **todos** los incumplimientos, una linea cada uno (`white-space: pre-line`).

## Intercambio de turno
`POST horarios/:id/intercambiar-turno`: entre dos guardias del **mismo puesto** (`puestoId` obligatorio) en una fecha. Solo BORRADOR.

## Exportar PDF y Excel
`getPdfData` alimenta `CPHorariosPdfService` (PDFKit, A4 apaisado) y `CPHorariosExcelService` (ExcelJS, colores como la UI).

## Frontend
Carpetas `horarios/`, `puestos/`, `config/` (`HorarioMensualEditor`, `GeneradorPatronModal`, `PuestoFormModal`, `CodigosTurnoConfig`).

## Casos de uso de verificacion
Validos: patron 3/1 y 6/2, rango que cruza mes. Invalidos: cobertura que no divide los guardias, ciclo no divisible, solape, dia bajo el minimo, editar fuera de BORRADOR, intercambio con cedulas de otro puesto.

## Plantilla del informe mensual: descarga real
`upsertPlantilla` descarga el `.docx` (`common/utils/drive-docx.util.ts`; rechaza enlace no publico o no Word); `generarPdf` la rebaja si el archivo ya no esta (disco efimero). Tambien se sube como archivo (ver «Informe mensual en Word»).

## Submódulos ocultos
Textos Institucionales sigue oculto (`CP_MOSTRAR_SUBMODULOS_OCULTOS` en `App.tsx`; rutas inexistentes `/contratacion-publica/...` redirigen a Entidades; `TextosInstitucionalesConfig` aun con encabezado a mano). Los informes se alcanzan desde la pestana Informes del contrato. Operaciones se muestra con `CP_MOSTRAR_OPERACIONES`. El bloque `CONTRATACION_PUBLICA` de `ai/system-guide.util.ts` (guia del Agente Gemeseg) debe describir solo lo visible; `system-guide.util.spec.ts` lo verifica.

## Entregas de documentos de otras áreas
Pide y sigue los documentos que otras areas producen para el informe mensual, dentro de la entidad (`/contratacion-publica/entidades/:id`). Armar el paquete y enviarlo a la entidad no existe.

**Decisiones** (no re-proponer lo contrario):
- Documentos de la **entidad**, no del contrato. **Cada mes es una solicitud independiente** (`CPSolicitudMensual`, unica por entidad+anio+mes), editable siempre. «Copiar la solicitud anterior» duplica documentos, fechas (mismo dia, o el ultimo del mes) y personas activas.
- Cada documento: uno o mas responsables y fecha limite. CP aprueba o rechaza (rechazo exige motivo, minimo 5 caracteres).
- Entrega por archivo o enlace; archivos a **Drive** (`<raiz>/<Entidad>/<AAAA-MM>/`), no a disco ni base.
- Avisos por notificacion y correo. Otras areas: «ver»; con solo «ver» solo ven y entregan lo asignado.

**Modelos**: `CPSolicitudMensual` (BORRADOR/ENVIADA), `CPEntregaDocumento` (PENDIENTE/ENTREGADO/APROBADO/RECHAZADO, `fechaLimite @db.Date`, `origen` ARCHIVO/ENLACE, quien entrego/reviso como instantanea sin FK, `ultimoRecordatorioAt`), `CPEntregaResponsable`, `CPEntregaHistorial` (`accion`, `motivo`, `origen`, quien actuo; se escribe en la **misma transaccion** que el cambio de estado; no guarda la URL).

**Reglas**:
- BORRADOR: nadie recibe avisos ni lo ve con solo «ver» (las bandejas solo muestran ENVIADAS); aviso amarillo en el detalle. «Enviar» exige al menos un documento y responsable en todos; un aviso por persona.
- ENVIADA: agregar persona -> «Nuevo documento»; cambiar fecha -> aviso y reinicia recordatorio; quitar -> pierde acceso sin aviso.
- Entregar: responsable o CP; no en BORRADOR ni sobre APROBADO; re-entregar limpia motivo y revision. Aprobar solo desde ENTREGADO; rechazar desde ENTREGADO o APROBADO.
- `EntregasService.avisar` es a prueba de fallos (se registra, no interrumpe). Correos con remitente fijo de CP (`CORREO_REMITENTE_CP`, `NOMBRE_REMITENTE_CP` en `entregas.service.ts`; la casilla necesita delegacion de dominio); no usar `NotificationConfig` (es de RRHH). Fechas en zona Ecuador (`entregas.util.ts`).
- Al entregar se avisa por campana (sin correo) a todo el personal CP que revisa (`equipoQueRevisa`, `PermissionsService.getCompanyUserIdsWithWriteAccess`).
- **Recordatorio manual** `POST documentos/:id/recordar` (write, con confirmacion): campana+correo a responsables de un documento PENDIENTE/RECHAZADO de solicitud ENVIADA; 400 si borrador, entregado/aprobado o sin responsables. No toca `ultimoRecordatorioAt`.
- **Recordatorios diarios**: `POST /contratacion-publica/entregas-cron/recordatorios` con `x-cron-secret` = `CRON_SECRET` (sin variable 404, mal 401); lo llama Cloud Scheduler (un `@Cron` no es confiable con `min-instances=0`; ver `CLAUDE.md`). PENDIENTE/RECHAZADO a 3 dias del limite y el mismo dia, una vez por dia por documento. Sin el trabajo de Scheduler no se envia nada. El resumen diario aun no muestra el ciclo.

**Endpoints** (`/contratacion-publica/entregas`): `GET|PUT carpeta`; `GET|POST entidades/:entidadId/solicitudes`; `GET|DELETE solicitudes/:id`; `POST solicitudes/:id/enviar|documentos`; `PATCH|DELETE documentos/:id`; `POST documentos/:id/archivo` (sube a Drive, `{url}`), `entregar`, `aprobar`, `rechazar`, `recordar`; `GET documentos/:id/archivo|historial`; `GET mis-documentos` (view; «Por entregar» en pantalla), `GET por-revisar` (write; «Por aprobar»). Las rutas y archivos conservan los nombres viejos (no romper enlaces ni notificaciones guardadas). Declarar bandejas **antes** de rutas con `:id`. Armar, enviar, aprobar, rechazar, carpeta = `write`; listar, abrir, subir, entregar = `view` + comprobar en el servicio que es responsable (o `write`).

**Frontend**: `entidades/EntidadDetail.tsx`, `MisDocumentosPage`, `PorRevisarPage` (redirige a Mis documentos sin `write`), `RevisionPanel`, `HistorialEntrega`, `EntregarModal`. Avisos enlazan a `/contratacion-publica/entidades/:id?solicitud=:sid`.

## Carpeta única de Drive para todo Contratación Pública
Una raiz (`FolderConfig` `CP_ENTREGAS`, por empresa; Configuracion -> Carpeta de Drive, `CarpetaDrivePanel.tsx`, `DriveService.saveConfig` valida leyendola) con **una subcarpeta por entidad**. Compartida como Editor con la cuenta de servicio; sin carpeta solo hay enlaces y no hay vista previa.
- `CPEntidadPublica.driveFolderId` ancla la entidad por ID (renombrar no crea otra). El servicio rechaza nombres repetidos (sin mayusculas ni espacios).
- Crear/renombrar entidad crea/renombra su subcarpeta; si Drive falla guarda igual y devuelve `advertenciaDrive`. Editar una entidad sin carpeta **no** la crea (la ofrece la sincronizacion).
- `POST entidades/sincronizar-drive` **solo informa** (`carpetasSinEntidad`, `entidadesSinCarpeta`, nombre distinto, carpeta ausente); lo unico automatico es enlazar por nombre exacto. Nunca renombra ni borra en Drive sola; un fallo de Drive vuelve como `warning`. Una consulta (`listSubFolders`). Corre al abrir la lista (maximo cada 2 min por pestana, `sessionStorage`) y con «Sincronizar».
- Acciones del aviso: `POST entidades/desde-carpeta` (`{folderId}`; comprueba que cuelga de la raiz y no es de otra entidad: el id lo manda el navegador) y `POST :id/drive/crear-carpeta|usar-nombre-de-drive|usar-nombre-del-sistema|recrear-carpeta`.
- La entidad nunca se borra sola; archivar no borra su carpeta ni archivos. Helpers `entidad-folder.util.ts`; `subirArchivo` usa `carpetaDeEntidad`.
- Esquema aditivo e idempotente; `cloudbuild.yaml` no aplica migraciones: aplicar a Cloud SQL antes de desplegar.

## Revisión de entregas entre áreas: panel dividido, historial y bandejas
- **Panel dividido**: archivo a la izquierda; datos, historial y decision a la derecha; «‹ n de m ›» y avance automatico al siguiente por revisar. Rechazo = motivos rapidos (`utils/motivosRechazo.ts`, compartidos con RRHH) + texto libre + historial (sin hilo de conversacion).
- **Vista previa = proxy del servidor** (`EntregasService.obtenerArchivo`, `GET documentos/:id/archivo`): los archivos son de la cuenta de servicio. Solo `origen=ARCHIVO` y comprueba con `DriveService.getFileMetadata` que cuelga de la **carpeta del mes** de esa entidad y no esta en papelera (la URL la manda el navegador: sin eso leeria cualquier archivo). Enlace externo -> 404 amable con «Abrir enlace»; ZIP -> «Descargar». Permiso: CP `write` o responsable (`assertPuedeVer`). Limite 15 MB. `?descargar=1` da el original.
- **Word/Excel -> PDF** con LibreOffice (`common/utils/office-to-pdf.util.ts`): uno a la vez, 60 s, perfil compartido en `os.tmpdir()/gemeseg-soffice-perfil`, reintenta una vez borrando el perfil; `LIBREOFFICE_PATH` o `soffice` (la imagen ya lo trae). Cache solo en memoria (`pdfsConvertidos`, 40 MB, clave = id de Drive); no se guardan PDFs en Drive. Fallo -> 503 amable; `FilePreview` muestra el motivo (leer el Blob) y ofrece «Descargar el archivo» y «Abrir en Drive».
- **Excel `.xlsx` como cuadricula**: `common/utils/excel-hojas.util.ts` (`leerLibroExcel`, exceljs) devuelve JSON (estilos, texto ya formateado a mano porque exceljs no formatea numeros, combinadas, paneles, ocultos, colores); sin graficos, imagenes ni formato condicional. Tope 1000 filas x 80 columnas por hoja; `LOCALE_NUMEROS='de-DE'`. Respuesta `application/json`; si no se lee cae al PDF; `?formato=pdf` fuerza PDF; `.xls` y Word van por PDF. Visor `components/common/ExcelViewer.tsx`. No incrustar la vista de Drive (Google bloquea el login en iframe).
- **Reemplazar o conservar el anterior**: si ya habia archivo (`origen='ARCHIVO'`, RECHAZADO o ENTREGADO sin revisar), `EntregarModal` obliga a elegir «Reemplazar el anterior» / «Conservar ambos» (sin opcion marcada; la pregunta es para quien entrega). `entregar` acepta `reemplazarAnterior`; `borrarArchivoAnterior` borra definitivo (`DriveService.deleteFileById`) **antes** de registrar; si Drive falla, 503 y no registra. Solo borra si cuelga de la carpeta del mes, no esta en papelera, no es el archivo nuevo y ninguna otra entrega usa el enlace; 404 no es error. Fuga conocida: el archivo se sube al elegirlo; cerrar sin entregar deja un huerfano. `FileOrLinkInput` tiene `defaultMode` (la entrega abre en «Subir archivo»).

## Entidades: archivar, campos configurables, sincronización a pedido, vista previa de Word/Excel y nombres
- **Una entidad NO se borra desde la app, solo se archiva** (no hay `DELETE`): borrar no borraba su carpeta y la sincronizacion la reofrecia. `POST entidades/:id/archivar|reactivar` (sin confirmacion), `GET entidades?archivadas=true`. La archivada sigue anclada a su carpeta, sus solicitudes siguen en bandejas hasta resolverse y no genera avisos. `CPContrato.entidad` es `RESTRICT`.
- **Campos extra**: `CPEntidadCampo` (`nombre`, `tipo` TEXTO|LISTA|NUMERO|FECHA, `opciones`, `obligatorio`, `orden`, `activo`; unico por empresa+nombre); valores en `CPEntidadPublica.camposExtra` (JSON `{idCampo: valor}`). Solo se desactivan (valor conservado, tipo inmutable). De fabrica: *Tipo de entidad*, *Contacto*, *Telefono de contacto*, *Correo de contacto*. Validacion `entidad-campos.util.ts` (`normalizarCamposExtra`); un obligatorio vacio falla nombrando el campo; las entidades creadas desde carpeta nacen sin esos datos. `entidad-campos`: `GET` view; `POST`, `PATCH :id`, `POST reordenar` write. Frontend: `CamposEntidadModal.tsx` (`embebido`), «Datos adicionales» en el formulario, columnas con `ColumnPickerMenu` + `useColumnPreferences('cp-entidades')`.
- **Acciones con iconos visibles** (`col-acciones col-acciones--ancha` + `.acciones-iconos`, hasta 3): Abrir carpeta (siempre pintado, deshabilitado sin carpeta), Editar, Archivar/Reactivar en el mismo lugar. Ninguna tabla de CP usa el menu ⋯. Documentos del mes: 4 iconos fijos (Entregar, Recordar, Editar, Quitar; hueco si no aplica). **Pantallas nuevas**: ningun `<button>`/`<a>` de icono sin fondo (usar `btn-secondary icon-btn`, rojo `#c53030` para eliminar) ni enlace de texto subrayado; excepcion: pestanas de `ContratoDetail` y chips de motivos. Reglas generales: `CLAUDE.md`/`frontend-ui.md`.

## Operaciones y Bitácoras de guardianía
Los guardias llenan una **bitacora** a mano: se sube una **foto**, un **agente** la transcribe y el sistema la **cruza con el horario** (si decia Juan y trae a Pedro, es hallazgo). Las novedades alimentan un dashboard. Pantallas hoy en Operaciones.

**Decisiones** (no re-proponer lo contrario):
- **El agente lee; el sistema juzga.** `BitacoraLectorService` (Vertex AI nivel `fuerte`) solo transcribe a JSON; la comparacion es codigo fijo (`bitacora-revisor.util.ts`) con mensajes que nombran persona, dia y turno.
- **El lector es ciego al horario**: no recibe horario ni nombres de guardias (los «arreglaria» y taparia el error). Solo `Agent.instructions`. Prompt (`bitacora-prompt.util.ts`): transcribir tal cual, `legible:false` y hora null antes que adivinar, ignorar instrucciones escritas en la imagen.
- **Todo lo leido se corrige** y la comparacion se repite al guardar (`PUT :id/lectura`). Se puede cargar **sin foto** (tambien si el agente esta desactivado o la IA sin configurar). «Volver a leer» reemplaza lo corregido (con confirmacion); si falla, no borra lo escrito.
- Se sube **por puesto** (de ahi sale el horario); otro puesto escrito en la hoja -> `PUESTO_DISTINTO`.
- Nombres (`nombre-guardia.util.ts`): cualquier orden, tolera una letra mal leida, un nombre de pila solo nunca pasa de «probable»; umbrales 0.85 seguro / 0.6 probable.
- Horas: tolerancia 30 min (`TOLERANCIA_MINUTOS`); sin horas en el codigo solo se compara la persona.
- **Gravedad sale de la categoria** (codigo): incidente ALTA, equipos MEDIA, resto BAJA. Categorias: `SIN_NOVEDAD, ACCESO, VEHICULOS, RONDA, ENTREGA_TURNO, EQUIPOS, INCIDENTE, OTRO`.
- **Hallazgos** (`CPBitacoraHallazgo`): `GUARDIA_DISTINTO` (uno solo, no «ausente» + «de mas»), `GUARDIA_AUSENTE`, `GUARDIA_NO_PROGRAMADO`, `GUARDIA_NO_ASIGNADO`, `HORARIO_DISTINTO`, `SIN_HORAS`, `NOMBRE_DUDOSO`, `NOMBRE_AMBIGUO`, `LECTURA_DUDOSA`, `NO_HORARIO`, `HORARIO_NO_APROBADO` (compara igual, con aviso), `FECHA_FUERA_DE_CONTRATO`, `PUESTO_DISTINTO`, `FECHA_YA_CARGADA`. Resolver/descartar exige **nota** y queda en historial; se conserva lo resuelto si la `clave` coincide. Resultado: `CONFORME | A_REVISAR | CON_ERRORES | SIN_COMPARAR | SIN_REVISAR`.
- **Dashboard** `GET bitacoras/dashboard` (ultimos 90 dias por defecto): % que cuadran, hallazgos abiertos/graves, novedad mas repetida, dias y puestos con mas novedades.
- **Permisos**: `OPERACIONES` (ver = mirar; escribir = subir, corregir, resolver, borrar), con la seccion habilitada a la empresa (super admin).

**Como esta hecho**: carpeta `bitacoras/` (controller, service, `bitacora-lector.service.ts` con JPG/PNG/WebP/HEIC o PDF max 15 MB, `bitacora-revisor.util.ts`, `nombre-guardia.util.ts`, `bitacora.util.ts`, `bitacora-prompt.util.ts`). Rutas: `GET opciones|agente|dashboard`, `GET` lista, `POST` multipart `archivo`+`puestoId`, `GET :id|:id/archivo`, `PUT :id/lectura`, `POST :id/releer`, `PATCH hallazgos/:hid`, `DELETE :id`. Tablas `CPBitacora`, `CPBitacoraRegistro`, `CPBitacoraNovedad`, `CPBitacoraHallazgo` (puesto, contrato y entidad como **instantanea sin relacion**) y `AgentRun`, creadas al arrancar (`bitacoras.schema.ts`, `agents/agent-run.schema.ts`). La foto vive en `StoredFile`.

**Agente** (`.agents/modules/agents-ai.md`): «Agente Revisor de Bitacoras» (`Agent.scope='BITACORAS'`, sin dueno, sembrado por `AgentRunService`) **trabaja solo, no conversa**; cada lectura queda en `AgentRun`; se puede desactivar y editar sus instrucciones (`agents/agent-trabajadores.const.ts` tiene su documentacion).

**Pendiente**: la lectura real de fotos con Vertex no esta probada con hojas reales (la letra a mano es el riesgo); avisar por campana cuando una bitacora salga «Con errores».

## Menú, encabezados y Configuración unificados
- **Una sola «Configuracion»** (`/contratacion-publica/configuracion?pestana=campos|drive`, `config/ConfiguracionPage.tsx`); Codigos de turno y Horario de los turnos pasaron a Operaciones. Lo que sale de una pantalla deja un enlace a su pestana (`components/common/MovidoAConfiguracion.tsx`).
- **Encabezado estandar** `CPPageHeader.tsx`: «Contratacion Publica» como modulo, descripcion bajo el titulo, botones al pie («Como funciona» primero, principal al final); los detalles llevan el mismo encabezado sin ayuda. Panel `CPComoFunciona.tsx` igual en todas las pantallas principales.

## Agente Revisor de Entregas en «Por aprobar»
Un agente mira cada documento entregado y deja una nota: **«Parece correcto»** o **«Revisar»** con motivo. **Solo sugiere**; aprobar y rechazar son de una persona.
- Se revisa **solo al entregar**. Mira firma o sello, vigencia y que se lea (si no, «Revisar»). Compara el **periodo que el propio documento dice cubrir** con las **fechas del ciclo** de la solicitud (ver «Periodos por ciclo»); si no lo toca, «Revisar» con rechazo propuesto; un periodo que cruza mes vale para ambos; si no dice periodo, no se compara. El modelo no recibe el mes (lo compara `evaluarEntrega`). Riesgo: un documento legitimamente de otro mes sale «Revisar». **No** comprueba que sea lo pedido.
- El modelo (Gemini, `modeloVertex('fuerte')`) **describe**: `legible`, `tipoDocumento`, `seFirma`, `firmaOSello` (SI/NO/DUDOSO), `fechaVencimiento` si la escribe. El veredicto es codigo fijo (`evaluarEntrega`): «Revisar» si no se lee, si se firma y no se ve (o dudoso), o si el vencimiento escrito ya paso (dia de Ecuador); sin vencimiento: «no dice fecha de vencimiento».
- Codigo en `entregas/revision-ia/`. PDF e imagenes directo; Word y Excel por la conversion de la vista previa (`obtenerArchivo(id, actor, true, true)`, comprueba carpeta del mes). Enlace externo, ZIP y >15 MB: `NO_LEIDO` con motivo, sin IA.
- Tabla `CPEntregaRevisionIA` (una fila por documento, creada al arrancar por `EntregaRevisorService.onModuleInit`; FK en cascada). Guarda `entregadoAt`: si se entrega de nuevo la revision deja de valer sola (no se toca `EntregasService.entregar`).
- **Quien la dispara**: el navegador de quien entrega, con peticion propia justo despues de entregar (`EntregarModal` -> `POST documentos/:id/revision-ia`; no frena la entrega; un trabajo en segundo plano moriria en Cloud Run). Si cierra la pestana, el panel de revision la pide al abrirse (una vez). Una terminada no se repite (salvo error o «Volver a revisar» de CP); «revisando» de mas de 3 min se da por perdida.
- Endpoints: `POST documentos/:id/revision-ia` (`view`; responsable o CP; quien entrega solo recibe el estado), `GET documentos/:id/revision-ia` y `GET revision-ia?ids=1,2` (`write`). Frontend: `RevisionIA.tsx` (sondea cada 4 s), etiqueta en `PorRevisarPage`. Agente `ENTREGAS` (`SCOPES_SIN_CHAT`, sembrado por `AgentRunService`); cada revision en `AgentRun` (`REVISAR_ENTREGA`).

## Importar un horario desde Excel
- Horario en **Borrador**, «Importar Excel» -> modal con **vista previa**; nada se guarda hasta «Importar». `POST horarios/:id/importar-excel` (`?hoja=`, `?aplicar=true`; el archivo se relee al aplicar). Codigo: `horarios-importar.util.ts`, `horarios-importar.service.ts`, `ImportarExcelModal.tsx`.
- **Formato**: bloque por puesto = fila de titulo, cabecera «NOMBRES Y APELLIDOS» (con «CEDULA» opcional) y numeros de dia, filas de gente con su codigo, fila vacia cierra. Las fechas siguen el **rango del horario**, no el mes calendario. No entiende «PUNTO DE SERVICIO / ITEM / NOMBRES».
- **Reglas**: puesto = nombre igual o contenido (con dos candidatos no adivina); guardia por cedula, si no por nombre (cualquier orden, minimo 2 palabras); **solo guardias ya asignados al puesto** (los demas «no asignado»); se reemplazan los turnos **solo de quienes vienen en el Excel**; un **codigo desconocido bloquea todo** hasta crearlo.

### Códigos de turno de `HORARIO Gemeseg 2026.xlsx`
- `NKG`, `DTM`, `DCC` (noche Kia Galpon, dia Top Motor, dia Ceibos Center): la persona **cubre otro puesto de la hoja**. `TM` = nombre antiguo de `DTM`. `DC` = dia de custodia. `F` = falto (no cubre). `VACACIONES`: ausencia. `D/8`, `D/9`, `D/10`, `D10` = dia con jornada de 8, 9, 10 horas (hipotesis; `D10` = `D/10`).
- Sin explicar: `HY` (parece fin de semana), `X`, `S/F`, `EMP`, `D/N` (parece 24 h).
- Palabras escritas una letra por celda («DESCANSO», «MEDICO», «VACACIONES»): `quitarPalabras` las reconoce, no las importa y avisa; esos dias quedan vacios.

## Horario ejecutado y vínculo con Custodias
- «Ejecutado» en el horario (cualquier estado): programado + faltas «No llegó» (`CPAusencia`, no anuladas) y quien las cubrio + cruce con Custodias. **No guarda ni cambia el horario**; codigo fijo (`horario-ejecutado.util.ts`, `horarios-ejecutado.service.ts`). `GET horarios/:id/ejecutado` y `.../ejecutado/excel` (`F` = falto).
- Quien falto queda vacio («nadie lo cubrio» o «cubrio X»); el reemplazo hace el turno de quien falto aunque tuviera libre (o se agrega como celda nueva).
- **DC <-> Custodias**: usa `custodio1Cedula` y `custodio2Cedula` de `Custodia` (no el chofer) y el **dia de Ecuador** de `fechaHoraSalida`. Solo avisa: «marcado como custodia pero sin custodia registrada» y «tiene la custodia X pero su turno es Y». Un «No llegó» sobre dia de custodia se rechaza.

## Preguntas pendientes para Contratación Pública / Operaciones
1. Hora de entrada de `D/8`, `D/9`, `D/10`. 2. Significado de `HY`, `X`, `S/F`, `EMP`, `D/N`. 3. ¿`DC` cuenta como trabajando en el puesto? 4. Reglas de pago escritas en comentarios del libro (horas extra por feriado, «24 HORAS X FALTO…»): ¿quien las usa? 5. ¿Hay entidades con contratos de cortes distintos? 6. ¿Cuando llegan las bitacoras? Decide si se puede confirmar una falta desde la bitacora («No llegó» solo acepta hoy y hasta 7 dias atras).

## Informe mensual en Word con la plantilla de la empresa
- Pestana **Informes** del contrato -> «Nuevo informe» -> `/contratacion-publica/informes/:id` con «Descargar Word» (editable) y «Generar PDF». Codigo: `informes/informes.service.ts` (`rellenarPlantilla`, `generarDocx`, `generarPdf`, `subirPlantilla`), `informe-datos.util.ts` (`fechaLarga`, `montoEcuador`), `PlantillaInformeConfig.tsx` (Operaciones -> Configuracion). Tipos: base (Alausi, 1 puesto) y Ministerio.
- **Plantilla = el propio Word de la empresa** con marcadores `[...]` (conserva logo, cabeceras, textos fijos). Se sube con `POST informes/plantilla/archivo` (copia en `StoredFile`, no depende de Drive). Hasta 5 por empresa (`CPPlantillaInformeArchivo`, creada al arrancar; `CPInformeMensual.plantillaId`); cada informe elige una (sin elegir = la primera); al eliminar una, sus informes pasan a la primera. Sin secciones opcionales: una plantilla por tipo de informe.
- **Marcadores** `[...]`: entidad (`[Entidad]` en mayusculas), contrato, tipo de compra, administrador y cargo, periodo, fechas del informe e inicio de servicio, duracion, `[DescripcionPuestos]`, `[Retroalimentacion]`, `[Conclusiones]`, `[TablaLugar]`, `[TablaPersonal]` y claves de Textos institucionales. Ministerio: fechas largas, `[PlazoDias]`, `[MontoOrden]`, `[Objeto]`, `[TablaArmamento]`/`[TablaUniformes]` (una fila por **puesto del contrato**) y `[TablaCronograma]` (persona x dia con el codigo del horario aprobado, hasta 62 dias, en hoja horizontal con dos saltos de seccion). Los nombres exactos estan en `informes.service.ts` (`rellenarPlantilla`). Un marcador debe estar escrito **de corrido** en el Word (si Word lo parte en formatos, no se reconoce).
- **Datos** (columnas opcionales creadas al arrancar en `src/prisma/cp-informe-datos.schema.ts`): `CPContrato.administradorNombre/administradorCargo/tipoCompra/diaCorte` (la renovacion los hereda), `fechaEmisionOrden/fechaAceptacionOrden/fechaSuscripcionOrden/plazoDias` (**no** se heredan), `CPPuestoServicio.canton/edificio/ubicacion`. La pantalla del informe avisa que falta y donde se llena.
- **Periodo**: el del horario aprobado (puede cruzar mes); sin horario, el ciclo del contrato. Al crear se busca el aprobado de ese anio/mes y, con corte, el que **toca el ciclo**. Informe unico por contrato/anio/mes. Fecha del informe = dia despues del fin del periodo.
- **Conclusiones**: vacias -> sugerencia con las bitacoras del periodo (sin bitacoras nada; sin novedades relevantes la frase de siempre; con incidente, equipos o gravedad media/alta las lista). Editable.
- **Ministerio**: las 25 tareas SI/NO van en SI (editables en el Word); polizas y autorizacion de uniformes son texto fijo con vigencia (la autorizacion citada esta vencida: actualizar en la plantilla). A mano cada mes: valor de la factura y sus letras (`[completar: …]`), polizas con fechas, fotos, cifras fijas, y los textos que nombran un puesto concreto o edificios concretos.

## Periodos por ciclo del contrato
- **Decision**: «dia de corte + etiqueta». La solicitud de «Por entregar» **sigue siendo de un mes calendario** (unica por entidad/anio/mes, carpeta `AAAA-MM`); cambia **que fechas cubre**: con corte 24, la de septiembre va del 24 ago al 23 sep. El ciclo se nombra por el mes en que termina. No rehacer las solicitudes por rango de fechas (cambia clave unica, carpetas y casi todas las pantallas).
- `CPContrato.diaCorte` (1-31; nulo o 1 = mes calendario; «Dia en que empieza el ciclo mensual» en Editar contrato). Un dia que el mes no tiene se ajusta al ultimo.
- `shared/ciclo.util.ts` (`cicloDelMes`, `cicloTextoCorto`, `corteDeEntidad`) y su copia web `utils/cicloMensual.ts` (**mantener iguales**). **Corte de una entidad** = el que comparten sus contratos ACTIVOS con corte; sin ninguno o distintos, mes calendario, sin aviso en pantalla (`EntregasService.cortesPorEntidad`).
- Se ve en solicitudes, detalle, bandejas (`periodoCiclo`, `tituloMes(anio, mes, ciclo)`), avisos, informe y «Nuevo horario». Limitaciones: el resumen diario de recordatorios y la tabla del contrato no muestran el ciclo.

## Ajustes tras la primera prueba
Ventanas con `modal-actions` (no `modal-footer`); opciones de tipo + «Activo» alineadas en Codigos de turno.

## Importar contrato desde Excel, varias plantillas y «Ver detalle»
- **Importar contrato, puestos y horario** («Importar desde Excel» junto a «Nuevo contrato»): asistente de una ventana: libro, hoja, **marcar los puestos del contrato** (el libro mezcla clientes), entidad, numero, objeto, fechas, corte, tipo de compra, administrador y periodo. **Todo o nada**: contrato, un puesto por bloque marcado (8 h si usa D/8, D/9 o D/10; si no 12 h; editable), guardias y un **horario en borrador**; luego importa turnos con el importador de horarios. Codigo: `horarios/importacion-contrato.service.ts` y `.controller.ts` (`POST contratacion-publica/importacion/analizar|aplicar`), `ImportarContratoModal.tsx`, `CPHorariosImportarService.leerLibro`.
- Reglas: la entidad debe existir (el asistente deja crearla solo con nombre); titulo repetido crea solo el primero; con **codigos sin configurar** contrato y puestos se crean y el horario queda vacio en borrador con aviso; maximo 62 dias.
- **Periodo de la hoja** (`periodoDeHoja`): mes por el nombre de la hoja y rango por las columnas (primer dia de la primera columna + cantidad; el anio deja la fecha mas cerca de hoy). Sin mes en el nombre se piden fechas; si la primera columna no es el dia 1 se propone tambien el corte.
- **Personas sin cedula** (basta el nombre): si coincide con alguien de RRHH (`EmployeeDriveFolder`, cualquier orden) se asigna con su cedula real; si no, queda **sin cedula** (vacia en pantalla, PDF y Excel). Por dentro lleva clave `SC-XXXXXXXXXX` (hash del nombre) porque la base exige clave unica por persona y puesto; nunca se muestra (`cedulaMostrable`). No se crea ficha en RRHH. Pendiente: pantalla para cambiar la clave por la cedula real.

## Plantilla del informe del Ministerio
Ver «Informe mensual en Word con la plantilla de la empresa».

## Dashboard de entidades, sector y provincia
- `/contratacion-publica` («Dashboard», primero del submenu). Filtros «Tipo» (publicas y privadas / solo publicas / solo privadas) y «Periodo» como el Dashboard de Ventas. Cifras: entidades, con contrato vigente (`ACTIVO` y hoy entre inicio y fin), vencen en 30/60/90 dias, valor vigente.
- Tarjetas: «Datos por completar» (RUC, direccion, sector, provincia, contrato, numero «POR COMPLETAR», valor, administrador; «Completar» abre `?editar=<id>` o el contrato con `?editar=1`), «Contratos y vencimientos», «Entregas de documentos» (con fecha limite en el periodo), «Entidades por provincia» (`PROVINCIAS_EC`) y, con acceso a Operaciones, «Bitacoras y hallazgos» y «Faltas y supervision». Las de «Hoy» no dependen del periodo.
- `GET /contratacion-publica/dashboard?tipo=&desde=&hasta=` (`CONTRATACION_PUBLICA`, lectura): `dashboard/cp-dashboard.service.ts` trae filas, `cp-dashboard.util.ts` (puro, con pruebas) cuenta.
- Campos de la entidad: `sector` (lista segun tipo; publica: Ministerio, GAD, Empresa publica, Salud, Educacion, Seguridad, Otra; privada: Industria, Comercio, Residencial, Agricola, Otra), `provincia` (24), `canton`; columnas nulas creadas al arrancar (`cp-informe-datos.schema.ts`). Listas en `entidades/entidad-clasificacion.util.ts` y copia `frontend/src/utils/entidadClasificacion.ts` (**cambiar las dos**). Cambiar el tipo vacia un sector que ya no corresponde.
- Pendiente de decidir: el campo propio «Tipo de entidad» se pisa con «Sector» (propuesta: desactivarlo).

- **2026-11-25: la plantilla del informe mensual vive aquí, no en Operaciones.** Pestaña «Plantilla del informe» de Contratación Pública › Configuración (junto a «Campos de la entidad» y «Carpeta de Drive»); los mensajes de error del informe ya apuntan a esa ruta.
