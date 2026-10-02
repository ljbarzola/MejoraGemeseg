# Módulo Contratos — Ventas/CRM

> Este archivo se llamaba `backend/.agents/CONTRATOS-PLAN.md` (carpeta ignorada por git, así que solo existía en un equipo). Desde 2026-10-02 vive aquí, versionado junto al resto de los módulos. En el código y en otros documentos puede aparecer todavía el nombre viejo; es este mismo documento. Las secciones se citan por número ("sección 8").

**Estado:** Implementado
**Fecha original:** 2026-09-01
**Reescrito:** 2026-09-16 — el diseño original de este documento (editor visual de clic-para-posicionar campos, `SalesField.positionX/Y`, sync de plantilla completa a BoldSign) **nunca se construyó así**. Lo que hay en producción es un diseño más simple, descrito abajo. Si encuentras referencias al editor visual en otro lado (código o memoria vieja), son del diseño original abandonado — no reflejan la realidad.

---

## 1. Arquitectura real

```
1. CREAR PLANTILLA
   Link de Google Drive/Doc (.docx) → Descargar a uploads/templates/
   → Detectar variables [Variable] o <<Variable>> en el texto
   → Configurar cada variable: tipo (texto/número/fecha/.../TABLA), quién la llena, opcional tableConfig

2. CREAR CONTRATO
   Seleccionar Plantilla → Datos Cliente → Llenar campos de empresa
   (tablas del vendedor se llenan aquí; tablas del cliente generan un link)
   → Generar PDF (LibreOffice, fusiona variables + tablas nativas)
   → [si hay tablas del cliente pendientes] Cliente completa por link público
   → Enviar a firma (SignWell — ver sección 8)

3. FIRMA DEL CLIENTE
   SignWell envía email → Cliente firma
   → webhook document_completed (si SIGNWELL_WEBHOOK_ID está configurado) o subida manual → SIGNED, ver sección 8
```

No hay editor visual ni posicionamiento por coordenadas de ningún tipo. Las variables son texto plano en el `.docx` (`[Variable]` o `<<Variable>>`) que se reemplazan por sustitución de texto (o, para tablas, insertando una tabla real de Word — ver sección 4).

---

## 2. Modelos Prisma (reales)

### SalesTemplate
- `id`, `name`, `description`
- `driveUrl` — link de Google Drive/Doc con el `.docx` fuente
- `docxPath` — ruta local del `.docx` descargado (`uploads/templates/`)
- `generatedPdfPath` — no se usa activamente hoy (queda de una versión anterior)
- `emailSubject`, `emailBody` — valores por defecto del correo de envío (usados como `subject`/`message` al enviar por SignWell, sección 8)
- `numberingPrefix`, `numberingDigits` (default 5), `numberingNext` (default 1) — numeración automática del contrato (2026-09-16), ver sección 6
- `driveFolderId` — subcarpeta de Drive de esta plantilla, creada perezosamente (2026-09-16), ver sección 6
- `companyId`, `createdBy`, `createdAt`, `updatedAt`
- Relaciones: `fields: SalesField[]`, `contracts: SalesContract[]`

### SalesField
- `id`, `templateId`, `variableName` (el nombre tal cual aparece en el documento, ej. `Contrato.ID de Contrato`), `label` (editable, se muestra en el formulario)
- `fieldType`: `TEXT`, `NUMBER`, `DATE`, `EMAIL`, `CHECKBOX`, `DROPDOWN`, `SIGNATURE`, `TABLE`, `CONTRACT_NUMBER` (2026-09-16, ver sección 6 — nunca editable, lo asigna el sistema)
- `isRequired`, `isClientField` (ver "quién llena cada campo" abajo; no aplica a `CONTRACT_NUMBER`)
- `defaultValue`, `dropdownOptions: String[]`
- `allowMultiple: Boolean` (2026-09-16) — solo aplica a `DROPDOWN`: `false` (default) es selección única (`<select>` en `ContratoForm.tsx`); `true` es selección múltiple (checkboxes, el valor guardado en `fieldValues` es un arreglo, no un string — se listan con `, ` al sustituir la variable en el PDF). Las opciones se configuran una por una en un sub-panel en `TemplateConfig.tsx` (mismo patrón visual que las columnas de `TABLE`), no como un solo input separado por comas.
- `tableConfig: Json?` — solo para `fieldType = TABLE`: `{ columns: [{ key, label, type }], maxRows }`
- `order`

No existen `pageNumber`/`positionX`/`positionY`/`width`/`height`/`isReadOnly`/`validation`/`section` — eran del diseño del editor visual, se quitaron del DTO el 2026-09-10 por no usarse.

### SalesContract
- `id`, `templateId`
- `clientName`, `clientEmail` — lo único que pide `ContratoForm.tsx` hoy, sección "Datos para el envío" (2026-09-16, antes "Datos del Cliente" con 6 campos): es lo mínimo que usa `sendContract` para mandar a firmar, no una ficha completa del cliente. Si una plantilla necesita más datos del cliente (teléfono, dirección...), se configuran como campos normales (`Cliente.Teléfono`, etc.), no en este formulario fijo.
- `clientPhone`, `clientCompany`, `clientRuc`, `clientAddress` — siguen en el esquema (nadie las borró) pero **ningún flujo del UI las escribe desde 2026-09-16**; quedaron de antes de separar esto en campos configurables
- `fieldValues: Json` — `{ variableName: valor }`; para un campo `TABLE`, el valor es un arreglo de filas `[{ [columnKey]: valor }, ...]`; para el campo `CONTRACT_NUMBER` (si existe), el sistema inyecta el código generado aquí, ignorando cualquier valor que mande el cliente para esa clave
- `contractNumber: String?` (2026-09-16) — el código ya armado (ej. `MEGAMONT-00001`), copiado aquí para mostrarlo en listas sin ir a buscar dentro de `fieldValues`; `null` si la plantilla no tiene un campo `CONTRACT_NUMBER`
- `annexA`/`annexB`/`annexC: Json?` — **obsoletos**, ya no se leen ni se escriben (eran los 3 anexos hardcodeados, eliminados 2026-09-16). Se dejan en el esquema por compatibilidad con filas viejas, no por diseño activo.
- `generatedPdfPath` — puntero al PDF más reciente
- `signwellDocumentId`, `signwellStatus` (2026-09-17, reemplazan a `boldsignDocumentId`/`boldsignStatus`), `status` (`DRAFT`/`GENERATING`/`READY`/`SENT`/`SIGNED`/`CANCELLED`), `sentAt`, `signedAt` — `SIGNED`/`signedAt` se alcanzan por el webhook de SignWell si está configurado, o por la subida manual del PDF firmado como respaldo (ver sección 8)
- `clientFillToken: String? @unique`, `clientFilledAt: DateTime?` — token del link público para que el cliente complete tablas asignadas a él (2026-09-16)
- `companyId`, `createdBy`, `createdAt`, `updatedAt`

### SalesContractDocument (2026-09-10)
- `id`, `contractId`, `type` (`GENERADO`/`ENVIADO`/`FIRMADO`, el tercero desde 2026-09-16), `filePath`, `createdAt`
- Historial de versiones del PDF — cada `generate`/`send`/subida manual de firmado agrega una fila en vez de pisar el puntero anterior (antes, regenerar dejaba el PDF viejo huérfano en disco sin forma de recuperarlo).

---

## 3. Endpoints API (reales)

### Templates (`/ventas/templates`)
- `GET/POST/PATCH/DELETE /ventas/templates` — CRUD (creación es JSON con `driveUrl`, no upload multipart)
- `POST /ventas/templates/:id/download-drive` — descarga el `.docx` del link de Drive/Google Doc a disco
- `POST /ventas/templates/:id/detect-variables` — escanea el `.docx` buscando `[Variable]`/`<<Variable>>`, acepta nombres con espacios, puntos, tildes, paréntesis y `/`
- `POST /ventas/templates/:id/fields` — reemplaza todos los campos de la plantilla
- `PATCH /ventas/templates/:id` acepta además `numberingPrefix`/`numberingDigits`/`numberingNext` (2026-09-16, ver sección 6). La carpeta raíz de Drive **no** se guarda aquí — usa el endpoint genérico de `FolderConfig` que ya existe para RRHH: `GET/POST /personal/drive/config?type=VENTAS_CONTRATOS`.

No existe `GET /ventas/templates/file/:fileName` ni `POST /ventas/templates/:id/sync-boldsign` (el segundo existió pero se eliminó 2026-09-10 por no tener ninguna pantalla que lo llamara; era de la integración con BoldSign, ya removida del todo — sección 8).

### Contratos (`/ventas/contratos`)
- `GET/POST/PATCH/DELETE /ventas/contratos` — CRUD
- `POST /ventas/contratos/:id/generate` — fusiona `fieldValues` en el `.docx` y convierte a PDF (sección 4)
- `POST /ventas/contratos/:id/send` — envía a SignWell (sección 8)
- `POST /ventas/webhook/signwell` — **sin sesión**, recibe el evento `document_completed` de SignWell (sección 8)
- `GET /ventas/contratos/file/:fileName` — descarga el PDF, **protegida por sesión + pertenencia a la empresa** (antes era pública sin guard, corregido 2026-09-10)
- `GET /ventas/contratos/:id/documents` — historial de `SalesContractDocument`
- `POST /ventas/contratos/:id/documents/signed` — sube a mano el PDF ya firmado (sección 8, multipart, `FileInterceptor`, respaldo del webhook)
- `GET /ventas/contratos/public/:token`, `POST /ventas/contratos/public/:token/submit` — **sin sesión**, protegidas solo por lo impredecible del token (sección 5)

---

## 4. Generación de PDF (LibreOffice, no mammoth+HTML)

**Historia:** hasta el 2026-09-15 el pipeline era `.docx` → mammoth (a HTML) → CSS propio → Puppeteer/`html-pdf-node` (a PDF). Se abandonó porque mammoth mapea a HTML semántico simplificado *por diseño* — descarta alineación, espaciado exacto y la mayoría del formato directo (fuente, color) que no viene de un Word Style con nombre. El resultado se veía notablemente distinto al documento original (confirmado con capturas). También causaba pérdida de imágenes y fuentes embebidas por un bug aparte: el reemplazo de variables leía *todos* los archivos del `.docx` como texto, incluyendo binarios (`word/media/*.png`, `word/fonts/*.ttf`), corrompiéndolos al reescribirlos como string.

**Pipeline actual (`generatePdf` en `ventas-contratos.service.ts`):**
1. Lee el `.docx`, reemplaza variables de texto simple (`[Var]`/`<<Var>>`) directamente en el XML — pero **solo en las partes `.xml`/`.rels`**, copiando cualquier otro archivo (imágenes, fuentes) como buffer binario sin tocarlo.
2. Para un campo `TABLE`, no hace reemplazo de texto: busca el párrafo completo que contiene el placeholder y lo reemplaza por una tabla nativa de Word (`<w:tbl>` OOXML), construida por `buildTableXml()` a partir de `tableConfig.columns` y las filas guardadas. **La variable de una tabla debe estar sola en su propio párrafo** en la plantilla — si comparte párrafo con otro texto, ese texto se pierde al reemplazar todo el párrafo.
3. El `.docx` ya fusionado se convierte a PDF con **LibreOffice en modo headless** (`soffice --headless --convert-to pdf`), no con HTML intermedio — así se preserva alineación, espaciado, imágenes y fuentes tal como el documento original las tiene.
4. Variable de entorno opcional `LIBREOFFICE_PATH` (default `soffice`, asumido en el `PATH`). En Windows local hay que apuntarla al `.com` (ej. `C:\Program Files\LibreOffice\program\soffice.com`) para que bloquee correctamente hasta terminar. Instalado en `backend/Dockerfile` vía `apk add libreoffice` (Alpine).
5. Cada invocación usa un perfil de usuario descartable (`-env:UserInstallation=file:///<tmp-dir>`) para que conversiones concurrentes no choquen en el lock de perfil único de LibreOffice.

**Nota sobre fuentes:** si la plantilla usa una fuente personalizada (ej. Montserrat embebida en el `.docx`) que no está instalada como fuente del sistema en el servidor/contenedor, LibreOffice la sustituye por una similar disponible — sigue siendo mucho mejor que el Times New Roman fijo del pipeline viejo, pero para fidelidad 100% habría que instalar esa fuente específica en la imagen Docker (no se hizo, evaluar caso por caso si hace falta).

---

## 5. Campos tipo TABLA y el link público del cliente (2026-09-16)

Antes de esto, el formulario de "Nuevo Contrato" tenía 3 anexos hardcodeados en el código (Equipos/Servicios/Contactos), específicos del rubro de seguridad, sin forma de agregar otro tipo de tabla desde la UI. Se reemplazaron por un mecanismo genérico:

- En **Configuración de Plantilla**, al marcar un campo detectado como tipo "Tabla", se abre un editor para definir sus columnas (nombre + tipo: texto/número/fecha) y un máximo de filas (`SalesField.tableConfig`).
- El checkbox "Cliente" (`isClientField`, ya existía para campos simples) ahora también decide quién llena la tabla:
  - **Sin marcar** → la llena el vendedor en `ContratoForm.tsx` al crear el contrato, con un editor de filas dinámico (agregar/quitar fila, hasta `maxRows`).
  - **Marcado** → no se edita al crear el contrato. Al crear el contrato, si la plantilla tiene algún campo `TABLE` con `isClientField=true`, se genera automáticamente `clientFillToken` (24 bytes aleatorios). El vendedor copia el link (`/ventas/contratos/completar/:token`, botón en `ContratoResult.tsx`) y se lo manda al cliente.
- La página pública `CompletarContrato.tsx` (sin sesión, fuera del layout protegido en `App.tsx`) muestra solo esas tablas, el cliente las completa y envía. `POST /ventas/contratos/public/:token/submit` valida el token, solo acepta valores para las variables que de verdad son campos `TABLE` de tipo cliente en esa plantilla (no se puede inyectar cualquier clave), y marca `clientFilledAt`.
- **Por qué un link propio y no un campo nativo del proveedor de firma:** SignWell (como BoldSign antes) no tiene un tipo de campo "tabla con número de filas variable" que el firmante pueda completar dentro de su propio flujo de firma — solo campos de posición fija, y esta app tampoco captura esa posición (ver sección 8). De ahí que la recolección de datos de tabla del cliente sea un paso previo, propio de la app, antes de generar el PDF final.

---

## 6. Numeración automática y carpeta de Drive por plantilla (2026-09-16)

Pedido del usuario: el "ID de contrato" no debía ser texto libre editable, sino un código autogenerado tipo `MEGAMONT-00001`; y cada plantilla debía tener su propia carpeta de Drive donde se van guardando los documentos generados/enviados/firmados.

**Dónde se configura cada cosa (importante, no son el mismo lugar):** la numeración es **por plantilla** (cada plantilla puede tener su propio prefijo), así que vive en `TemplateConfig.tsx`, tarjeta "⚙ Numeración de contrato". La carpeta de Drive es **una sola para toda la empresa** (el sistema crea la subcarpeta por plantilla solo, el usuario no elige una carpeta distinta por cada una), así que se sacó de `TemplateConfig.tsx` (donde estaba al principio) y ahora vive en un botón "⚙" aparte en `ContratosList.tsx`, que abre `ContratosDriveConfigModal.tsx` — decisión explícita del usuario tras ver la primera versión ("no tiene sentido que esté en la plantilla si aplica a todas").

**Numeración:**
- Un campo `SalesField.fieldType = 'CONTRACT_NUMBER'` (a lo sumo uno por plantilla, es decisión del usuario cuál variable detectada marcar así) nunca se muestra editable — ni en `TemplateConfig.tsx` (se ocultan Requerido/Cliente/Opciones para esa fila) ni en `ContratoForm.tsx` (se excluye del formulario, se muestra una nota informativa).
- `createContract()` calcula el código dentro de una **transacción Prisma** (`prisma.$transaction`): lee `numberingNext` de la plantilla, arma `${prefix}-${String(next).padStart(digits,'0')}`, incrementa `numberingNext`, y guarda el resultado tanto en `SalesContract.contractNumber` como en `fieldValues[variableName]` (para que se sustituya en el documento igual que cualquier otra variable). La transacción evita que dos contratos creados casi al mismo tiempo para la misma plantilla reciban el mismo número.
- Si la plantilla no tiene un campo `CONTRACT_NUMBER`, todo funciona exactamente igual que antes (sin numeración) — es opcional.

**Carpeta de Drive por plantilla:**
- Reutiliza el mecanismo genérico que ya usa RRHH: `FolderConfig` (uno por `companyId` + `type`) con un nuevo `type = 'VENTAS_CONTRATOS'` para la carpeta **raíz, compartida por toda la empresa** — se configura una sola vez vía los endpoints ya existentes `GET/POST /personal/drive/config?type=VENTAS_CONTRATOS` (no hubo que crear endpoints nuevos para esto).
- `SalesTemplate.driveFolderId` guarda la subcarpeta de **esa** plantilla, creada perezosamente (`DriveService.createSubfolder`, nuevo método) la primera vez que hace falta subir algo — no al crear la plantilla.
- Dentro de esa subcarpeta, los archivos se guardan con nombre descriptivo (`{contractNumber o id}_generado_{fecha}.pdf`, `..._enviado_...`, `..._firmado_...`) en vez de crear sub-subcarpetas por tipo — menos llamadas a la API de Drive para el mismo objetivo.
- **Cableado de módulos:** `PersonalModule` exporta `DriveService`; `VentasModule` lo importa e inyecta en `VentasContratosService`. No hay dependencia circular.
- **La subida a Drive es opcional y best-effort**: si la empresa no configuró la carpeta raíz, o si Drive falla por cualquier motivo, `generatePdf()`/`sendContract()`/la subida de firmado siguen funcionando igual — el error solo se registra en el log (`Logger.warn`), nunca rompe la operación principal.
- **PDF firmado (manual, sin webhook):** como todavía no hay webhook de firma electrónica conectado (ver sección 8), `POST /ventas/contratos/:id/documents/signed` (multipart, botón "📤 Subir PDF firmado" en `ContratoResult.tsx`) deja que quien reciba el PDF firmado por fuera del sistema lo suba a mano — se guarda localmente, se sube a Drive si aplica, se crea un `SalesContractDocument{type:'FIRMADO'}`, y el contrato pasa a `status='SIGNED'`. Es la única forma hoy de que un contrato llegue a `SIGNED`.

---

## 7. Quién llena cada campo (`isClientField`), resumen

| Tipo de campo | `isClientField = false` (vendedor) | `isClientField = true` (cliente) |
|---|---|---|
| Simple, `isClientField=false` | Formulario "Nuevo Contrato" | — |
| `CHECKBOX`/`SIGNATURE`/`INITIAL`/`TEXT`/`EMAIL`/`NUMBER`/`DATE`, `isClientField=true` | No aplica | **Dentro del documento, al firmar** — se embebe como un SignWell text tag (`{{...}}`) en el lugar exacto del placeholder; el cliente lo completa/marca/firma en la misma sesión de firma, sin ningún link aparte (2026-09-17, ver sección 8) |
| `DROPDOWN`, `isClientField=true` | No aplica | Sin mecanismo — no tiene text tag equivalente confirmado, se deja fuera por ahora (caso raro) |
| `TABLE` | Editor de filas en "Nuevo Contrato" | Link público `/ventas/contratos/completar/:token`, antes de firmar — único caso que necesita el link, porque es lo único que SignWell no puede resolver con un tag (filas dinámicas) |
| `CONTRACT_NUMBER` | No aplica — lo asigna el sistema al crear el contrato (sección 6) | No aplica |

---

## 8. Firma electrónica: SignWell (2026-09-17, BoldSign eliminado del todo)

**BoldSign fue removido por completo** (código, modelo, env var, secreto de Cloud Build, tests) — ya no queda ninguna referencia funcional en el repo. Tenía dos bugs reales confirmados contra `developers.boldsign.com` que nunca se llegaron a corregir (`Email` en vez de `EmailAddress`, y `FormFields[]` sin `PageNumber`/`Bounds` porque `SalesField` nunca capturó posición) — esa investigación quedó como antecedente histórico en la sección "Pendiente identificado..." más abajo, pero ya no aplica al código actual.

**Estado actual (SignWell):** `sendContract()` sube el PDF ya generado a `POST https://www.signwell.com/api/v1/documents` con header `X-Api-Key` (`SIGNWELL_API_KEY`). Verificado contra la documentación oficial (`developers.signwell.com`) antes de escribir el código, no adivinado:

- `files: [{ name, file_base64 }]` — base64 crudo, **sin** el prefijo `data:application/pdf;base64,`.
- `recipients: [{ id: '1', name, email }]` — el campo es `email`, no `email_address` (a diferencia de lo que decía la primera versión de esta sección, redactada antes de confirmar el schema real).
- `test_mode`: controlado por `SIGNWELL_TEST_MODE` (default `true` si la env var no está o no es exactamente `"false"`) — un documento de prueba no cuenta contra la cuota paga ni es vinculante, así que el default seguro es no gastar cuota hasta que se verifique el flujo completo.
- `text_tags: true` — habilita el mecanismo del punto siguiente.
- `with_signature_page: true` — solo se manda cuando la plantilla **no** tiene ningún campo `SIGNATURE`/`INITIAL`/`CHECKBOX` marcado Cliente propio (ver más abajo); si ya hay uno, se respeta su posición en el documento en vez de forzar una página aparte.
- Respuesta: `id` (se guarda en `SalesContract.signwellDocumentId`), `status` (→ `signwellStatus`), y `recipients[0].signing_url` (usado por el punto "Firma en la misma sesión" más abajo).

**Campos simples "Cliente" → SignWell text tags embebidos en el documento (implementado 2026-09-17, resuelve el hueco descrito arriba en la tabla de la sección 7).** `generatePdfInternal()` reemplaza el placeholder de cualquier campo `CHECKBOX`/`SIGNATURE`/`INITIAL`/`TEXT`/`EMAIL`/`NUMBER`/`DATE` marcado `isClientField=true` por un "text tag" de SignWell (`buildSignWellTextTag()`), en vez de por un valor de `fieldValues` — el cliente lo completa/marca/firma **dentro del propio documento**, en la misma sesión de firma, sin ningún link ni correo aparte.

Sintaxis verificada contra un **ejemplo de código real** del SDK oficial (`github.com/Bidsketch/signwell-sdk-ruby`, `examples/12_text_tags.rb`), no contra prosa de documentación — un intento anterior de investigar esto sacó dos fuentes oficiales que se contradijeron sobre el delimitador (`:` vs `|`), así que esta vez se buscó un ejemplo de código funcionando en vez de confiar en un resumen de texto. Formato: `{{tipo:firmante:requerido:etiqueta:...}}`, firmante siempre `1` (hoy un contrato solo tiene un firmante cliente, `recipients[0]`). Mapeo usado:
- `CHECKBOX` → `{{check:1:{y|n}:Etiqueta}}`
- `SIGNATURE` → `{{signature:1}}`
- `INITIAL` → `{{initial:1:y}}`
- `TEXT`/`EMAIL`/`NUMBER` → `{{text:1:{y|n}:Etiqueta}}`
- `DATE` → `{{date:1:{y|n}}}`
- `DROPDOWN`: sin tag equivalente confirmado, no soportado por ahora.

`with_signature_page` en `sendToSignWellInternal()` deja de mandarse siempre — solo aplica cuando la plantilla no trae ningún tag de firma/iniciales/casilla propio, como respaldo para no dejar nunca un documento sin nada que firmar/aceptar.

**Firma en la misma sesión cuando hay una tabla para el cliente (implementado 2026-09-17).** Antes, un contrato con una tabla de cliente (ej. "Personas Autorizadas") le costaba al cliente dos visitas separadas: llenar la tabla por el link público, y más tarde abrir un correo aparte de SignWell para firmar — con el vendedor teniendo que entrar en medio a generar y enviar a mano. Investigado y confirmado: la respuesta de `POST /api/v1/documents` ya trae `recipients[0].signing_url` (un link de firma normal) **sin necesitar `embedded_signing` ni ningún plan superior de SignWell** — no hace falta iframe ni el SDK de JS, un simple redirect del navegador alcanza.

Ahora `submitPublicFill()` — que solo existe porque el contrato tiene un campo `TABLE` marcado Cliente (única razón por la que se genera el link) — en cuanto guarda lo que mandó el cliente, genera el PDF (`generatePdfInternal`) y lo manda a SignWell (`sendToSignWellInternal`) de inmediato, devolviendo `{ redirectToSign: signing_url }`. `CompletarContrato.tsx` redirige el navegador ahí mismo (`window.location.href`) en vez de mostrar la pantalla de "¡Gracias!" — el cliente pasa de llenar la tabla a firmar (y marcar su checkbox/firma si el documento los tiene, por el mecanismo de tags de arriba) en la misma visita. Si el auto-envío falla por cualquier motivo, la información del cliente igual queda guardada — el vendedor puede generar/enviar a mano desde `ContratoResult.tsx` como respaldo. Un contrato **sin** ningún campo tabla para el cliente no genera este link en absoluto — sigue exactamente el flujo manual de siempre.

**Webhook — `POST /ventas/webhook/signwell`:** a diferencia de BoldSign, SignWell permite registrar un webhook por API (`POST /api/v1/hooks` con `callback_url`, devuelve un `id`) — no se automatizó el registro en código (requiere una URL pública de callback, que no existe en local), así que es un paso manual a hacer una vez que el backend esté desplegado. Ese `id` se guarda como `SIGNWELL_WEBHOOK_ID`; `handleSignWellWebhook()` en `ventas-contratos.service.ts` verifica `event.hash` (HMAC-SHA256 de `"{event.type}@{event.time}"`, usando `SIGNWELL_WEBHOOK_ID` como llave, comparado con `timingSafeEqual`) antes de aceptar cualquier evento — sin esa env var configurada, todo webhook entrante se ignora (falla cerrado, no abierto). En `document_completed`, descarga `GET /api/v1/documents/:id/completed_pdf` (con reintentos: el PDF puede tardar unos segundos en estar listo tras el evento) y hace exactamente lo mismo que la subida manual: guarda el archivo, crea `SalesContractDocument{type:'FIRMADO'}`, sube a Drive si aplica, y marca `status='SIGNED'`. La subida manual (`POST /ventas/contratos/:id/documents/signed`) se mantiene como respaldo para cuando el webhook todavía no esté registrado.

**Env vars nuevas:** `SIGNWELL_API_KEY` (reemplaza a `BOLDSIGN_API_KEY` en `.env`/`.env.example`/`cloudbuild.yaml` — **hay que crear el secreto `SIGNWELL_API_KEY` en Secret Manager antes del próximo deploy**, el anterior `BOLDSIGN_API_KEY` ya no se referencia), `SIGNWELL_TEST_MODE`, `SIGNWELL_WEBHOOK_ID`.

**Bloqueo de cuenta encontrado 2026-09-17 (no es un bug de código):** al probar "Enviar a Firma Electrónica" con la key real, la API respondió `400` con `"You need to verify your email before you can perform this action."` — es una restricción de la propia cuenta de SignWell (el correo del dueño de esa API key no está verificado todavía), no algo que `sendContract()` esté armando mal; la petición llega bien formada. Se soluciona entrando a signwell.com con la cuenta de esa key y verificando el correo (o reenviando la verificación desde el dashboard) — no requiere ningún cambio de código. Mismo tipo de bloqueo externo que la delegación de dominio de Gmail en RRHH (ver `recursos-humanos.md`).

---

## 9. Notas de implementación vigentes

- Multi-tenant por `companyId` como el resto de la app. Super admin (`companyId: null`) **no puede crear contratos directamente** — `createContract` exige empresa.
- Sanitización de nombre de archivo (`path.basename`) en la descarga de PDF para que no se pueda pedir un archivo fuera de `uploads/contracts/`.
- El detector de variables y la sustitución comparten la misma necesidad de escapar caracteres especiales de regex en el nombre de la variable (un punto o paréntesis en el nombre rompía tanto la detección como el reemplazo antes del 2026-09-16).
- Las variables con espacio de nombres (`Contrato.Campo`) se agrupan bajo un encabezado `"Campos de (Contrato)"` tanto en `ContratoForm.tsx` (2026-09-16) como en `TemplateConfig.tsx` (mismo día, segunda ronda de ajustes — ver punto 10); las que no tienen punto van juntas bajo `"Otros"` (solo si hay alguna). Es puramente de presentación, no cambia cómo se guarda ni se sustituye nada.
- Deduplicación de variables repetidas: si `[Variable]` aparece varias veces en el documento, `detectVariables()` ya la detecta una sola vez (usa un `Set`) y la sustitución en `generatePdf()` ya la reemplaza en **todas** las apariciones (regex con flag `g`) — esto ya funcionaba antes del 2026-09-16, no es una función nueva, solo se verificó explícitamente ese día a pedido del usuario.

---

## 10. Segunda ronda de ajustes de UX (2026-09-16, feedback directo del usuario tras probar lo anterior)

Cuatro correcciones puntuales sobre lo ya construido ese mismo día, pedidas explícitamente después de usar la primera versión:

1. **Opciones de `DROPDOWN` en sub-panel, no en un input de comas.** El campo "Opciones" de la tabla de configuración (un solo `<input>` con `op1, op2, op3`) se quitó. Ahora, igual que `TABLE`, al elegir "Selección" se abre una fila debajo con un input por opción (agregar/quitar una por una) y un checkbox "Permitir selección múltiple" (`SalesField.allowMultiple`). Con selección múltiple, `ContratoForm.tsx` renderiza un grupo de checkboxes (`MultiSelect`, nuevo componente) en vez de un `<select>`, y el valor en `fieldValues` pasa a ser un arreglo — la razón por la que `fieldValues` en el estado de `ContratoForm.tsx` es `Record<string, any>` y no `Record<string, string>` desde este cambio.
2. **La misma agrupación por espacio de nombres que ya tenía `ContratoForm.tsx` se aplicó también a `TemplateConfig.tsx`.** Antes era una sola tabla plana con todos los campos; ahora es una tarjeta por grupo (`"Campos de (Contrato)"`, `"Campos de (Cliente)"`, `"Otros"`, etc.), cada una con su propia mini-tabla. Los índices reales dentro del arreglo `fields` (no el índice visual dentro del grupo) se preservan para que los handlers (`updateField`, etc.) sigan apuntando al campo correcto.
3. **Ciclo editar campos → regenerar PDF.** Antes, una vez creado el contrato no había forma de volver a tocar los valores de los campos — "Volver" solo llevaba a la lista. Ahora: `ContratoForm.tsx` se reutiliza en modo edición vía la ruta `/ventas/contratos/:contractId/editar` (detectada por la presencia del param `contractId` en vez de `templateId`); carga el contrato existente con `getContract`, precarga cliente/campos/tablas, y al guardar hace `PATCH /ventas/contratos/:id` en vez de crear uno nuevo — sin tocar `status`. El botón vive en `ContratoResult.tsx` ("✏️ Editar campos", oculto solo cuando `status='SIGNED'`, ahí sí es inmutable). Además, el botón "Generar PDF" en `ContratoResult.tsx` — que antes solo aparecía en estado `DRAFT` — ahora aparece en cualquier estado salvo `SIGNED`, y se relabelea a "🔄 Regenerar PDF" una vez que ya existe un PDF (el backend ya soportaba regenerar en cualquier momento; la restricción era solo de la UI). Cada regeneración sigue agregando una fila nueva al historial de `SalesContractDocument` (punto 3 del plan original), así que el ciclo completo (editar → regenerar → editar → regenerar...) queda con su propio historial.
4. **"Datos del Cliente" → "Datos para el envío".** La sección fija de `ContratoForm.tsx` tenía 6 campos (Nombre, Email, Teléfono, Empresa, RUC/Cédula, Dirección) enmarcados como si fueran una ficha del cliente. Se redujo a Nombre y Email — lo único que `sendContract` realmente usa para mandar a firmar — y se renombró para dejar claro que no es un CRM de datos del cliente. Si una plantilla necesita más datos del cliente, se configuran como campos normales de la plantilla (con namespace `Cliente.*` si se quiere que se agrupen), no en este formulario fijo. Las columnas `clientPhone/clientCompany/clientRuc/clientAddress` de `SalesContract` no se borraron del esquema, solo dejaron de escribirse desde el UI.

---

## 11. Tercera ronda de ajustes (2026-09-16, mismo día, feedback tras probar la segunda ronda)

1. **Etiqueta por defecto sin el espacio de nombres.** `handleDetect()` en `TemplateConfig.tsx` generaba la etiqueta por defecto con `v.replace(/([A-Z])/g, ' $1')` sobre el nombre completo de la variable — con el nuevo estilo de nombres (`Contrato.ID de Contrato`, ya con espacios y tildes reales, no camelCase) ese regex además rompía siglas como "ID" (las separaba en "I D"). Se reemplazó por: cortar todo lo que esté antes del primer punto (ya se ve en el encabezado del grupo) y usar el resto tal cual, sin ningún regex de "insertar espacio antes de mayúscula".
2. **"Otro" (texto libre) en `DROPDOWN`.** Nuevo `SalesField.allowOther: Boolean`, checkbox junto a "Permitir selección múltiple" en el sub-panel de `TemplateConfig.tsx`. En `ContratoForm.tsx`: `Select` (single) agrega una opción "Otro (especifique)" que cambia a un `<input>` de texto libre; `MultiSelect` agrega una fila "Otro:" con su propio input — a lo sumo un valor del arreglo es "personalizado" (el que no está en `dropdownOptions`), es lo que identifica cuál mostrar/editar.
3. **Texto de ayuda y chips corregidos.** "Variables detectadas" decía `(formato <<VariableName>>)` y los chips/la columna "Variable" se mostraban como `<<var>>` — pero el formato que de verdad usan las plantillas reales es `[Variable]` (el otro, `<<Variable>>`, también funciona pero casi nadie lo usa). Se corrigió el texto y el formato de los chips/columna a `[Variable]`.
4. **Texto insertado en negrita (`generatePdf`).** Pedido: que cualquier valor insertado en el documento (no las tablas) se vea en negrita para distinguirlo del texto fijo de la plantilla. Esto **no se pudo hacer con una sola sustitución de texto plano** como antes — hubo que reescribir cómo se inserta cada valor. Ver el apartado siguiente, "Motor de sustitución con negrita", por los dos bugs serios que aparecieron construyendo esto (uno de rendimiento, uno de que directamente no sustituía nada) — vale la pena leerlo antes de tocar esta parte del código.
5. **Selección múltiple como lista, no como texto separado por comas.** Un `DROPDOWN` con `allowMultiple` ahora se inserta como una lista con viñetas (`• Opción1`, salto de línea `<w:br/>`, `• Opción2`, ...) dentro del mismo run, no como `"Opción1, Opción2"` en una sola línea.
6. **`ContratoResult.tsx` ahora muestra qué se le pedirá al cliente y cómo.** La tabla "Campos que el cliente debe llenar" (ya existía, listaba `isClientField`) se renombró a "Información que se le pedirá al cliente", se subió arriba de "Envío de correo" (antes de todo, es lo primero que hay que saber sobre el contrato), y se le agregó una columna "Cómo" que distingue entre un campo `TABLE` (se llena **por el link público, antes de firmar**) y cualquier otro tipo (etiquetado "al firmar (SignWell)") — antes ambos se mostraban igual. **Corrección 2026-09-17:** esa segunda etiqueta describe la intención, no lo que pasa hoy — ver sección 8, los campos simples marcados `isClientField` todavía no se le entregan al firmante de ninguna forma funcional.

### Motor de sustitución con negrita (`substituteInsertedValue`/`spliceBoldValue`) — dos bugs serios encontrados y corregidos

La primera versión de "poner en negrita lo insertado" se implementó con una sola expresión regular por variable: `` <w:r\b[^>]*>(<w:rPr>...)?<w:t...>...</w:t></w:r> `` vía `content.replace(regex, fn)`, igual que el reemplazo de texto plano de siempre pero capturando el `<w:rPr>` para poder envolver el valor en un run nuevo con `<w:b/>`. **Los dos bugs que aparecieron probándolo contra el contrato real de MEGAMONT (231KB, ~550 runs) fueron serios, no cosméticos:**

- **Bug 1 — no sustituía nada.** El regex asumía `<w:r>` sin atributos. Los documentos reales (sobre todo exportados de Google Docs) siempre traen atributos en cada run (`<w:r w:rsidDel="00000000" w:rsidR="00000000" ...>`), así que el regex nunca hacía match — el resultado era que el PDF generado mostraba los placeholders `[Variable]` sin reemplazar, y donde SÍ se veían en negrita era porque la plantilla original ya los tenía en negrita de por sí (una convención del autor de la plantilla para marcar los espacios a llenar), no porque el código estuviera funcionando.
- **Bug 2 — cuando se corrigió el bug 1, cada campo sucesivo tardaba más que el anterior** (390ms → 530ms → 1.1s → 4.7s → nunca terminaba) hasta colgar por completo la generación de PDF (el proceso de Node quedaba con un solo hilo bloqueado, sin invocar siquiera a LibreOffice — confirmado con `tasklist` sin `soffice.bin` corriendo). La causa: aplicar una expresión regular con `[\s\S]*?` sobre el **archivo completo**, una vez por cada uno de los ~20 campos, sobre un string que además iba creciendo con cada sustitución anterior, degeneraba en un costo mucho mayor que lineal.

**La solución final no usa regex para esta parte** — `spliceBoldValue()` busca el placeholder con `indexOf()` y camina hacia atrás/adelante con `lastIndexOf`/`indexOf` para encontrar el `<w:t>...</w:t>` y el `<w:r>...</w:r>` que lo contienen, con avance de posición garantizado en cada vuelta (nada de backtracking). Ojo con un tercer problema que salió de este mismo cambio: `lastIndexOf('<w:r', pos)` encuentra por accidente el propio `<w:rPr>` (que empieza con los mismos 4 caracteres) o `<w:t` encuentra `<w:tbl`/`<w:tr`/`<w:tc`/`<w:tab` — por eso existe el helper `findLastOpenTag()`, que solo acepta una coincidencia si el siguiente carácter es espacio, `>` o `/` (un límite real de etiqueta, no el inicio de un nombre de etiqueta más largo). Si la estructura alrededor del placeholder no es un run "limpio" (un solo `<w:t>` con a lo sumo un `<w:rPr>` antes), se hace una sustitución simple sin negrita en vez de dejar el placeholder sin reemplazar — para no perder nunca un valor por un caso raro de formato.

### Antecedente histórico (ya no aplica): `sendContract()` contra BoldSign devolvía 400

**Resuelto 2026-09-17 reemplazando el proveedor entero (sección 8), no parchando esto.** Se deja este análisis como registro de por qué BoldSign se abandonó, no como algo pendiente de corregir.

Investigado en su momento contra la documentación real de BoldSign (developers.boldsign.com) — el código de entonces tenía **dos problemas reales, no supuestos**:

1. `Signers[0].Email` debería ser `Signers[0].EmailAddress` — ese es el nombre real del campo en la API de BoldSign; `Email` no es un campo que BoldSign reconozca.
2. Cada `FormFields[]` que se manda **requiere** `PageNumber` y `Bounds` (`{X, Y, Width, Height}`) — coordenadas de dónde va el campo en el PDF. El código de entonces solo mandaba `Id`, `FieldType`, `IsRequired` — nunca posición. Esto no era un error de tipeo: **esta app nunca capturó esa información** — el editor visual de clic-para-posicionar (que hubiera generado esas coordenadas) es exactamente el diseño que se abandonó (ver el aviso al principio de este documento), y `SalesField` no tiene `pageNumber`/`positionX`/`positionY`/`width`/`height` a propósito.

De las tres opciones que se habían planteado en su momento — (a) capturar posición de alguna forma nueva, (b) mandar el documento sin `FormFields` en absoluto, o (c) migrar a SignWell — se eligió una variante de (b)+(c) combinadas: migrar a SignWell (sección 8) y, en vez de intentar reproducir campos posicionados con otro proveedor, usar `with_signature_page` para resolver la firma sin coordenadas. La opción (a) — capturar posición — sigue sin implementarse, y la brecha para campos simples `isClientField` (no `TABLE`, no `SIGNATURE`) sigue abierta; ver el cierre de la sección 8 para el estado real.
