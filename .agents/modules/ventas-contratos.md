# Ventas / CRM — Documentación (documentos desde plantilla), CRM, Contratos comerciales, Dashboard

Cubre todo `/ventas`. Cotizador: `ventas-cotizador.md`. Las secciones se citan por número («sección 14»): no renumerar. Léelo antes de tocar `ventas-templates.*` / `ventas-contratos.*`.

## Visión general y nomenclatura

Menú: **Posibles clientes** (bandeja de entrantes; API `/ventas/entrantes`, URL `/ventas/leads`), **Directorio** (solo datos de empresa/persona; URL/API `/ventas/clientes`), **Oportunidades**, **Contratos** (acuerdo comercial: `SalesAgreement`, API `/ventas/acuerdos`), **Documentación** (documento desde plantilla: `SalesContract`, API `/ventas/contratos`, NO renombrada), **Cotizador**, Configuración. Un documento siempre es de un cliente y puede colgar de un contrato.

- **Código viejo sin pantalla (no usar):** `/ventas/leads` (tabla `Lead`), `POST /ventas/webhook/lead`, `GET /ventas/dashboard`, `POST /ventas/goals` (`SalesGoal`).
- **Cotizador** (sección `VENTAS`, tablas `Cot*` al arrancar): códigos de catálogo asignados por el servidor y nunca reutilizados; cotizaciones `COT-AAAAMMDD-NNNN` con precio congelado, descuento antes del IVA (15 %); límites de precio solo ADMIN/MANAGER; enlace público `/cotizacion/:token`; precios en `cotizador-precios.util.ts`, copia de `pricing.ts` (si cambia una regla, cambiar las dos); cotización↔oportunidad (`CotQuoteOportunidad`; obligatoria para enviar/descargar PDF; la «principal» fija `quotedAmount`).
- **Campos del Directorio** (`SalesClientField`, valores en `SalesClient.extra` Json): texto/número/fecha/booleano, `SELECT` (guarda el `key` estable), `TEXTAREA`, `LISTA_SUBOPCIONES` (casillas hijas en `extra[clave__sub]`, validadas por `normalizarSubopciones`). `allowOther` agrega «Otro»; `ensureCoreFields` solo impone valores de fábrica al crear. `email` opcional. Campos núcleo `fuente` y `servicio_requerido` y etapas por defecto se siembran perezosamente. `GET /ventas/clientes/fields` sin `@Section` (lo usa el formulario abierto de referir).
- **Columnas por usuario:** `useColumnPreferences.ts` guarda columnas/orden en `UserPreference` (`GET/PUT /users/me/preferences/:key`; `localStorage` solo caché); «Columnas» (`ColumnPickerMenu.tsx`) aplica con «Aplicar». «Campos» configura la ficha: no mezclar.
- **Responsable vs. Referido por:** `assignedUserId` = quién atiende (cada quien se auto-asigna: `POST/DELETE /ventas/clientes/:id/asignarme`); `referredByUserId` = crédito, nunca editable, solo lo fija el servidor en `/referir`; `createdBy` = auditoría.
- **Fecha de ingreso editable:** `fechaIngreso` (`YYYY-MM-DD`, no futura, día de Ecuador UTC-5) se guarda en `SalesClient.createdAt` a mediodía UTC; en edición solo se reescribe si cambia el día.
- **Referidos:** un referido es un `SalesClient` con `fuente=REFERIDO`. `POST /ventas/clientes/referir` y `GET .../mis-referidos` SIN `@Section` (cualquier autenticado; nunca muestran montos ni comisión). El cambio de etapa notifica al referidor solo en la app, nunca por correo; un fallo al notificar no bloquea.
- **Etapas** (`SalesClientStage`, editables por empresa; `GET .../stages` sin `@Section`): una sola `isInitial`; inicial y final a la vez no; la inicial con `order` menor que toda final; todo en `$transaction`. Borrar la última etapa con clientes los deja con `status: null`.
- **Tablas creadas al arrancar** (el deploy NO corre migraciones): contratos comerciales (`ventas/sales-agreement.schema.ts`) y pipeline (`VentasSchemaService`, candado Postgres; `SalesLead`, `SalesOpportunity`, `SalesOpportunityService`, `SalesOpportunityStageChange`, `SalesReason`, `SalesReasonEntry`).
- Metas, Tabla dinámica: solo ADMIN/MANAGER (secciones 45 y 46). «Reportes» es la pestaña «Resultados» de Planificación y Campo.
- Multi-tenant por `companyId`. `PersonalModule` exporta `DriveService` y `VentasModule` lo importa: no crear otro cliente de Drive.

---

## 1. Arquitectura real

Plantilla (link Drive/Doc `.docx` → `uploads/templates/` → detectar variables `[Variable]`/`<<Variable>>` → configurar tipo, quién la llena, `tableConfig`) → documento (campos del vendedor; tablas del cliente por link) → PDF (LibreOffice) → firma SignWell (sección 8) → webhook `document_completed` o subida manual → `SIGNED`. No hay editor visual ni coordenadas: las variables son texto plano del `.docx` que se sustituye (tablas: tabla real de Word).

## 2. Modelos Prisma (reales)

- **SalesTemplate:** `name`, `driveUrl`, `docxPath`, `emailSubject`/`emailBody`, `numberingPrefix`/`numberingDigits` (5)/`numberingNext` (1), `driveFolderId` (subcarpeta perezosa), `companyId`.
- **SalesField:** `variableName` (tal cual en el documento, p. ej. `Contrato.ID de Contrato`), `label`, `fieldType` (`TEXT`, `NUMBER`, `DATE`, `EMAIL`, `CHECKBOX`, `DROPDOWN`, `SIGNATURE`, `INITIAL`, `TABLE`, `CONTRACT_NUMBER`), `isRequired`, `isClientField`, `dropdownOptions String[]`, `allowMultiple` (solo `DROPDOWN`: valor arreglo), `allowOther`, `tableConfig` (`{columns:[{key,label,type}], maxRows}`), `order`. NO existen campos de posición.
- **SalesContract:** `templateId`, `clientName`/`clientEmail` (formulario fijo «Datos para el envío»; más datos = campos `Cliente.*`), `clientPhone/Company/Ruc/Address` (ningún flujo las escribe), `fieldValues Json` (`TABLE` = arreglo de filas; `CONTRACT_NUMBER` lo inyecta el sistema), `contractNumber`, `annexA/B/C` (obsoletos), `signwellDocumentId`/`signwellStatus`, `status` (`DRAFT/GENERATING/READY/SENT/SIGNED/CANCELLED`), `clientFillToken @unique`/`clientFilledAt`, `companyId`.
- **SalesContractDocument:** `type` (`GENERADO/ENVIADO/FIRMADO`), `filePath`; cada generar/enviar/firmar agrega fila, no pisa.

## 3. Endpoints API (reales)

- `/ventas/templates`: CRUD (creación JSON con `driveUrl`), `POST :id/download-drive`, `:id/detect-variables`, `:id/fields` (reemplaza todos); `PATCH` acepta numeración. La carpeta raíz de Drive NO se guarda aquí.
- `/ventas/contratos`: CRUD; `POST :id/generate`, `:id/send`; `GET file/:fileName` (sesión + empresa, `path.basename`); `GET :id/documents`; `POST :id/documents/signed`; `GET/POST public/:token[/submit]` (sin sesión, solo el token). `POST /ventas/webhook/signwell` sin sesión.

## 4. Generación de PDF (LibreOffice, no mammoth+HTML)

(mammoth+HTML pierde formato: no usarlo.) `generatePdf` (`ventas-contratos.service.ts`):
1. Reemplaza variables simples **solo en partes `.xml`/`.rels`**; imágenes y fuentes se copian como buffer binario (leerlos como texto los corrompe).
2. `TABLE`: reemplaza el párrafo completo del placeholder por una tabla `<w:tbl>` (`buildTableXml()`). **La variable de una tabla va sola en su párrafo**; si no, el resto del texto se pierde.
3. `soffice --headless --convert-to pdf`; `LIBREOFFICE_PATH` opcional (en Windows apuntar al `.com`); instalado en `backend/Dockerfile`.
4. Perfil descartable por conversión (`-env:UserInstallation=file:///<tmp>`) para que las concurrentes no choquen.
Una fuente no instalada en el contenedor se sustituye.

## 5. Campos tipo TABLA y el link público del cliente

- `isClientField` sin marcar: la llena el vendedor en `ContratoForm.tsx`. Marcado: al crear el contrato se genera `clientFillToken` (24 bytes aleatorios) y el vendedor copia `/ventas/contratos/completar/:token` (nombre viejo a propósito: los links enviados no se pueden romper).
- `CompletarContrato.tsx` (sin sesión) muestra solo esas tablas; `submit` valida el token, acepta solo claves de campos `TABLE` de cliente de esa plantilla y marca `clientFilledAt`.
- Existe porque SignWell no tiene campo «tabla de filas variables».

## 6. Numeración automática y carpeta de Drive por plantilla

- **Numeración:** un campo `CONTRACT_NUMBER` (a lo sumo uno por plantilla) nunca es editable. `createContract()` arma `${prefix}-${next.padStart(digits)}` en `prisma.$transaction` que incrementa `numberingNext` (sin duplicados) y lo guarda en `contractNumber` y `fieldValues`.
- **Drive:** raíz FIJA en código (`HARDCODED_DRIVE_FOLDERS.VENTAS_CONTRATOS`; `GET /personal/drive/config?type=VENTAS_CONTRATOS` la entrega, `POST` la rechaza). Subcarpeta por plantilla creada perezosamente (`DriveService.createSubfolder`); archivos `{contractNumber o id}_generado|enviado|firmado_{fecha}.pdf`. Subida best-effort: si falla, solo `Logger.warn`.
- **PDF firmado:** por webhook o a mano (`POST .../documents/signed`); ambos guardan, suben a Drive, crean `SalesContractDocument{FIRMADO}` y marcan `SIGNED`.

## 7. Quién llena cada campo (`isClientField`)

`false`: el vendedor. `true` y `CHECKBOX/SIGNATURE/INITIAL/TEXT/EMAIL/NUMBER/DATE`: el firmante, dentro del documento (text tag SignWell). `true` y `DROPDOWN`: sin mecanismo. `true` y `TABLE`: link público antes de firmar. `CONTRACT_NUMBER`: lo asigna el sistema.

## 8. Firma electrónica: SignWell

- `sendContract()`: `POST https://www.signwell.com/api/v1/documents`, header `X-Api-Key` (`SIGNWELL_API_KEY`); `files:[{name,file_base64}]` (base64 crudo, sin `data:`); `recipients:[{id:'1',name,email}]`; `test_mode` por `SIGNWELL_TEST_MODE` (default `true` salvo `"false"`); `text_tags:true`; `with_signature_page:true` solo si la plantilla no trae tag de firma/iniciales/casilla. Guarda `id` y `status`.
- **Text tags** (`buildSignWellTextTag()`, delimitador `:`, firmante `1`): `CHECKBOX` `{{check:1:{y|n}:Etiqueta}}`; `SIGNATURE` `{{signature:1}}`; `INITIAL` `{{initial:1:y}}`; `TEXT/EMAIL/NUMBER` `{{text:1:{y|n}:Etiqueta}}`; `DATE` `{{date:1:{y|n}}}`.
- **Firma en la misma sesión con tabla de cliente:** `submitPublicFill()` guarda, genera el PDF, lo envía y devuelve `{redirectToSign: signing_url}`; `CompletarContrato.tsx` redirige. Si el auto-envío falla, lo del cliente queda guardado y el vendedor envía a mano.
- **Webhook:** se registra a mano una vez (`POST /api/v1/hooks`, `callback_url` pública); el `id` es `SIGNWELL_WEBHOOK_ID`. `handleSignWellWebhook()` verifica `event.hash` (HMAC-SHA256 de `"{type}@{time}"` con ese id, `timingSafeEqual`); sin la env var ignora todo (falla cerrado). En `document_completed` descarga `/api/v1/documents/:id/completed_pdf` (con reintentos).
- Env vars: `SIGNWELL_API_KEY` (Secret Manager, `cloudbuild.yaml`), `SIGNWELL_TEST_MODE`, `SIGNWELL_WEBHOOK_ID`. Un `400 "verify your email"` es bloqueo de la cuenta, no del código.

## 9. Notas de implementación vigentes

- Super admin (`companyId: null`) no puede crear contratos. Detector y sustitución escapan caracteres de regex del nombre de variable. Variables `Contrato.Campo` se agrupan bajo «Campos de (Contrato)» (resto en «Otros»), solo presentación. Una variable repetida se detecta una vez y se sustituye en todas las apariciones.

## 10. Ajustes de UX de Documentación (segunda ronda)

`DROPDOWN`: opciones en sub-panel (un input por opción) y «Permitir selección múltiple» (`MultiSelect`; `fieldValues` es `Record<string, any>`). `TemplateConfig.tsx` agrupa por espacio de nombres preservando los índices reales de `fields`. Editar → regenerar: `ContratoForm.tsx` en modo edición (`/ventas/documentacion/:contractId/editar`), `PATCH` sin tocar `status`; «Editar campos» oculto en `SIGNED`; «Generar/Regenerar PDF» en cualquier estado salvo `SIGNED`, cada regeneración suma historial.

## 11. Tercera ronda (Documentación) y motor de negrita

- Etiqueta por defecto sin el espacio de nombres (corta antes del primer punto; sin regex de «espacio antes de mayúscula»: rompía «ID»). `allowOther` en `DROPDOWN`. Variables mostradas como `[Variable]`. Selección múltiple = lista con viñetas (`<w:br/>`). `ContratoResult.tsx` muestra «Información que se le pedirá al cliente».
- Todo valor insertado (salvo tablas) va en negrita. **`substituteInsertedValue`/`spliceBoldValue`: NO usar regex sobre el archivo completo** (`[\s\S]*?` por campo sobre el XML se vuelve casi infinito y cuelga el proceso; asumir `<w:r>` sin atributos no sustituye nada en documentos de Google Docs). Se usa `indexOf` y recorrido con `lastIndexOf`/`indexOf` con avance garantizado; `findLastOpenTag()` solo acepta coincidencia si el carácter siguiente es espacio, `>` o `/` (si no, `<w:r` coincide con `<w:rPr>`, `<w:t` con `<w:tbl/tr/tc/tab`). Si el entorno no es un run limpio (un `<w:t>`, a lo sumo un `<w:rPr>`), sustituye sin negrita para no perder el valor.

## 12. Contratos comerciales, servicios y Documentación

Decisiones: «Contratos» es pantalla nueva y lo anterior es «Documentación». Servicios = catálogo editable por empresa + varios por contrato (`servicio_requerido` del cliente es solo «servicio de interés inicial»). Datos viejos: vincular por coincidencia y dejar el resto en «Sin cliente asignado». Sin alertas de vencimiento por correo: el estado se calcula.
- `SalesAgreement`: `salesClientId` (obligatorio, `Cascade`), `title?`, `startDate`, `endDate?` (sin fin = indefinido), `status` guardado (`ACTIVO/RENOVADO/CANCELADO`), `renewedFromId?`. Vigente / por vencer (≤30 días) / vencido / por iniciar se CALCULAN (`agreement-status.util.ts`, `calcularEstadoContrato`, día de Ecuador UTC-5).
- `SalesService`: catálogo por empresa (`name` único sin mayúsculas, `isActive`); se siembra la primera vez (`ensureDefaultServices`, `DEFAULT_SUBSERVICIOS`). Un servicio usado no se borra, se desactiva.
- `SalesAgreementService` y `SalesAgreementDocument` (`contractId` es PK: un documento, un contrato). **El documento se cuelga con tabla aparte, no con columna en `SalesContract`**: una columna que Prisma conoce y la base no tiene rompe toda consulta a esa tabla. Tablas creadas al arrancar (`sales-agreement.schema.ts`, `IF NOT EXISTS`). `listContracts`/`getContract` no leen `SalesAgreementDocument`.
- Un documento siempre es de un cliente de la empresa (`createContract` exige `salesClientId`; `updateContract` no deja quitarlo); `agreementId` debe ser del mismo cliente; vincular un documento sin cliente le asigna el del contrato, de otro cliente se rechaza.
- **Renovar** (`POST /ventas/acuerdos/:id/renovar`): contrato nuevo del mismo cliente (inicio = día siguiente al fin, servicios copiados), anterior `RENOVADO`; no se renueva `RENOVADO`/`CANCELADO`; eliminar la renovación devuelve el anterior a `ACTIVO`. A mano solo `ACTIVO` o `CANCELADO`.
- Borrar un cliente con contratos se rechaza; eliminar un contrato no borra sus documentos. Fechas validadas con ida y vuelta (`parseDiaContrato`); fin ≥ inicio.
- `POST /ventas/acuerdos/documentos/vincular-clientes` enlaza solo si correo (o nombre exacto sin tildes/mayúsculas) coincide con UN cliente; `GET /ventas/contratos?sinCliente=true` muestra el resto.
- Endpoints (`VENTAS` view en GET, write el resto): `/ventas/servicios` (`?incluirInactivos=true`), `/ventas/acuerdos` (filtros `clienteId`, `estado`, `servicioId`, `q`), `:id/renovar`, `:id/documentos[/:contractId]`.
- Rutas: `/ventas/contratos` (lista; `?nuevo=1&clienteId=N`) y `/ventas/contratos/:id` (detalle, NO redirigible). Documentación: `/ventas/documentacion`, `/nuevo[/:templateId]` (`?clienteId=&contratoId=`), `/:contractId/editar`, `/:id`, `/plantillas`, `/configuracion[/:id]`; las rutas viejas `/ventas/contratos/nuevo|plantillas|configuracion|:contractId/editar` redirigen.

## 13. Leads, oportunidades, ciclo de vida, dinero, motivos, dashboard y Agente de Ventas

Decisiones (no re-proponer lo descartado):
- **Lead ≠ Cliente.** Los entrantes se clasifican (Servicio / Empleo / Proveedor / Otro / Spam); solo uno de servicio, calificado, se convierte en cliente + oportunidad. **Un cliente nunca vuelve a ser lead**: si pide otro servicio entra como lead nuevo y al convertir se detecta por correo, teléfono o RUC y se suma una oportunidad.
- **Oportunidad** = negociación de un servicio de un cliente (monto cotizado, fecha, servicios, motivo de pérdida).
- **Ciclo de vida calculado, nunca tecleado:** Prospecto → Cliente → En riesgo → Inactivo (interno `EX_CLIENTE`) / Perdido. **Días de gracia** los fija cada contrato al crearlo (sugerido 30 si dura ≥6 meses, 15 si menos; la renovación hereda).
- **Dinero:** `monthlyValue` (contrato), `quotedAmount` (oportunidad); lo ve todo VENTAS. «Mis referidos» y avisos al referidor NUNCA muestran montos.
- **Motivos obligatorios** al descartar un lead, rechazar una oportunidad, cancelar un contrato, renovar con menos servicios o menor valor, o dejar vencer sin renovar. Lista editable por empresa con «Sin información», «Otro» (exige comentario) y «quién lo dijo» (CLIENTE / VENDEDOR = hipótesis).
- Referidos de empleados entran directo como cliente + oportunidad. Aviso de lead nuevo: notificación en la app a quienes tienen «Escribir» en VENTAS; sin reparto automático. Agente de Ventas aparte (`agents-ai.md` punto 3).

Modelo (`VentasSchemaService`; ninguna columna nueva en tablas ya existentes en producción):
- `SalesLead` (`externalId` único por canal contra reintentos, `contactReason`, estado NUEVO/EN_SEGUIMIENTO/CONVERTIDO/DESCARTADO).
- `SalesOpportunity`: `status` = clave de etapa SIN FK (un `ON DELETE SET NULL` sobre `[companyId,key]` anularía `companyId`); abierta mientras `closedAt` sea null.
- `SalesReason` (los de sistema no se tocan) y `SalesReasonEntry` (se borra con el cliente/oportunidad/contrato).
- `SalesClient.status` es ESPEJO de la etapa de la oportunidad principal; solo `VentasOportunidadesService.espejarCliente` lo escribe. `PATCH /ventas/clientes/:id/stage` delega en la oportunidad (si `VentasSchemaService.isReady()` es false, camino viejo).
- `notificarReferidor` depende de `SalesOpportunity.referredByUserId` (solo la primera oportunidad).
- Puras con spec: `client-lifecycle.util.ts` (`calcularCicloVida`; «En riesgo» = por vencer, >60 días sin actividad, seguimiento vencido o vencido dentro de su gracia), `ventas-metricas.util.ts` (mediana y percentil 75; «pocas muestras» n<5), `stage-outcome.util.ts`, `lead-triage.util.ts` (sugiere, nunca aplica).
- Endpoints (`VENTAS`): `/ventas/entrantes` (`:id/convertir` admite `salesClientId` y `confirmarNuevo`), webhooks sin sesión `POST /ventas/webhook/entrante` y `/google-ads`, `/ventas/oportunidades` (`PATCH :id/etapa`: `RECHAZADO` exige `motivo`, `COTIZADO` toma hoy si no hay fecha), `/ventas/motivos`, `POST /ventas/acuerdos/:id/cancelar` y `/cierre` (`PATCH` ya no acepta `CANCELADO`), `/ventas/analitica/*` (quien no es ADMIN/MANAGER ve lo suyo).

Aplazado: la bandera de salud del arranque (si falla la creación de tablas el servicio arranca igual con `isReady()` false y un error en el log de Cloud Run: **mirar el log tras cada despliegue**); Meta Ads sin conexión (directa, o Make/Zapier hacia `/ventas/webhook/entrante`; mientras, «Nuevo lead» con canal Meta Ads); `Agent` no tiene `companyId` (texto del Agente de Ventas compartido entre empresas); el motivo del vendedor no es confiable (falta conversación de salida por alguien que no sea el vendedor); registrar cambios de responsable. Ningún flujo nuevo envía correos.

## 14. Lead → Oportunidad → Cliente, embudo de marketing y ficha por pestañas

- La etapa vive solo en la oportunidad y «cliente» es un estado que se gana al aceptar (el Directorio ya no cambia etapa; `PATCH /ventas/clientes/:id/stage` queda por compatibilidad).
- **«Nuevo cliente»:** «Sí, ya es cliente» crea persona + oportunidad `originType: 'HISTORICO'` ya Aceptada (Cliente «Por contratar» hasta cargar contrato); «No, está negociando» crea persona + oportunidad «Nueva». Las `HISTORICO` se excluyen de embudo y aceptación y no revive a un inactivo.
- **Aceptar = ya es cliente** sin contrato: `calcularCicloVida` da `CLIENTE` con `contratoPendiente: true` (también si aceptó DESPUÉS de vencer su último contrato). `GET /ventas/clientes` trae `contratoPendiente` y `oportunidadesAbiertas`.
- **Etapas (claves intactas; están en analítica, expediente, IA y modales):** `RECIBIDO` «Nueva» (inicial) → `LEIDO` «En evaluación» → `COTIZADO` «Cotizada» → `NEGOCIACION` «En negociación» → `ACEPTADO` «Aceptada» / `RECHAZADO` «Perdida». `DEFAULT_STAGES` en `ventas-etapas.const.ts`; `actualizarEtapasDeFabrica` (idempotente) renombra y agrega `NEGOCIACION` solo a empresas con exactamente las cinco originales sin tocar.
- **Leads:** NUEVO «Sin procesar» → EN_SEGUIMIENTO «Contactado» → CONVERTIDO «Pasó a oportunidad» / DESCARTADO. No hay estado «Calificado» (en Google calificado = cotizó). Motivo de sistema «No contestó» (`ensureDefaultReasons`). «Sin atender hace N días» es solo marca visual.
- **Fases de marketing** (calculadas, `ventas-marketing.util.ts`): Sin procesar → Cualificado (sección 15) → Convertido (Aceptada). `GET /ventas/analitica/marketing?agrupar=channel|campana|landing&canal=&desde=&hasta=&alcance=`.
- **Atribución:** `atribuirCanal` (`lead-atribucion.util.ts`): un identificador de clic manda sobre UTM (`gclid`→GOOGLE_ADS, `fbclid`→META_ADS, `li_fat_id`→LINKEDIN_ADS); sin él `utm_source`; Google orgánico no es anuncio; sin nada WEB_FORM. `serviciosSugeridos` solo preselecciona al convertir.
- **Historial (`getTimeline`):** lee los cambios de las oportunidades (`SalesClientStageChange` solo si las tablas nuevas no están listas) con su oportunidad y servicio, más eventos de contrato.
- **Contrato (detalle):** «Editar» y «Renovar»; «Cancelar», «Reactivar» y «Eliminar» en «⋯»; «Renovar» deshabilitado mientras esté Por iniciar.
- `VentasService.getGoals` cuenta TODAS las visitas completadas del vendedor (no filtra por semana): corregir antes de usarlo.

## 15. Fuente obligatoria, registro de canales, landings reales y aviso a Google Ads

- **La fuente es OBLIGATORIA** y todo canal vive en un solo registro, `lead-canales.const.ts` (clave, etiqueta, grupo ANUNCIO/WEB/DIRECTO, `campos` propios —`campaign` a la columna, el resto a `SalesLead.extra`—, `fuenteCliente`, `clicId`, `utmSources`); sumar un canal = una entrada. Canales: `GOOGLE_ADS`, `META_ADS`, `LINKEDIN_ADS`, `WEB_FORM`, `REFERIDO`, `WHATSAPP`, `TELEFONO`, `EMAIL`, `MANUAL`. `GET /ventas/entrantes/canales` (`useCanalesLead`). `POST /ventas/entrantes` rechaza un lead sin fuente válida y descarta datos propios no declarados. Se guardan `gbraid`/`wbraid` (no deciden canal).
- **Landings:** el webhook acepta nombres en español (`nombre`, `correo`, `telefono`, `empresa`), `necesidad`, `consentimiento`, `landing`, `utm_*`, `gclid`, `fbclid`. `lead-landing.util.ts` guarda `consentimiento` (`SI` o `NO_CONSTA`, nunca un «No» inventado) y toma servicio y línea comercial de la dirección (tabla por empresa en Configuración). El plugin de WordPress «GEMESEG CRM Sync» ≥1.2.0 (fuera de este repo) envía al CRM con `GEMESEG_CRM_URL`/`GEMESEG_CRM_KEY` en `wp-config.php` (`X-API-KEY`, `externalId` = id del lead para que un reintento no duplique); el envío va después de lo que la acción ya hace y nunca impide el formulario.
- **`recibidoEn`** (ISO) en el webhook se guarda como `SalesLead.createdAt` (`lead-recepcion.util.ts`); si falta, es inválido, del futuro (>5 min) o >90 días se ignora (nunca se rechaza). Es la fecha de «Llegó» y el inicio de la oportunidad.
- **Conversiones a Google Ads:** tabla `SalesConversionEvent` (al arrancar; SQL en `prisma/migrations/20261015_sales_conversion_events/`), `ventas-conversiones.service.ts` (`registrarPorEtapa` al final de `cambiarEtapa`, nunca lanza). Solo para leads CON `gclid`: `CUALIFICADO` al llegar a En evaluación o más (`ETAPAS_CUALIFICADAS` = `LEIDO`+`COTIZADO`+`NEGOCIACION` más toda etapa intermedia propia de la empresa vía `clavesCualificadas`), `CONVERTIDO` al aceptarse (monto cotizado). Único por oportunidad y tipo; clic >90 días = `VENCIDO`; mover fuera de Aceptada no retira. `rellenarFaltantes()` crea los que falten (idempotente). Las dos acciones en Google Ads deben tener categoría «Lead calificado» / «Lead convertido» y son **secundarias**.
- **Envío:** Data Manager API (`POST https://datamanager.googleapis.com/v1/events:ingest`, alcance `.../auth/datamanager`) con la cuenta `ads-conversiones` por impersonación (sin claves). `google-ads-conversiones.*` (`enviarPendientes`: `PENDIENTE` y `FALLO` con <8 intentos y 10 min de espera) y `POST /ventas/conversiones-cron/enviar` (`x-cron-secret` = `CRON_SECRET`, `?dryRun=true`). Se activa en Ventas → Configuración (`SalesSetting` clave `google_ads`: ID de cliente de 10 dígitos, ID de cada conversión, «Enviar a Google Ads» apagado por defecto, «Solo probar» = `validateOnly` encendido por defecto; `GOOGLE_ADS_*` solo respaldo). Cloud Scheduler: la solicitud necesita `Content-Length: 0` (si no, 411); nunca imprimir la salida de `gcloud scheduler jobs create` (muestra el secreto). No subir también la hoja de marketing (contaría doble).
- **Verificación:** `events:ingest` responde 200 al RECIBIR y Google procesa después (hasta ~12 h). Cada envío guarda `requestId`, `googleStatus`, `checkedAt` (`SALES_CONVERSION_COLUMNS_DDL`). El cron: rellenar faltantes → `reencolarSinVerificar` → enviar → `verificarEnvios` (a los 30 min `requestStatus:retrieve`: ACEPTADO, PARCIAL, RECHAZADO con motivo en español, REINTENTAR). `RECHAZADO` no se reintenta. No se manda `consent` (si Google rechaza por `CONSENT`, decidirlo).
- **gclid inválido:** `limpiarGclid` (quita espacios, codificación URL y prefijo de cookie `GCL.<fecha>.`) y `gclidConFormato` (`[A-Za-z0-9_-]{20,255}`, sin `EJEMPLO`/`TeSter`) al guardar y antes de enviar; sin formato NO se envía y queda `RECHAZADO`.
- Configuración (`SalesSetting`, única por `companyId`+`key`): sigue fijo en código el registro de canales, la identidad `ads-conversiones` y los nombres de las dos conversiones.

## 16. Configuración visible para todo Ventas, Conexiones sin código y contratos de servicio vs. producto

- **Configuración sin rol:** `GET` basta con acceso a VENTAS; `PUT`/`DELETE` con «puede editar» (`@Section('VENTAS','write')`). Sin permiso se ve en solo lectura.
- **Webhook (técnico, no en pantalla):** `POST <origen>/api/ventas/webhook/entrante`, `X-API-KEY`, SIEMPRE desde el servidor (en el navegador la clave queda a la vista). JSON con al menos `nombre`, `correo` o `telefono`; un `website` lleno descarta el lead como robot. `GET /ventas/entrantes/canales/actividad` da el conteo real por canal. `/ventas/webhook/google-ads` sigue en el servidor, oculto.
- **Línea blanca:** ninguna empresa hereda datos de Gemeseg. `landingsDe` devuelve `[]` si no hay nada; `sembrarLandingsDeEmpresasExistentes` copia al arrancar la tabla de Gemeseg solo a empresas creadas antes de `CORTE_LANDINGS_POR_EMPRESA` con leads/clientes/claves y sin fila `landings` (`skipDuplicates`, idempotente). Pendientes: `ensureDefaultServices` siembra el catálogo de Gemeseg a toda empresa nueva; `ajustesGoogleAds` cae a `GOOGLE_ADS_*`.
- **`SalesAgreement.kind` = `SERVICIO` | `PRODUCTO`** (columnas `kind` DEFAULT 'SERVICIO', `totalValue`, `deliveredAt`, `warrantyUntil`, al arrancar); se elige al crear (cambiarlo: sección 37).
  - SERVICIO: vigencia, renovación, valor mensual, gracia.
  - PRODUCTO (hoy «Venta única», sección 41): sin fin, renovación, valor mensual ni gracia; `status` `POR_ENTREGAR` → `ENTREGADO` (`PATCH` `status` + `deliveredAt`) o `CANCELADO`; garantía opcional (`calcularEstadoGarantia`, 30 días); `renovar` responde 400.
  - **Todo `select` explícito de `SalesAgreement` que use `calcularEstadoContrato` debe incluir `kind`** (si no, se trata como servicio y queda «Vigente» para siempre).
  - Quien solo compró productos es CLIENTE (nunca en riesgo/inactivo por eso); un producto no es contrato vigente; cartera y retención lo excluyen (`kind: { not: 'PRODUCTO' }`). Lista con filtro `?tipo=SERVICIO|PRODUCTO`.

## 17. Nombres de pantalla, Directorio y panel «Cómo funciona»

Solo cambió lo visible; **ninguna URL, ruta de API, clave ni enum** (`/ventas/leads`, `/ventas/clientes`, `EX_CLIENTE`, `contactReason`…); las notificaciones con `link: '/ventas/leads'` siguen valiendo. Equivalencias: «Convertir en oportunidad» → «Pasar a oportunidad»; «Motivo del contacto» → «Tipo de contacto»; «Motivos» en Contratos → «Motivos de cierre»; «Canal» → «Fuente»; «Leads» → «Posibles clientes» («lead» solo donde es de Google); «Clientes» → «Directorio»; «Ex-cliente» → «Inactivo»; «Cliente» en Oportunidades → «Empresa o persona». «Documentación» se queda («Cuentas» descartado).
- Vocabulario: Directorio = pantalla; «empresa o persona» = cada registro; en Contratos y Documentación «cliente»; Contacto (persona dentro de una empresa) hoy NO existe. **El prefijo `Cliente.` de las variables de plantillas Word NO se renombra** (está dentro de los .docx).
- Panel «Cómo funciona» (`components/ventas/VentasComoFunciona.tsx`, constante `OTROS_CRM`): habla de las etapas de fábrica y no se adapta si se renombran. IA: `system-guide.util.ts` (bloque VENTAS) y el prompt del Agente de Ventas. **Al renombrar algo:** grep del nombre viejo en `frontend/src`, `system-guide.util.ts`, `ventas-agent-prompt.util.ts`, `ventas-expediente.service.ts` y estos docs.

**Directorio de solo datos (versión vigente):** el Directorio guarda solo datos; etapa, responsable, seguimiento y contratos son de las oportunidades y Contratos (el responsable es de la oportunidad). Una persona entra al Directorio solo al pasar a oportunidad (mínimo nombre y empresa o «persona natural»; RUC se exige al generar contrato). El mismo tema por otro canal se agrega al mismo posible cliente u oportunidad abierta; otro servicio = otra oportunidad. Postventa NO es de Ventas. No existe fusión de duplicados (solo aviso).
- `VentasClientesPage` abre con todos y sin filtros; columnas por defecto Nombre, RUC, Email, Teléfono, Relación (preferencias `ventas-directorio`). «Nueva empresa o persona» envía `soloDatos: true` (sin oportunidad, etapa ni responsable). `ClienteFichaPanel`: «Datos» e «Historial» con accesos a oportunidades y contratos; al editar se pueden vaciar correo, teléfono, RUC, dirección y observaciones.
- Oportunidades: «⋯» con **Siguiente paso**, **Asignarme**, **Quitarme** (`PATCH /ventas/oportunidades/:id` con `assignedUserId`); «Para hoy» se rige por el responsable de la oportunidad; acepta `?vista=hoy`, `?etapa=`, `?q=`. Al crear, el responsable es quien la crea. Sin cambiar: `SalesClient.assignedUserId`, `status`, `nextActionText/Date`.
- Fases futuras (cada una con prueba y aprobación): Contactos y reconocimiento (hoy `VentasLeadsService.coincidencias` compara solo correo, teléfono y RUC y NO usa `companyName`); servicio adicional con `SalesOpportunityAgreement` (hoy `contratoPendiente` solo se marca si la empresa no tiene ningún contrato).
- **Protección de producción:** solo tablas nuevas e independientes (`IF NOT EXISTS`, al arrancar); no se altera ninguna columna ni fila existente (una columna que falte en `SalesOpportunity` rompería todas sus consultas).

## 18. Documentación a medias: subir documentos ya hechos y «Próximamente»

- «Subir documento»: `POST /ventas/contratos/subir` (multipart: `file` PDF ≤10 MB, `salesClientId` obligatorio, `agreementId`, `titulo`, `firmado`) crea un `SalesContract` SIN plantilla (`templateId` opcional; `DROP NOT NULL` al arrancar), guarda por `StoredFile`, deja un `SalesContractDocument` (`FIRMADO`/`GENERADO`) y lo cuelga del contrato si se indicó. Firmado → `SIGNED`; si no, `READY`. Nombre en `fieldValues.titulo`.
- Generar o enviar a firma sin plantilla responde `DOCUMENTO_SIN_PLANTILLA`. Sin clave de SignWell, `sendContract` responde `SIGNWELL_NO_CONECTADO`; `GET /ventas/contratos/estado-firma` → `{signwellConfigurado}` y la ficha muestra «Próximamente». Quitar `DocumentacionProximamente.tsx` al conectar SignWell.

## 19. Tres niveles de pérdida, motivos separados y contratos pasados

- Tres niveles, cada uno con su lista: `LEAD_DESCARTE`, `OPP_PERDIDA`, `CONTRATO_CANCELADO` / `CONTRATO_NO_RENOVADO` / `CONTRATO_REDUCCION` (los `kinds` no cambian; `utils/motivosCierre.ts` define los grupos). Catálogo en Configuración → Motivos de cierre (`MotivosCatalogo.tsx`); un motivo puede estar en varios grupos.
- Contratos anteriores a la app: el servidor nunca bloquea fechas pasadas (solo fin ≥ inicio). `ContratoComercialModal` pide motivo si ya terminó o se canceló antes: crea el contrato y luego `registrarCierreContrato` o `cancelarContratoComercial` con `date`. Una venta única no pide motivo de no renovación. `cancelAgreement` valida fecha (`problemaFechaCancelacion`: no anterior al inicio ni futura).

## 20. Configuración en pestañas y Conexiones como botones

- `/ventas/configuracion` (`?tab=`, abre en Conexiones). Conexiones (`ConexionesConfigSection.tsx`): botones con punto de estado de datos reales: Google Ads verde si el envío está activo y completo (`googleAdsActivo`); Formulario web verde si hay una `SalesApiKey` activa fuera de las conexiones añadidas; Meta Ads y LinkedIn Ads siempre gris (sin webhook propio); añadida verde si su clave está activa.
- `SalesApiKey` va dentro de cada conexión que la usa. `SalesSetting` clave `conexiones` (`{items:[{id,nombre,apiKeyId}]}`); `POST/DELETE /ventas/configuracion/conexiones`, `PUT /ventas/configuracion/claves/:id`. Una conexión añadida entra por `/ventas/webhook/entrante`; `SalesLead` no guarda qué clave lo trajo.

## 21. Documentos del contrato con tipo, visibles en Documentación y encabezados

- Tipo: `CONTRATO`, `ADENDA`, `GARANTIA`, `ACTA_ENTREGA`, `ORDEN_COMPRA`, `OTRO` (nombre propio, máx. 60) en `ventas-documento-tipos.const.ts` y `utils/documentoTipos.ts` (no renombrar claves). Subir exige tipo; `PATCH /ventas/contratos/:id/tipo` lo cambia.
- Columnas nulas `SalesContract.documentType`/`documentTypeOther` (`SALES_CONTRACT_COLUMNS_DDL`) corren en transacción propia ANTES de la grande (`agregarColumnasNuevas`). **Tras desplegar, mirar el log de Cloud Run** por «No se pudieron agregar las columnas de tipo de documento».
- Un documento subido ES un `SalesContract`: aparece en Documentación. `listContracts`/`getContract` traen `agreementLink.agreement {id,title}`.
- Encabezados: `.page-title-row` + `.page-title-help`; `.header-actions--ancho-movil` (≤640px botones a todo el ancho).

## 22. Incidentes y conversación de salida pasan al contrato

- Se registran por contrato (`IncidentesContrato.tsx`), no en el Historial del cliente. Tabla `SalesAgreementIncident` (`agreementId`, `type` = `INCIDENTE_SERVICIO` | `CONVERSACION_SALIDA`, `occurredAt`, `text`; `ON DELETE CASCADE`; `sales-agreement-incident.schema.ts`, también en `schema.prisma`). `POST /ventas/acuerdos/:id/incidentes` ({type, text, date? no futura}) y `DELETE .../:incidenteId`; `getAgreement` trae `incidentes`.
- Las actividades viejas con esos tipos no se migraron: se ven en el Historial (`SALES_ACTIVITY_TYPES_TODOS` etiqueta; `SALES_ACTIVITY_TYPES` es lo ofrecido; el backend las acepta). `ventas-expediente.service.ts` junta ambas fuentes. Los contactos NO se crean solos desde el teléfono/correo del Directorio.

## 23. Tres cambios de nombre

«Hoy» → «Para hoy» (clave interna `vista === 'hoy'`). «Conexiones» → «Cómo llegan los posibles clientes» (pestaña y botón; `?tab=conexiones` no cambia). «Planificación y Campo» en el menú: ver sección 39.

## 24. Fase 4: renovaciones como oportunidad

- `VentasRenovacionesService.generar()` abre UNA oportunidad «Renovación – título» (etapa inicial, `originType RENOVACION`, `renewsAgreementId`, mismos servicios) por contrato `SERVICIO`, `ACTIVO`, con `endDate` ≤ hoy+30 días y dentro de `endDate + graceDays`. Sin responsable (avisa a Ventas por la campana). No para productos, sin fin, cancelados ni renovados. Idempotente.
- `SalesOpportunity.renewsAgreementId` (nula, sin FK, con índice) va en `SALES_OPPORTUNITY_COLUMNS_DDL` (transacción previa) y al final de `SALES_PIPELINE_DDL`.
- **Cron diario:** `POST /ventas/renovaciones-cron/generar` (`x-cron-secret` = `CRON_SECRET`; sin variable 404, header malo 401, `?dryRun=true`). Cloud Scheduler `ventas-renovaciones-diarias` (6:00 America/Guayaquil, `--project=mejora-gemeseg`); sin él no se genera nada. Nunca imprimir la salida de `gcloud scheduler jobs create/update`.
- **Aceptar** (`cambiarEtapa`): con `renewsAgreementId` no se pregunta servicio/producto; `acuerdos.validarRenovacion` valida antes de mover la etapa (mismo cliente; cancelado → error; ya renovado a mano → `YA_RENOVADO`; fechas, servicios y motivo si hay reducción) y `aplicarRenovacion` llama `renewAgreement` con `opportunityId`. `AceptarContratoDto.tipo` admite `RENOVACION` + `renovacion: RenovacionAlAceptarDto` (aparte de `RenewSalesAgreementDto` por import circular). Frontend: `ContratoComercialModal` modo «renovar» con `onCapturar`.
- **Perder:** motivo UNA vez como `CONTRATO_NO_RENOVADO` (con `agreementId`).
- Efectos en cadena (en `ventas-acuerdos.controller.ts`, no en el servicio, por dependencia circular): «Renovar» a mano cierra la oportunidad abierta como Aceptada; «Cancelar contrato» como Perdida; eliminar el contrato borra las abiertas. `getAgreement` devuelve `renovacionOportunidad`.

## 25. «Lead válido», dirección y servicios del posible cliente, y Dashboard por responsable

- **«Lead válido»** para Google Ads: opcional y APAGADO por defecto. Hecho `VALIDO` en `SalesConversionEvent`, una vez por posible cliente, al clasificarlo «Servicio» o pasarlo a oportunidad, solo con `gclid` y si la empresa guardó `conversionValido`; sin ID no se registra ni envía. Sin oportunidad: `opportunityId` opcional (`DROP NOT NULL` al arrancar), `transactionId` `crm-lead-<id>-VALIDO`; la unicidad (oportunidad, tipo) no cubre NULL, se cuida en código (`registrarLeadValido`).
- La dirección del posible cliente (webhook `direccion`/`address` + `ciudad`, formulario de Google Ads, «Nuevo posible cliente») va en `SalesLead.extra.direccion` (`lead-datos.util.ts`); al pasar a oportunidad la empresa NUEVA nace con ella, y a una existente solo se le completa si no tenía (nunca se pisa).
- Dashboard «Resumen»: «mis clientes» = con una oportunidad a mi nombre o que aún traen mi nombre del sistema anterior; bloque «Oportunidades por responsable».
- Los documentos ya generados no se actualizan solos si cambia un dato del cliente.

## 26. Ubicación opcional de la oportunidad y mapa de Ecuador en el Dashboard

- «Ubicación del servicio» es OPCIONAL y de la **oportunidad** (no de la empresa); mapa OpenStreetMap/Leaflet sin llave (`UbicacionCampo` → `UbicacionModal`, `React.lazy`). «Pasar a oportunidad» la recibe en `ConvertLeadDto.ubicacion` (no va a la ficha). Nunca volverla obligatoria.
- Siete columnas NULAS en `SalesOpportunity` (`locationName/Address/Lat/Lng/City/Province/OsmId`) en `SALES_OPPORTUNITY_COLUMNS_DDL`. La API entrega el objeto `ubicacion` (o `null`); al guardar: sin enviar = no se toca, `null` = quitar, objeto = reemplazar.
- Validación (`ubicacion.util.ts`): el punto debe caer en Ecuador (continental o Galápagos); provincia normalizada a una de 24 (`normalizarProvincia`/`provinciaMasCercana`); 6 decimales.
- Buscador: `GET /ventas/ubicaciones/buscar?q=` y `/inversa?lat=&lng=` llaman a **Nominatim desde el SERVIDOR** (no pasarlo al navegador): User-Agent propio (`NOMINATIM_USER_AGENT`, `NOMINATIM_URL`), máx. 1 consulta/s, sin autocompletar, caché 24 h, solo Ecuador; si falla, 503 y se marca el punto a mano. OSM no conoce todos los locales: buscar calle/barrio, arrastrar el pin y escribir el nombre.
- Mapa del Dashboard: `GET /ventas/analitica/mapa?alcance=&vista=` (`ventas-mapa.util.ts`) agrupa oportunidades con ubicación por ciudad y provincia; vistas todas/abiertas/cotizadas/aceptadas/perdidas; no cuenta `RENOVACION` ni `HISTORICO`. `DashboardMapa` (`React.lazy`) con tres vistas: Burbujas, Mapa de calor (`leaflet.heat`, carga bajo demanda; busca `window.L`, asignarlo antes del `import()`) y Puntos, por cantidad o monto; el servidor entrega `puntos` y `oportunidades` (máx. 5000).

## 27. Planificación y Campo conectada al CRM, alta de solo nombre

- Servicio del frontend llama a `/ventas/visits` (no `/visitas`); los días de visita se guardan y muestran a medianoche UTC (`parseDiaVisita`); las clases de modal son `modal-overlay`/`modal` (`modal-backdrop`/`modal-card` no existen).
- `ClientVisit` tiene columnas NULAS al arrancar (`sales-visit.schema.ts`): `salesClientId`, `opportunityId` (sin FK; el servidor valida empresa y mismo cliente) y las 7 `location*`. `POST /ventas/visits` acepta `salesClientId` (copia nombre, teléfono y dirección) o `clientName`; `PATCH` edita sin tocar estado ni lo registrado.
- `VisitaModal`: elegir del Directorio o «+ Nueva empresa o persona» (mismo `ClienteFormModal` con `soloDatos`). El alta de solo datos pide Nombre y Fecha de ingreso (el resto en «Más datos») y NO pide «Servicio requerido».

## 28. «Servicio requerido» sale del Directorio y se queda en la oportunidad; relleno MIGRADA con guarda

- El servicio es de la **oportunidad**: `VentasClientesPage` oculta `servicio_requerido` SIN borrarlo (sigue como campo núcleo); «Pasar a oportunidad» no lo copia a la ficha. «Referir un cliente» sigue guardándolo en la ficha y de ahí pasa a la oportunidad (`idsServiciosDesdeExtra`).
- **`updateClient` REEMPLAZA `extra` completo:** guardas para no borrar el dato oculto: `ClienteFormModal` parte del `extra` existente y el servidor conserva `servicio_requerido` y `__sub` si no llegan. Siguen leyéndolo el Historial, el expediente del Agente de Ventas y los referidos.
- `servicioDeFicha` se muestra en gris cursiva en Oportunidades sin servicios propios; es solo lectura y NO escribe `SalesOpportunityService`.
- **El relleno «MIGRADA» solo corre con la tabla de oportunidades vacía** (`SALES_PIPELINE_BACKFILL[0]` con `NOT EXISTS`); antes corría en cada arranque e inventaba oportunidades «Sin etapa» a las empresas de solo datos.

## 29. «Quién lo refirió» enlazado a un usuario y Configuración rediseñada

- Con fuente Referido, `Quién lo refirió` ofrece usuarios activos (`GET /ventas/entrantes/referidores`) o «Otra persona»; campo `usuario: true` del registro de canales; guarda `extra.referidoPor` y `extra.referidoPorUserId` (`crearManual` valida). Al convertir (`referidorDeLead`) queda como `referredByUserId` del cliente (si es nuevo) y de la oportunidad. El aviso al referidor es solo notificación en la app: NO hay correo.
- Configuración: 4 pestañas con icono (Conexiones, Fuentes, Servicios, Motivos de cierre) con el `admin-tabs` de Administración; «Motivos de cierre» muestra las tres listas en columnas. `?tab=descartes|perdidas|contratos` caen bajo «Motivos de cierre». **Un menú lateral vertical fue rechazado: no volver a proponerlo.**

## 30. El check-in GPS compara con el lugar de la visita

- `evaluarCheckIn` (`checkin.util.ts`): ≤500 m = `EN_SITIO` (única que pone `isVerified = true`); más lejos = `FUERA_DEL_SITIO`; sin ubicación del navegador = `SIN_GPS`; visita sin lugar (propio o de su oportunidad) = `SIN_UBICACION`.
- Si es `FUERA_DEL_SITIO` o `SIN_GPS` y falta `confirmado: true`, el servidor NO guarda y responde 200 `{requiereConfirmacion:true, resultado, distanciaM, maximoM, lugar}` (no excepción: `AllExceptionsFilter` descarta campos extra); `VisitasPage` pide confirmar. La decisión es del SERVIDOR.
- Columnas nulas `ClientVisit.checkInResult`/`checkInDistanceM`; los check-in anteriores quedan verificados con `checkInResult` nulo («Check-in anterior»); Resultados cuenta «en el sitio» solo `EN_SITIO`.
- Sin hacer: `completeVisit` no valida ubicación; se puede repetir el check-in de una visita en curso.

## 31. Servicios = una sola fuente, encabezados compactos y ejemplos mínimos

- El catálogo de Configuración → Servicios es la ÚNICA fuente: uno desactivado o borrado no se asocia a nada nuevo (ni por API): `VentasOportunidadesService.validarServicios` (al editar conserva los que ya tenía), `ventas-leads.service.ts` `convertir`, `ventas-acuerdos.service.ts`.
- «Referir un cliente» muestra los servicios ACTIVOS (`GET /ventas/clientes/servicios-referir`, sin `@Section`) y manda `serviceIds`; el camino viejo `servicioRequerido` sigue aceptándose. Los filtros por servicio sí muestran desactivados.
- «Volver» solo en detalle o segundo nivel, nunca en pantallas del menú lateral.
- Ejemplos locales: `backend/prisma/seed.ventas.js` (máx. 3 por función, sin prefijo «[EJEMPLO]»; `--limpiar` reconoce lo suyo por `externalId` «EJEMPLO-…» o `extra.ejemplo = true`; `--completo` carga todo). No se sube.

## 32. Plantilla de pantalla para todo Ventas, Cotizador con scroll propio y configuración en un solo lugar

- `<VentasPageHeader>` y `<PageTabs>` en las 9 pantallas de Ventas (botón principal al final, «Cómo funciona» primero, siempre con descripción corta de una línea ~115 caracteres). Reglas en `CLAUDE.md`.
- Cotizador: encabezado estándar; el catálogo tiene altura fija con scroll interno y solo la cotización se mueve con la página. Puede tener su propio catálogo, distinto del de Servicios.
- Configuración en un solo lugar (motivos, servicios, conexiones): sin atajos en Contratos ni Posibles clientes. **Etapas** (Oportunidades) y **Campos** (Directorio) siguen como modales y Etapas debe seguir 100 % funcional.
- El texto bajo una opción de «⋯» solo explica POR QUÉ está bloqueada. Manual de IA (`system-guide.util.ts`) y su test deben seguir esta estructura.
- Documentación: «Nuevo documento» es un botón con menú («Generar desde una plantilla» / «Subir uno ya hecho», `RowActionsMenu` prop `boton`); «Plantillas» y la carpeta de Drive en el encabezado; «Vincular clientes» y «Sin cliente asignado» solo si hay documentos sin cliente.

## 33. Motivo de la pérdida visible y respuestas cortas del Agente de Ventas

- Bajo «Perdida» va el motivo (`motivoPerdida`); el Historial muestra «Motivo: … (según el vendedor / lo dijo el cliente)». Se guarda aparte (`SalesReasonEntry`, misma transacción, `detail.hacia`) y se une al cambio por oportunidad y cercanía (`motivo-perdida.util.ts`). Sin motivo no se muestra ni inventa. El Historial no muestra números internos.
- Agente de Ventas: respuestas cortas, sin `[#…]`, enlaces ni números internos (`agents-ai.md`); «Cambios de responsable» es una nota fija que solo se menciona si preguntan.

## 34. «Volver» solo en detalle y botones de acción con icono

- «Volver» solo en detalle o segundo nivel (se queda en Cacao —cuelga de `/cacao`—, detalles/formularios de Contratación Pública, plantillas y generar documento de RRHH, proyectos y tareas).
- Botones de acción de fila: `btn-secondary icon-btn` con `Pencil`, `Trash2` en rojo (`style={{ color: '#c53030' }}`) y `ClipboardList`, siempre con `title` y `aria-label`; sin «✕» ni emojis. `modal-close` no se toca.

## 35. Dashboard comercial gráfico, con botones que filtran y cuentan lo mismo que la lista

- Una barra («Cifras de», «Periodo» único: sección 43). `Tarjeta`, `KpiFila`, `Contador`; estilos en `frontend/src/styles/vistas.css` (DASHBOARD); gráficos SVG propios en `components/ventas/dashboard/DashboardGraficos.tsx` (sin librería); tablas en tarjetas con `data-tablas-vivas="off"`.
- **El embudo y la aceptación del Resumen cuentan OPORTUNIDADES, no clientes** (`VentasClientesService.getDashboard`): cada una del alcance y, para una empresa SIN oportunidades pero con etapa guardada, la de su ficha; sin etapa no cuenta. Así coincide con la lista.
- **«Mis clientes»** = empresas con una oportunidad a mi nombre o con mi nombre del sistema anterior, también en Cartera, Retención y Motivos (`VentasAnaliticaService.idsClientes`); `GET /ventas/analitica/clientes-del-alcance?alcance=` (lo usan Directorio y Contratos).
- **Todos los botones del Dashboard llevan el alcance** (`responsable=mine|all|<id>`): Oportunidades lee `?responsable=`, `?origen=REFERIDO`, `?etapa=`, `?motivo=`, `?vista=hoy`; Directorio y Contratos usan `useClientesDelAlcance` y `ChipAlcance`; Posibles clientes `?estado=`, `?motivoDescarte=`, `?responsable=`; Contratos `?estado=EN_CURSO` (vigentes + por vencer + por iniciar) y `?motivo=`.
- Pestañas «Embudo de ventas» y «Motivos de pérdida» (tres donas: descartados, perdidas, contratos que se pierden = cancelados + vencidos sin renovar). `GET /ventas/entrantes` trae `motivoDescarte`. Filtros: Oportunidades «Origen» y «Motivo de pérdida»; Posibles clientes «Motivo del descarte»; Contratos «Motivo de cierre».
- **Alcance por rol:** todo el que tiene acceso a Ventas puede elegir «Toda la empresa» en todas las pestañas (solo lectura); ver a OTRO vendedor es de ADMIN/MANAGER; sin elegir, el empleado ve lo suyo y ADMIN/MANAGER la empresa (`VentasAnaliticaService.vendedor`). «Cifras de» (ADMIN/MANAGER) lista a todas las personas con acceso a Ventas más quienes ya llevan clientes u oportunidades (`getDashboard.responsables`).

## 36. Origen único, etapas en una sola dirección y reapertura con «!»

- **Origen de una oportunidad = UNA lista** (`origenDeOportunidad`, frontend): fuente del contacto + «Renovación» + «Ya era cliente»; `MIGRADA` y fuentes desconocidas = «Ingreso manual». `originType` y `source` se guardan tal cual.
- **Etapas en cualquier sentido** (`etapas-sentido.util.ts`, aplicado en `cambiarEtapa`; la UI usa `tipoCambioEtapa` de `utils/etapasVentas.ts`): una abierta pasa a cualquier otra etapa (adelante o atrás); una cerrada se **reabre** a la etapa que se elija; Aceptada⇄Perdida se corrige directo. La nota del cambio es opcional (en Perdida el motivo sigue siendo obligatorio). Reabrir limpia `outcome` y `closedAt`; el cliente se refleja solo (`espejarCliente`); el contrato creado al aceptar NO se borra y los avisos a Google no se retiran ni se repiten. La visita de campo solo propone AVANZAR la etapa.
- «!» de reapertura: `reabierta` sale del historial (final → no final), sin columna. La dona de motivos ignora una oportunidad que ya no está Perdida y cuenta solo el último si se perdió dos veces. «Nueva oportunidad» no pide monto ni fecha (se piden al pasar a Cotizada).

## 37. Tipo de contrato editable, tres tamaños de modal y job de renovaciones

- El tipo se cambia al EDITAR (`UpdateSalesAgreementDto.kind`, `updateAgreement`). A venta única: quita fin, valor mensual y gracia, queda «Por entregar»; a servicio: quita garantía y valor total, queda activo con gracia sugerida. Se RECHAZA pasar a venta única si renueva a otro, ya fue renovado o tiene oportunidad de renovación. Deja nota en el historial.
- Modales de Ventas: `.modal.modal-ventas-sm|md|lg` = 470/740/970 px (+ `.modal-ventas-xl` 1250 px SOLO para el gestor del catálogo del Cotizador). Nunca `style={{ maxWidth }}` en línea. Los campos de texto dentro llevan `min-width: 0`.
- El job `ventas-renovaciones-diarias` existe; el de Contratación Pública NO (módulo en pruebas).

## 38. Filtro «Fecha» en las listas y Dashboard que coincide con ellas

- Filtro «Fecha» (`components/common/FiltroFecha.tsx`, `utils/rangoFechas.ts`) en Oportunidades y Posibles clientes («Llegó»), Directorio («Ingresó», `createdAt`) y Contratos («Empieza»): Hoy, Esta semana, Este mes, Mes pasado, Últimos 90 días, «Rango». Filtra en el navegador.
- **Los días son los de Ecuador (UTC-5 fijo)** en filtro, columnas (`diaCortoEcuador`) y servidor (`HORAS_ECUADOR_MS`).
- Los botones del Dashboard con periodo mandan `?desde=&hasta=&responsable=`.
- **«Referidos» cuenta OPORTUNIDADES** con origen Referido llegadas en el periodo (`origen-referido.util.ts`: fuente REFERIDO y origen que no sea Renovación, Ya era cliente ni Migrada); con un vendedor, solo las suyas. «En curso» = todo referido abierto; las tres cifras suman el total. «Nuevos» cuenta registros del Directorio.
- «Motivos de pérdida» cuenta por la fecha del motivo y sus botones abren todos los casos del motivo; el «Embudo» no abre listas.

## 39. Planificación y Campo encendida y conectada a la oportunidad

- Encendida: `PLANIFICACION_Y_CAMPO_ACTIVA = true` en `Sidebar.tsx`; `system-guide.util.ts` la documenta y su spec comprueba que aparezca.
- Visibilidad «todos todo»: cualquiera con Ventas ve, edita, borra y hace check-in de todas las visitas de la empresa (`checkInVisit` ignora `userId`); cambiarlo sería filtrar por `userId` salvo ADMIN/MANAGER.
- `VisitaModal` (`modal-ventas-md`) trae «+ Nueva oportunidad» (mismo `OportunidadModal`). **Oferta y cierre** (`VisitaOfertaModal`): servicios del catálogo (`ServiciosPorCategoria`), monto y resultado.
- **`VentasService.completeVisit`** (`POST /ventas/visits/:id/complete`, con `serviceIds`): `commercialOffer` con nombres de servicios; si hay oportunidad ABIERTA, en la misma transacción suma servicios (sin duplicar) y `quotedAmount`; devuelve `oportunidadActualizada`. **La etapa NO la cambia el servidor:** la pantalla abre «Cambiar de etapa» hacia `INTERESTED→LEIDO`, `QUOTED→COTIZADO`, `CLOSED_SALE→ACEPTADO`, `NOT_INTERESTED→RECHAZADO` solo si `etapaPermitida`; `FOLLOW_UP` no mueve nada; si se cancela, la visita queda completada.
- «Resultados» (`VentasReportes`): fechas con `diaCorto`, etiquetas en `utils/visitasVentas.ts`; sin tarjeta «Retorno marketing» (leía el módulo viejo). Sin verificar: check-in con GPS real.

## 40. Nueva relación «Solo datos»

Una empresa o persona del Directorio SIN oportunidades ni contratos es **«Solo datos»**; «Prospecto» = tiene oportunidades y ninguna ganada. `calcularCicloVida` (`client-lifecycle.util.ts`): sin contratos y sin oportunidades → `SOLO_DATOS`; con oportunidades, `PERDIDO` (todas perdidas) o `PROSPECTO`. Se calcula, no se guarda. Se refleja en `CicloVida`/`CICLO_LABEL`/`CICLO_COLOR` (frontend y backend), filtro «Relación» (`?ciclo=SOLO_DATOS`), Cartera, contadores de analítica, el Agente de Ventas y los textos de ayuda.

## 41. «Venta de producto» pasa a llamarse «Venta única»

Solo texto: `kind = 'PRODUCTO'` y su comportamiento (sección 16) NO cambian. «Venta única» cubre un producto O un servicio de una sola vez (custodia puntual, instalación); se evitó un tercer tipo (tocaba ~17 archivos y la relación Cliente/Inactivo). Quien solo compró una venta única sigue siendo Cliente. El nombre se usa en pantalla, errores del servidor, Agente de Ventas y su guía.

## 42. Exportar cualquier tabla de Ventas a Excel, PDF o CSV, con historial opcional

- `ExportTableButton` en Oportunidades, Posibles clientes, Directorio, Contratos, Documentación y Visitas (columnas elegibles y ordenables; filas con filtros y orden). Reutiliza el modal genérico de Guardias (RRHH).
- CSV en el navegador (con BOM). Excel (`exceljs`, montos numéricos, resto texto) y PDF (`html-pdf-node`, horizontal) en el servidor: `POST /ventas/exportar-tabla` (`ventas-exportar.controller.ts`, VENTAS ver, máx. 20 000 filas y 60 columnas; `common/utils/tabla-export.util.ts`).
- Columna «Historial» solo si se marca: `POST /ventas/exportar-tabla/historial` (`VentasHistorialExportService`): cambios de etapa, motivos, nota de la oportunidad y, de la ficha, notas/llamadas/reuniones/correos (son del CLIENTE: dos oportunidades repiten las mismas). Sin el botón: «Para hoy», Cotizador y tablas de Configuración.

## 43. Un solo periodo en el Dashboard, «Llegó» de la oportunidad, Ubicación y filtros por columna con botón único

- **Un solo «Periodo»** para las cinco pestañas (`VentasDashboard`, `FiltroFecha`, `utils/rangoFechas.ts`): Esta semana, Este mes (defecto), Mes pasado, Últimos 90 días, Este año, «Personalizado». Las tarjetas que miden «hoy» no se mueven y lo dicen (`dash-etiqueta-hoy`).
- **Un solo criterio: el día en que LLEGARON las oportunidades** (también «Aceptación»); «Bajas y reducciones», «Documentos» y «Oportunidades por responsable» siguen el periodo. Abierto: el Resumen cuenta todas las oportunidades y el Embudo excluye históricas y renovaciones.
- **«Llegó» es de la OPORTUNIDAD** (`SalesOpportunity.receivedAt`, `fecha-llegada.util.ts`): sin fecha elegida es ahora; cambiar la fecha de ingreso de la empresa NO la mueve. Campo «Fecha en que llegó» (día de Ecuador): se rechaza futura, posterior al primer cambio de etapa o al cierre (los tiempos se miden desde ahí). Las oportunidades antiguas conservan la fecha del cliente.
- Columna «Ubicación» (ciudad y provincia) en Oportunidades, con filtros `?provincia=`, `?ciudad=`. **Mapa ↔ Oportunidades:** el mapa sigue el periodo y sus enlaces abren la lista con origen **«Ventas nuevas»** (`ORIGEN_VENTAS_NUEVAS = 'NUEVAS'`: sin renovaciones ni «Ya era cliente», igual que el embudo; `utils/oportunidadesMapa.ts`); ubicaciones sin ciudad se agrupan por provincia (`SIN_CIUDAD`).
- Contratos, filtro «Vigente en»: cuenta si el contrato estuvo en pie algún momento del periodo.
- **Filtros por columna** (`components/common/ColumnFilter.tsx`, `hooks/useColumnFilters.ts`, `utils/columnFilters.ts`): un botón por cabecera con panel estilo Excel según el tipo (casillas con buscador y «Solo»; fechas; números mín/máx; texto «contiene»), chips (`ChipsFiltros`) y escobita (`ClearFiltersButton`); los enlaces del Dashboard se traducen en `utils/ventasFiltrosUrl.ts`. **Un solo botón por columna para ordenar y filtrar** (panel con línea «Ordenar» y debajo el filtro; `cf.ordenDe`). Estándar para toda tabla nueva (`RECOMENDACIONES_UX_UI.md` §25, `CLAUDE.md`).
- Abierto: Posibles clientes abre con el chip «Estado: Sin procesar, Contactado» (limpiar muestra también convertidos y descartados); Documentación filtra en pantalla (con muchos, revisar).

## 44. Clics de WhatsApp de las landings: Campaña → Landing → clic → conversación → posible cliente

**Qué hace.** Cada toque al botón de WhatsApp de una landing se guarda con un código `GMS-WA-XXXXXX` (único por clic) y la atribución (utm_*, gclid, fbclid, landing, servicio). **Un clic NO es un posible cliente**: es dato de medición en su propia tabla.

**Decisiones de Leidy (no re-proponer):** los clics no tienen etapas propias (WhatsApp es una fuente más; las etapas viven en Oportunidades); los clics sin mensaje se guardan siempre (sin datos personales) y se cuentan en el Dashboard; **no hay pestaña de clics** (un clic no siempre es el primer paso): el encabezado de Posibles clientes es `[?] [Llegó un WhatsApp] [+ Nuevo posible cliente]` y la lista es una ventana (`ClicsWhatsappModal`) abierta desde «Llegó un WhatsApp» y «Ver clics» del Dashboard; Oportunidades no tiene columna «Código WhatsApp» (el detalle vive en la ficha); las 48 h solo ORDENAN (Esperando < 48 h, Sin mensaje aún, Ya escribió) y nunca bloquean; un solo embudo en el Dashboard.

**Flujo.** Landing (script) → `POST /api/ventas/whatsapp/clic` (público) → llega el mensaje con el código → «Llegó un WhatsApp» (`LlegoWhatsappModal`): código + «Buscar» (`GET /ventas/whatsapp-clics/buscar?codigo=`, sin límite de edad) → nombre y teléfono o correo → nace el posible cliente (fuente WhatsApp, `externalId` = código, `extra.trackingId`, atribución del clic; con `gclid` siguen las conversiones) y el clic queda enlazado (`status = CONVERSACION`, `leadId`). Otros caminos: «Escribió» por fila (`POST /ventas/whatsapp-clics/:id/escribio`), «Código del mensaje» en «+ Nuevo posible cliente», «Enlazar código de WhatsApp» en «⋯» (`POST .../enlazar` `{leadId, codigo}`, completa sin pisar). Todos pasan por `VentasWhatsappClicsService` (`atribucionDeCodigo`, `buscarPorCodigo`, `enlazarALead`, `vincular`), que rechaza un código mal escrito, desconocido o ya enlazado. Sin código el posible cliente se crea igual, sin atribución.

**Ficha.** `VentasOportunidadesService.list/get` leen `SalesOpportunity.leadId` → `extra.trackingId` y devuelven `whatsapp: {codigo, campana, landing, servicio, fechaClic} | null` (sin copiar datos); `ClienteFichaPanel` («Resumen») muestra «WhatsApp de la landing». No se ve en Contratos. Estados de la guía (calculados): clic sin lead, enlazado, En evaluación o más, Cotizada/Propuesta/En negociación, Aceptada, Perdida o descartado.

**Dashboard: UN solo embudo** («Embudo de ventas», «De posible cliente a venta»): **Origen** (Todos, Botón de WhatsApp de la landing, Formulario y otros), **Servicio** y **Agrupar por** (Canal, Campaña, Landing, Servicio, Grupo de servicio, Canal › Servicio, Campaña › Servicio, Ciudad, Ciudad › Campaña, Responsable); Contactos → En evaluación o más → Recibieron cotización → Contrataron, y tabla (Clics WhatsApp, Contactos, …, Vendido = suma de `quotedAmount` ganadas). Contacto = posible cliente de servicio llegado en el periodo (una persona, una vez). Los clics van aparte (línea «N clics, M escribieron», columna «Clics WhatsApp»; no se muestran al ver «lo mío» o a un vendedor: `conClics: false`). **A quien llegó por un clic se le atribuye el canal, campaña, landing y servicio DEL CLIC**, no «WhatsApp» (`canalDeClic` reutiliza `atribuirCanal`). «Cotizó» = fecha de cotización, o está/pasó por Cotizada / Propuesta enviada / En negociación, o aceptada (`cotizoOportunidad`, `ETAPAS_DE_COTIZACION` en `ventas-marketing.util.ts`: si la empresa crea otra etapa de cotización, agregarla ahí). Lógica `embudoUnico`; clics de `clicsDelPeriodo`/`clicsDeLeads`; `VentasAnaliticaService.marketing` (`GET /ventas/analitica/marketing?agrupar=&origen=&servicio=&ciudad=`). `etiquetasUnificadas` junta nombres de servicio que difieren solo en tildes, mayúsculas, guiones bajos o «de»/«para»; nombres realmente distintos quedan como dos filas: usar el mismo nombre en la tabla de landings y en el script. No hay sesiones GA4 ni costos, así que el ROAS no se calcula.

**Tabla y endpoints.** `SalesWhatsappClick` (`whatsapp-clics.schema.ts`, al arrancar, SIN modelo en `schema.prisma`: se lee con SQL), único `(companyId, trackingId)`; reglas puras en `whatsapp-clics.util.ts`. `GET /ventas/whatsapp-clics` (`?codigo=`), `/buscar`, `POST /:id/escribio`, `POST /enlazar`, `GET /clave` (crea la clave pública la primera vez; se ve en Configuración → Conexiones → «WhatsApp de las landings» con la etiqueta `<script>`).

**Seguridad del endpoint público.** El navegador no puede llevar la `X-API-KEY`: se usa una **clave pública por empresa** (`SalesSetting` clave `whatsapp`, `{siteKey:"gwa_…"}`) que solo registra clics anónimos; código de formato estricto, 30 clics por IP cada 10 min (en memoria), CORS de esa ruta limitado a `gemeseg.com` y `www.gemeseg.com` (`main.ts`; `WA_CLICK_ORIGINS` añade otros) y solo se guarda la URL sin parámetros.

**Script** `landings-whatsapp/_shared/gemeseg-wa-tracking.js` (idéntico en `NUEVA_PAGINA_WEB_GEMESEG/public/`: si se cambia uno, copiar al otro). Guarda la atribución en `localStorage` (`gms_wa_attr`) y NO la pisa al navegar (solo una visita con UTM o clic de anuncio nuevo); intercepta `wa.me`/`data-wa`: código → CRM (un reintento) → `dataLayer.push({event:'whatsapp_click'})` → `wa.me/<número>?text=Hola, deseo recibir información sobre [Servicio]. Código: [código]`. Nunca debe romper la página: si falla, el botón igual abre WhatsApp. Instalación: WordPress (`$gl_wa_site_key`, `$gl_wa_script` en las `template.php`) y Astro (`PUBLIC_WA_SITE_KEY` en `BaseLayout.astro`, `connect-src https://app.gemeseg.com` en `vercel.json`).

**Número y ciudad.** El script manda `whatsapp_number` (`SalesWhatsappClick.whatsappNumber`, solo dígitos 8-15; si no parece teléfono se ignora y el clic se guarda). Lo que importa es la **ciudad**: Configuración → «WhatsApp de las landings» crea ciudades con uno o varios números (`SalesSetting` clave `whatsapp_ciudades`, `{ciudades:[{nombre, numeros:[…], responsableId?, campanas:[…]}]}`; `GET/PUT /ventas/whatsapp-clics/ciudades`; un número en una sola ciudad; sin ciudad = «Sin ciudad»). La ciudad se CALCULA al armar el embudo desde el número del clic (mover un número reclasifica sus clics viejos). El formulario web no trae número: «Sin dato» salvo que el plugin mande `sede` (Loja si la landing viaja como `loja-<servicio>`, si no Guayaquil; el webhook la guarda en `extra.sede` y quita el prefijo `loja-`). Una campaña que empieza por `prueba` o `test` no cuenta en el Dashboard. Ciudad y campaña pueden tener responsable (el de campaña manda); el Dashboard agrupa por «Responsable» solo para informar (asignar automático: descartado).

## 45. Metas comerciales: meta por vendedor y de la empresa, y porcentaje de cumplimiento

Configuración → «Metas»: por **mes** o **año**, de la empresa y de cada persona, en **Ventas (USD)**, **Clientes nuevos** e **Impactos**; Dashboard → «Metas» compara lo vendido (avance, %, lo que falta, ritmo esperado).
- **Solo ADMIN y MANAGER:** las pestañas no se muestran a otros y `GET /ventas/metas`, `PUT /ventas/metas` y `GET /ventas/metas/cumplimiento` llevan `@Roles(ADMIN, MANAGER)` (403 al resto; el `PUT` además `@Section('VENTAS','write')`). La lógica para vendedores (solo su meta y la de la empresa) queda latente en el servicio.
- Monto vendido = `quotedAmount` de oportunidades aceptadas, aislado en `VentasMetasService.avances` (para conectar contabilidad sin tocar pantallas ni `ventas-metas.util.ts`). La meta global se fija aparte (no suma las de los vendedores).
- **Reglas** (`ventas-metas.util.ts`): impacto = oportunidad aceptada en el periodo (sin monto: suma 0 y la pantalla avisa); fecha de la venta = día de Ecuador de `closedAt` con `outcome = 'GANADA'` (reabrir borra `closedAt`); se excluyen `HISTORICO`, las `RENOVACION` cuentan; **cliente nuevo** = sin compra anterior (ni oportunidad aceptada previa o histórica, ni contrato con inicio anterior no originado por estas ventas), cuenta UNA vez y se atribuye al responsable de su primera venta del periodo; ventas sin responsable suman a la empresa.
- **Periodos:** la semana = meta mensual de su lunes ÷ 4; «Este mes»/«Mes pasado» usan la del mes, «Este año» la anual; «Últimos 90 días» y personalizados no tienen meta (cifras sin %). El Dashboard manda `periodo` (`semana|mes|anio|ninguno`).
- **Semáforo por ritmo:** verde si va al ritmo o cumplió; amarillo si va a menos del ritmo pero >80 % de él; rojo debajo. Meta 0 = sin meta.
- `vendedorDelAlcance` (`alcance=mine|all|id`; un id ajeno solo ADMIN/MANAGER); mirando a toda la empresa, tabla por persona con fila **Total**.
- **Tabla** `SalesMeta` (`ventas-metas.schema.ts`, al arrancar, SIN modelo en `schema.prisma`): una por `(companyId, COALESCE(userId,0), kind, periodKind, year, month)`; `userId` nulo = empresa; `month` 0 en anuales; `kind` `MONTO|CLIENTES_NUEVOS|IMPACTOS`; `periodKind` `MES|ANIO`. `PUT` guarda o borra todo un mes o año (todo o nada; `target` nulo borra).
- `MetasConfigSection` (`?tab=metas`): «Copiar de [periodo anterior]» rellena sin guardar; con cambios sin guardar los selectores se bloquean (sin `window.confirm`). `DashboardMetas` usa `Tarjeta`.
- Obsoleto sin borrar: `SalesGoal` (`/ventas/goals`). No verificado: la semana que cruza dos meses (usa el mes de su lunes) y años con metas anuales sin mensuales.

## 46. Tabla dinámica en el Dashboard: filas, columnas, filtros y total

- Dashboard → «Tabla dinámica» (con «Cifras de» y «Periodo»): **Filas** (una dimensión; opcional segundo nivel con subtotal plegable), **Columnas** (una dimensión o «Solo el total»), **Datos** (Monto USD, Ventas, Clientes, Ticket promedio; siempre grupo «Total») y **Filtros**; siempre fila final «Total». El último diseño se recuerda en `localStorage` (validado).
- **Dimensiones:** Vendedor, Cliente o empresa, Servicio, Provincia y Ciudad (Ubicación de la oportunidad), Mes de la venta, Tipo de venta (Posible cliente, Referido, Nuevo servicio de un cliente, Renovación, Ingreso manual) y Rango de precio (<$500, $500–1,999, $2,000–9,999, ≥$10,000, Sin monto). Tipo de negocio y público/privado (sección 47) aún no son dimensión: se agregan en `ventas-pivot.util.ts`.
- **«Venta»** = igual que Metas (`GANADA` con `closedAt` en el periodo, sin `HISTORICO`; renovaciones sí). Monto = `quotedAmount` (sin monto: suma 0 y se avisa). «Lo más vendido» sale de los servicios de la oportunidad, no de productos de cotizaciones.
- **Varios servicios:** el monto se reparte en partes iguales en centavos exactos (`repartir`); filtrar por un servicio deja solo su parte. Ventas y Clientes cuentan sin repetir: agrupando por servicio el total puede ser menor que la suma de celdas (se avisa). Ticket = monto ÷ ventas.
- Máx. 12 columnas (24 si meses o rangos); lo demás junta en «Otros» (filas: 300 arriba, 100 por grupo). Orden por monto desc.; meses en calendario, rangos de menor a mayor.
- `GET /ventas/tabla-dinamica?alcance&desde&hasta&filas&columna&medidas&filtros` (solo lee, sin tablas nuevas). **Solo ADMIN y MANAGER** (`@Roles`, 403 al resto; la pestaña no se muestra). `vendedorDeLaConsulta` (latente): un vendedor que pide «Toda la empresa» recibiría solo SUS ventas. `filas` admite 1 o 2 dimensiones separadas por coma; `filtros` JSON `{dimension:[valores]}`; valida todo y responde 400 corto.
- Código: `ventas-pivot.util.ts` (`construirPartes`, `armarPivot`, `opcionesDeFiltro`, `parsearConsulta`, `repartir`; spec), `ventas-pivot.service.ts` (tope 20 000 ventas), `ventas-pivot.controller.ts`; frontend `DashboardPivot.tsx`, `getTablaDinamica`, estilos `.pivot-*` en `vistas.css`. Sin botón «Exportar».

## 47. Lista del asesor: campos del cliente, filtros del Dashboard, clientes nuevos/impactados/recurrentes y motivo de visitas no cumplidas

Decisiones de Leidy: campos nuevos del cliente con lista base fija + «Otro» (texto) y SIN pantalla de configuración nueva; **provincia y ciudad NO van en el cliente** (son de la oportunidad, y los filtros usan esa); Dashboard global/personal e integraciones con contabilidad: futuro.
1. **«Tipo de negocio» y «Público / Privado»:** campos núcleo en `CORE_CLIENT_FIELDS` (`ventas-clientes.service.ts`): `tipo_negocio` (SELECT con «Otro (especifique)»: Banca y finanzas, Comercio, Industria y manufactura, Agroindustria, Minería y petróleo, Transporte y logística, Construcción e inmobiliaria, Salud, Educación, Gobierno / entidad pública, Servicios, Residencial / persona natural) y `sector` (Público, Privado, Mixto; sin «Otro»). Van en `SalesClient.extra`, se crean por empresa con `ensureCoreFields` (un campo propio con esa clave pasa a núcleo conservando sus opciones); se ven en «Nueva empresa o persona» (`CAMPOS_VISIBLES`), la ficha y como columnas/filtros del Directorio.
2. **Filtros del Dashboard** (`FiltrosSegmentoBar.tsx`) en Resumen, Cartera, Embudo y Motivos: Tipo de negocio (con «Otro (escrito a mano)» y «Sin dato»), Público / Privado, Servicio, Provincia y Ciudad (de la oportunidad; `GET /ventas/analitica/lugares`). Query `?tipoNegocio&sector&servicioId&provincia&ciudad` (`servicioId`, no `servicio`: el embudo de marketing ya usa `servicio`). Servidor: `ventas-segmento.util.ts` (`leerFiltros`, `armarSegmento`); tipo/sector se comparan en memoria sobre `extra`. Se aplican DENTRO del alcance de «Cifras de» (nunca lo amplían) en `getDashboard`, `cartera`, `retencion`, `embudo`, `mapa`, `aceptacion`, `motivos` y `clientesImpactados`; con filtros, Motivos no cuenta posibles clientes descartados. No aplican a Metas, Tabla dinámica, Equipo ni al embudo «De posible cliente a venta». El Dashboard los limpia al salir (`setFiltrosDashboard`).
3. **«Clientes nuevos, impactados y recurrentes»** (`DashboardImpactados.tsx`, `GET /ventas/analitica/clientes-impactados`): venta = regla de Metas; impactados = empresas con ≥1 venta; nuevos = sin venta ni contrato anterior (regla de Metas); recurrentes = el resto. Cada cifra abre la lista.
4. **Motivo de visita no cumplida:** «Cancelar la visita» abre `VisitaNoCumplidaModal` (lista fija `MOTIVOS_VISITA_NO_CUMPLIDA` en `utils/visitasVentas.ts` + «Otro» con texto + detalle) y el servidor exige el motivo (400 sin él). Columna nula `ClientVisit.cancelMotivo` (`sales-visit.schema.ts`, `schema.prisma`); el detalle se añade a las notas. La lista no se configura.

## 48. «Es nueva en el directorio» dentro de Nueva oportunidad y formato de las ventanas (2026-11-19)

**Antes:** en Oportunidades, «Es nueva en el directorio» abría la ficha vieja del Directorio (`ClienteFormModal`, en modo negociación: estilo antiguo, pedía «Servicio requerido» y «Fecha de ingreso») y el servidor creaba la oportunidad por su cuenta; se perdían los servicios, el título, la ubicación y las notas ya marcados en «Nueva oportunidad».

**Ahora (decisión de Leidy):** el selector se cambia, en la MISMA ventana (`OportunidadModal`, prop `camposCliente`), por el bloque «Empresa o persona nueva»: Nombre* y Fuente* (obligatoria, sin valor por defecto, con sus subopciones si las tiene), Tipo de negocio y Público/Privado (opcionales, vacíos), y correo/teléfono/cédula-RUC/dirección plegados en «Más datos (opcional)». No se pide «Servicio requerido» (son los servicios de la oportunidad) ni fecha de ingreso (se usa la «Fecha en que llegó»). Al guardar: `createSalesClient({ soloDatos: true })` y luego `createOportunidad` con todo lo marcado (la oportunidad toma la fuente de la empresa). No es atómico: si la segunda llamada falla, la empresa queda guardada, el bloque se bloquea con «Ya quedó guardada en el directorio» y el siguiente «Guardar» solo crea la oportunidad. En Fuente no se repite «Otro (especifique)» cuando la lista ya trae «Otro». Las otras pantallas que usan `ClienteFormModal` (Directorio, Dashboard, Visitas) no cambiaron.

**Verificado en local (3000/5174, 1530×740, sin scroll horizontal):** validación de nombre y de fuente, alta completa (una sola oportunidad, servicio, origen «Referido», `extra` con fuente/tipo/sector); registros de prueba borrados. Sin pruebas jest/vitest nuevas.

**Mismo día, ficha del Directorio (`ClienteFormModal`):** pedido de Leidy al ver que «+ Nueva empresa o persona» del Directorio tenía el mismo formato viejo. Ahora usa el formato de Nueva oportunidad (`form-group`, `form-ayuda`, cuadrícula `.ficha-grid` de dos columnas que pasa a una bajo 560px, «Más datos» con `.form-mas`) y los errores se muestran dentro de la ventana con `ErrorBanner` en vez de un toast. No cambia ningún campo ni lo que se guarda; aplica a todas las pantallas que la usan (Directorio, editar ficha, Dashboard, Visitas). También quita el «Otro (especifique)» repetido en Fuente. Verificado en local: alta con «Otro» en Tipo de negocio (se guarda el texto, sin oportunidad), aviso de nombre vacío, apertura de «Editar ficha» con sus datos, sin scroll horizontal; registro de prueba borrado.

**Mismo día, todas las ventanas (estilo común en `styles.css`, afecta a TODA la app):** (1) menos espacio bajo el título: `.modal-header` 16px arriba/abajo (era 20) y `.modal-body` 16px arriba (era 24); (2) toda ventana con la estructura estándar (`.modal` > `.modal-header` / `.modal-body` / `.modal-actions`) deja fijos el título y los botones y solo desplaza el contenido. Antes se desplazaba la ventana entera y la barra cortaba las esquinas redondeadas de la derecha. Va con `:where` para no pisar los ajustes propios (`.modal-tarea`, catálogo del Cotizador, clics de WhatsApp, `.cus-modal`). Revisado en local: Nueva empresa o persona, Nueva oportunidad y catálogo del Cotizador; el resto de ventanas no se abrió una por una.
