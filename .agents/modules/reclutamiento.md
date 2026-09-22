# Modulo Reclutamiento

## Estado actual
Activo en desarrollo. Sprint 1 (estabilizacion Personal), Sprint 2 (verificacion asistida), Sprint 2b (PoC navegador real — veredicto negativo confirmado), Sprint 3 (aprobacion/rechazo documental), Sprint 4 (fix sync BD↔Drive de vacantes + reasignacion de archivos adicionales), Sprint 5 (requisitos obligatorios/opcionales, expediente del postulante, rediseño del modal de vacante) , Sprint 6 (contratar un postulante → Guardia sin entidad), Sprint 7 (destino de contratación según la vacante: Guardias o Personal Administrativo) , Sprint 8 (análisis con IA del "archivo único"), Sprint 8.1 (fix de bug de arranque, generalizado a cualquier PDF vía "Archivos Adicionales", prompt movido a un `Agent` editable en `/admin/agents`), Sprint 8.2 (persistencia de la propuesta + botón reintentar, fix de thinking-tokens, etiquetado manual cuando la IA falla, miniaturas de mayor calidad, caché de sincronización con "Última sincronización", limpieza de menciones a Kanban) y Sprint 8.3 (fix de bloqueo de recontratación tras una salida, reemplazo de `window.confirm`/`alert` por un modal propio, scroll automático a errores en modales) completados, todos verificados con Vertex AI real y navegador real. El modulo de Reclutamiento trabaja con candidatos sincronizados desde Google Drive (solo lectura, salvo la acción de contratar) — no hay ningún tablero Kanban en Reclutamiento; esa idea se descartó explícitamente por el usuario (2026-09-16), ver nota en "Arquitectura del módulo" más abajo.

## Sprint 9 — Estándar de nombres y limpieza del formulario de vacante (2026-09-22)

Pedidos directos del usuario sobre la pantalla de Reclutamiento, todos de comprensión/consistencia más que de funcionalidad nueva:

### 1. Un solo esquema de nombre: `Apellidos` + `Nombres`
"Datos que debe llenar" ofrecía **dos** esquemas de nombre (el campo único "Nombre completo" o el par "Nombres" + "Apellidos"), con una regla de bloqueo cruzado entre ambos que era imposible de explicar en la UI. Se eliminó el esquema "Nombre completo": queda `Apellidos` + `Nombres`, en ese orden (el mismo en que se arma la carpeta). Son los **dos únicos campos bloqueados**, porque sin ellos no hay con qué nombrar la carpeta del postulante. `isLockedCampo` pasó de una función con lógica cruzada sobre toda la lista a una comparación de dos claves.

Los fallbacks del backend que leen `nombre completo`/`nombreCompleto` de un `candidato.json` viejo **se conservaron** — son para postulaciones ya guardadas con un único campo.

### 2. La cédula dejó de ser un campo bloqueado
Pedido literal: *"la cédula sigue siendo un campo como cualquier otro, como por ejemplo teléfono o email, ya no es un campo no editable"*. Se puede quitar o volver opcional como cualquier otro. Sigue siendo la llave que une postulación ↔ ficha ↔ cumplimiento ↔ nómina, pero ahora vive dentro de `candidato.json`, no en el nombre de la carpeta, así que quitarla de una vacante ya no rompe el nombrado (ver `recursos-humanos.md` punto 13).

### 3. "Teléfono" → "Celular"
El campo por defecto se llama ahora **Celular**. El *tipo* de dato sigue llamándose "Teléfono" (es un tipo, no un campo).

### 4. Nota de formatos en "Documentos que debe subir"
No estaba claro qué pasaba si no se marcaba ninguna extensión. Se agregó una nota bajo el título ("si no marcas ninguno, ese documento acepta archivos de cualquier tipo") y la etiqueta de los chips cambia a "Formatos que acepta (ninguno marcado = cualquiera):" mientras no haya ninguno marcado. Es solo texto — el comportamiento ya era ese.

### 5. Eliminar una vacante desde la pantalla
`DELETE /personal/reclutamiento/puestos/:id` existía desde antes pero **ninguna pantalla lo llamaba**: las vacantes solo se podían crear, editar y abrir/cerrar, nunca borrar, así que las de prueba se quedaban ahí para siempre. Ahora hay un botón de papelera junto al de editar, con `ConfirmDialog` que indica cuántos postulantes sincronizados hay dentro de esa vacante antes de confirmar. El backend ya enviaba la carpeta de Drive a la **papelera** (reversible) en vez de borrarla, justamente porque puede contener carpetas de candidatos reales — eso no cambió.

### 6. Botón "Completar fichas" eliminado
Ver `recursos-humanos.md` punto 11. Se había relabeleado dos veces porque RRHH no entendía qué hacía; a la tercera el usuario pidió borrarlo. Se fueron el botón, su `ConfirmDialog`, el wrapper del frontend, el endpoint `POST /personal/drive/backfill-postulacion` y `DriveService.backfillPostulacion()`. El traspaso automático al contratar no se tocó.

---

## Sprint 8.3 — Fix de recontratación bloqueada, modal de confirmación propio, scroll a errores (2026-09-17)

Probando el Flujo 1 de la checklist end-to-end de `recursos-humanos.md` (contratar → ... → salida), el usuario reportó cuatro problemas reales al intentar contratar un postulante de prueba ("Juan Rodríguez").

### 1. Bloqueo permanente al recontratar a alguien que ya había salido

**Causa raíz:** `DriveService.contratarCandidato()` rechazaba con "Ya existe un guardia con la cédula X" apenas encontraba **cualquier** fila `EmployeeDriveFolder` con esa cédula, sin mirar si ese guardia seguía activo. `EmployeeDriveFolder` ancla su identidad por `@@unique([companyId, cedula])` y **nunca se borra** al registrar una salida (solo se actualiza sola en el próximo "Sincronizar Drive") — así que una cédula que alguna vez pasó por Guardias queda bloqueada para siempre, incluso si esa persona ya salió hace tiempo y vuelve a postular de cero. Confirmado con datos reales: el candidato de prueba tenía, en efecto, una `MovimientoPersonal` de tipo `SALIDA`/`estado='COMPLETADO'` de una prueba anterior, y por eso "no aparecía en Listado de Guardias" (se oculta por defecto, ver punto 7 de `recursos-humanos.md`) pero sí bloqueaba el alta nueva.

**Fix:** antes de bloquear, se consulta `MovimientoPersonalService.isActivo(companyId, cedula)` (el mismo criterio que ya usa la Ficha Personal para "Activo: Sí/No", no uno nuevo). Si el guardia **no** está activo, se permite continuar — `crearEntrada()` abre un caso `ENTRADA` nuevo (es idempotente por `tipo`, así que no reabre el `SALIDA` viejo). Si sigue activo, se mantiene el bloqueo, pero el mensaje ya no sugiere "Fusionar cédulas duplicadas" como remedio: ese flujo es para dos cédulas *distintas* que resultan ser la misma persona (un typo al parsear una carpeta de Drive), no para una colisión de la *misma* cédula — no tenía nada que fusionar en este caso, y encima esa pantalla solo es visible para `role==='ADMIN'` (no para `canWrite('RRHH')`, que es el nivel real que tienen los usuarios de RRHH — ver nota en `recursos-humanos.md` punto 7), así que apuntar ahí como solución era doblemente confuso.

Test nuevo en `drive.service.spec.ts` cubre este caso (`isActivo` mockeado en `false` → la contratación pasa igual, se llama `crearEntrada`).

### 2. `window.confirm`/`window.alert` nativos — pedido explícito y repetido de eliminarlos

El usuario reiteró (ya lo había pedido antes) que no deben usarse diálogos nativos del navegador en ninguna parte de la app. Se creó `frontend/src/components/common/ConfirmDialog.tsx` (modal propio, mismo patrón visual `modal-overlay`/`modal`/`modal-header`/`modal-body`/`modal-actions` que ya usa el resto del módulo) y se reemplazó en los dos sitios de este flujo: `ReclutamientoPage.tsx` (`handleContratar`, antes `window.confirm`) y `GuardiasList.tsx` (`handleRegistrarSalida`, antes `window.confirm` + `alert` para el error). **Quedan sin migrar** otros usos de `window.confirm`/`alert` en el resto de la app (`AnalisisArchivoUnicoModal.tsx`, `ComplaintFieldsConfigModal.tsx`, `TrainingsPage.tsx`, `SurveyManagementPage.tsx`, `AdministrativeStaff.tsx`, `ContractsList.tsx`, y 3 archivos de Ventas) — no se tocaron en esta sesión por estar fuera del flujo reportado, quedan como deuda para una migración más amplia.

### 3. El error de "ya existe un guardia" no se veía — quedaba fuera de vista por el scroll

El botón "Marcar como Contratado" vive en el footer fijo del modal, mientras el banner de error se pinta arriba del todo del `modal-body` (que es scrolleable); si RRHH ya había bajado el scroll para revisar el checklist de documentos, el error quedaba fuera de la vista visible y parecía que "no pasó nada". Fix: `useEffect` + `ref` + `scrollIntoView({ behavior: 'smooth', block: 'center' })` cada vez que aparece un error nuevo, tanto en `ReclutamientoPage.tsx` (`contratarError`) como en `GuardiasList.tsx` (`salidaError`, que además ni tenía banner propio antes — usaba `alert()`).

### 4. Kanban de Candidatos eliminado por completo (mismo día, pedido aparte)

El usuario también pidió, en el mismo intercambio, borrar de raíz el código del Kanban de Candidatos (`/rrhh/kanban`, ver punto 5 de Sprint 8.2 más abajo — ahí solo se había limpiado la documentación, no el código). Se hizo: modelos de Prisma, servicios, DTOs, endpoints y páginas de frontend, más 5 dependencias vivas que se encontraron de paso (`custodias.service.ts`, `personal.service.ts`, `contract.service.ts`, `drive.service.ts` ×2) — detalle completo en `.agents/modules/recursos-humanos.md` punto 2 y `.agents/modules/movimientos-personal.md`. Esto es un tema de RRHH en general, no específico de Reclutamiento (que nunca dependió de él), pero se documenta acá también porque el punto 5 de Sprint 8.2 quedaba directamente superado por esto.

Además, la migración del `window.confirm`/`alert` se extendió ese mismo día a **toda la aplicación** (no solo RRHH) a pedido explícito del usuario — 33 archivos, 34 confirms + 45 alerts + 2 prompts reemplazados por `ConfirmDialog`/`PromptDialog` (`frontend/src/components/common/`). Se dejaron fuera a propósito los archivos del subsistema de contratos de Ventas (`ContratosList.tsx`, `ContratoResult.tsx`) porque otro agente los estaba editando en paralelo en el mismo repo.

### Verificación

Backend: 172/172 tests en verde en todo el módulo `personal` (incluye `custodias.service.spec.ts`/`contract.service.spec.ts`/`drive.service.spec.ts` reescritos tras quitar `Candidate`). `tsc` limpio en backend y frontend, incluida la migración de `window.confirm`/`alert`/`prompt` de toda la app.

Navegador real (Playwright, contra Drive/Postgres reales, escuchando el evento `dialog` de Playwright para confirmar que ningún diálogo nativo se dispara): recontratar al guardia de prueba que ya había salido funcionó sin bloqueo, ambos modales de confirmación (contratar y registrar salida) son propios y con el texto correcto, y el guardia recontratado aparece de inmediato en Listado de Guardias como activo (ya no bajo "Mostrar guardias fuera"). Se aplicó `prisma db push` a la base local con el schema sin Kanban (con confirmación explícita del usuario, ver política de acciones destructivas).

## Sprint 8 — Análisis con IA del "archivo único" (2026-09-16)

**El problema:** el portal de postulación deja que el candidato entregue su documentación de dos formas (`modoSubida` en `candidato.json`). Con `'archivo_unico'` llega **un solo PDF con todo adentro**, y como todo el resto del módulo matchea **por nombre de archivo** (`findMatchingFile`), ese postulante aparecía con casi todo el checklist en "faltante" aunque hubiera entregado todo.

### Decisión de arquitectura: partir el PDF, no anotar rangos

Se evaluaron dos caminos y **el usuario eligió partir el PDF** (2026-09-15): al confirmar, se crea un archivo por documento dentro de la misma carpeta, conservando el original. La alternativa (guardar "la cédula está en las páginas 3-4" y enseñar al resto del sistema a entender rangos) se descartó porque habría obligado a tocar `syncReclutamientoCandidates`, `completitudPercent`, Cumplimiento por Entidad y el flujo de contratar. Partiendo, **un candidato `archivo_unico` se convierte en uno `individual`** y nada aguas abajo se entera de que este modo existe.

### Proveedor: Vertex AI + Gemini multimodal (no GitHub Models, no Document AI)

- **Por qué no `gpt-4o-mini` vía GitHub Models** (lo que ya usa `DocumentExtractionService` para fechas): es solo texto. El usuario confirmó que los PDFs son **casi siempre fotos/escaneos** de cédulas y papeletas, donde `pdf-parse` no devuelve nada — exactamente el caso que ese servicio declara fuera de alcance.
- **Por qué no Document AI Custom Splitter/Classifier:** $5 por 1.000 páginas **más $36/mes fijos** por procesador desplegado, y exige entrenarlo con muestras etiquetadas. Para el volumen de GEMESEG es caro y lento sin dar mejor resultado que un modelo multimodal.
- **Autenticación — el punto no obvio:** Vertex AI **NO acepta API keys**, exige OAuth2. Y esta organización de GCP tiene bloqueada por política `iam.serviceAccountKeys.create`, así que **no se puede crear una credencial nueva**. Se reutiliza la misma service account que ya usa Drive (`drive-sync@agentes-504115`, archivo en local / `GOOGLE_SERVICE_ACCOUNT_JSON` en Cloud Run) con el scope `cloud-platform`. Falta, del lado de GCP: habilitar `aiplatform.googleapis.com` y otorgar `roles/aiplatform.user` a esa cuenta.
- Variables: `GOOGLE_VERTEX_PROJECT` (si está vacía, la función queda **deshabilitada** y Reclutamiento sigue funcionando a mano — mismo criterio que `CacheService` con `REDIS_HOST` vacío), `GOOGLE_VERTEX_LOCATION` (ya existía en `backend/.env` pero **ningún código la leía**), `GOOGLE_VERTEX_MODEL`.

### Verificación contra Vertex real (2026-09-16) y el modelo que se puede usar

Se probó de extremo a extremo contra `agentes-504115`/`us-central1` con la service account de Drive. Resultados:

- **Auth y API: OK.** La API ya estaba habilitada y la cuenta tenía permiso (el primer intento devolvió 404 del modelo, no 403 — eso confirmó que la parte de IAM no era el problema).
- **La serie Gemini 3.x NO está disponible en este proyecto:** `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3-flash`, `gemini-3-pro` y `gemini-3.1-flash-lite` devuelven todos `404 NOT_FOUND` ("your project does not have access to it"). Solo responden **`gemini-2.5-flash` y `gemini-2.5-pro`**. Por eso el default quedó en `gemini-2.5-flash` y no en el 3.8 que se había puesto inicialmente.
- **El mecanismo completo funciona:** con un PDF de 4 páginas embebido en `inlineData` (una por documento, más una en blanco) y `responseMimeType: 'application/json'`, el modelo devolvió el JSON esperado ubicando los 3 documentos en sus páginas correctas, con confianza alta, y dejando la página en blanco sin asignar. Consumo: ~1.750 tokens totales para ese PDF de prueba.

⚠️ **Deuda con fecha: Google retira los modelos Gemini 2.5 el 16 de octubre de 2026.** Cuando llegue, esta función deja de responder. Hay que conseguir acceso a la serie 3.x en el proyecto (o mover el proyecto a uno que lo tenga) y apuntar `GOOGLE_VERTEX_MODEL` al modelo nuevo. Se dejó configurable por entorno precisamente para que ese cambio no exija un despliegue de código.

### `ReclutamientoIaService`

Dos reglas heredadas de `DocumentExtractionService`, deliberadas:
1. **`analizar` NUNCA escribe.** Solo propone. Todo lo que toca Drive pasa por `aplicar`, que corre únicamente con lo que RRHH confirmó o corrigió.
2. Cuando algo falla, falla **visible y con mensaje accionable** en vez de adivinar (`NO_CONFIGURADO`, `SIN_PDF`, `VARIOS_PDF`, `SIN_REQUISITOS`, `PDF_ILEGIBLE`, `PDF_MUY_GRANDE`, `ERROR_DRIVE`, `ERROR_IA`, `RESPUESTA_INVALIDA`). El postulante siempre se puede trabajar a mano.

Parseo defensivo de la respuesta del modelo: se **descartan** los requisitos que el modelo se inventó (los que no están en la vacante — generarían una fila que RRHH no puede confirmar) y los rangos de página fuera del PDF. Un rango a medias se trata como "no encontrado" en vez de completar el extremo que falta. Los requisitos que el modelo omitió se agregan como "no encontrado" para que RRHH vea el checklist entero, no solo lo hallado. El detalle crudo del error de Vertex queda en el log; hacia la UI solo viaja el código de estado (no filtrar rutas internas del proyecto de GCP).

`aplicar` **valida todo antes de escribir el primer archivo**, para que una asignación inválida no deje la carpeta a medio partir. Los archivos generados se nombran `"<Requisito> - <original>.pdf"`, **el mismo formato que `reassignReclutamientoFile`**, que es lo que hace que `findMatchingFile` los reconozca sin ningún modelo de asociación nuevo.

**`aplicar` recibe una LISTA de páginas por documento, no un rango** (`AsignacionConfirmada { requisito, paginas: number[] }`). Es consecuencia directa de la interfaz de miniaturas: al etiquetar página por página, un documento puede quedar formado por páginas **no consecutivas** — el caso real es el anverso de la cédula en una página y el reverso en otra, con algo distinto en medio. Con rangos habría que emitir dos archivos con el mismo nombre; con una lista sale un único archivo con exactamente esas páginas, ordenadas según el original. Un requisito repetido en dos entradas se rechaza por el mismo motivo. La IA sigue razonando en rangos (es lo natural para el modelo) y el frontend los despliega a etiquetas por página al recibir la propuesta.

### La traza va en `analisis-ia.json`, NUNCA en `candidato.json`

Motivo concreto (ver "Contexto crítico" más abajo): `uploadCandidateJson` del portal reconstruye `candidato.json` desde cero con seis claves fijas, así que si el postulante **vuelve a postular** para agregar un documento, cualquier clave añadida desde MejoraGemeseg se borra en silencio — y RRHH tendría que revisar el PDF entero otra vez. Un archivo aparte es invisible para el portal.

### Frontend

- `pages/personal/reclutamiento/AnalisisArchivoUnicoModal.tsx`: **cuadrícula de miniaturas, una por página** (renderizadas con `pdfjs-dist`, que ya estaba en `package.json` pero **sin usar en ningún archivo**). Bajo cada miniatura, un desplegable con el documento que la IA cree que es, ya preseleccionado, más el badge verde/ámbar/rojo de confianza que `ComplianceChecklist` usa en Cumplimiento (no se introdujo otro lenguaje visual). Clic en una miniatura la amplía a pantalla completa — una foto de cédula en miniatura no siempre se puede juzgar.
  **Elección del usuario (2026-09-16)** entre cuatro diseños propuestos (miniaturas etiquetadas, vista dividida PDF+checklist, asistente paso a paso, arrastrar y soltar). El criterio decisivo: siendo los PDFs fotos escaneadas, RRHH valida mirando **la imagen de la página**, no traduciendo mentalmente un número de página. Una primera versión con la vista dividida llegó a construirse y fue reemplazada.
  Las miniaturas se renderizan **una sola vez** y se guardan como JPEG en memoria, para que cambiar una etiqueta no vuelva a dibujar el PDF completo.
- **Importado con `React.lazy`**, no de forma normal: `pdfjs-dist` pesa ~370 kB y con un import directo `ReclutamientoPage` pasaba de 43 kB a 413 kB **para todos los postulantes**, incluidos los que no usan esta función. Con lazy, Reclutamiento vuelve a 44 kB y pdfjs queda en su propio bloque bajo demanda.
- Aviso morado + botón ✨ "Analizar con IA" en el modal del candidato, visible solo si `modoSubida === 'archivo_unico'` y con `canWrite('RRHH')`.
- `syncReclutamientoCandidates` ahora expone `modoSubida` por candidato ('individual' por defecto, que es lo que corresponde a las carpetas anteriores al portal actual).

### Endpoint de PDF: por qué existe un proxy

`GET /personal/reclutamiento/candidatos/:folderId/pdf/:driveFileId` sirve el PDF al navegador porque los archivos de Drive viven detrás de la service account — el front no los puede pedir directo. **Valida que el archivo esté realmente dentro de la carpeta indicada** antes de servirlo, para que no se convierta en un lector universal de cualquier id de Drive que alguien adivine.

### Tests

`reclutamiento-ia.service.spec.ts` (21 casos). `pdf-lib` se usa **de verdad** (no se mockea): las pruebas de `aplicar` generan un PDF real de 6 páginas y verifican que el recorte tenga el número de páginas correcto, no solo que se llamara a la API. Cubre: no configurado (sin gastar llamada), rangos propuestos, requisitos omitidos marcados como no encontrados, páginas sin clasificar, descarte de requisitos inventados y páginas fuera de rango, error de Vertex sin filtrar el detalle crudo, vacante sin requisitos, carpeta con varios PDFs, nombres de archivo generados, recorte real, conservación del original, traza en `analisis-ia.json`, un rango inválido que **no sube ningún archivo**, páginas no consecutivas agrupadas en un solo documento, requisito repetido rechazado, y el bloque de "criterio de análisis" (ver Sprint 8.1 abajo): autocreación del Agent, uso del criterio guardado, criterio inactivo cae al default, fallo leyendo el Agent no rompe el análisis, y el contrato JSON + lista de requisitos **siempre** se agregan sin importar qué diga el Agent.

## Sprint 8.1 — Bug de arranque + generalización + prompt como Agent (2026-09-16, mismo día, sesión de seguimiento)

Tres pedidos del usuario tras probar Sprint 8 en local: (1) el botón "Analizar con IA" fallaba con `Unexpected token 'n', "null" is not valid JSON`; (2) el análisis no debía limitarse al caso `modoSubida='archivo_unico'` — también hace falta para un postulante que marcó "individual" pero en realidad subió todo en un archivo, o que combinó varios documentos en un PDF dentro de "archivos adicionales"; (3) el prompt debía vivir "en Agentes", para que sea editable y reutilizable.

### El bug: axios manda `null`, Express lo rechaza con 400 — invisible por curl sin body

`analizarArchivoUnico` llamaba `api.post(url, null, {...})`. Axios, en el navegador, serializa `data: null` como el texto literal `"null"` con `Content-Type: application/json`. El `body-parser` de Express que usa Nest corre en modo **estricto** por defecto: solo acepta objeto o array como JSON de nivel superior — un `null` desnudo lo rechaza **antes de que la petición llegue al controller**, con el mismo formato de mensaje que un `JSON.parse` nativo fallido. `JSON.parse('null')` en sí es válido (por eso `curl` sin `-d` nunca reprodujo el bug: sin body no hay nada que parsear). Reproducido primero con Playwright contra la app real, luego confirmado con `curl -d 'null' -H "Content-Type: application/json"` contra el mismo endpoint. **Fix:** mandar `{}` en vez de `null` desde `personal.service.ts` — el endpoint no tiene `@Body()` (recibe todo por `:folderId`/`?driveFileId`), así que el contenido del body es irrelevante para la lógica, solo tenía que ser JSON válido de nivel superior.

**Nota para la próxima vez que algo "no aparezca" en local:** durante esta misma sesión, tanto el backend (`nest --watch`) como el frontend (Vite) quedaron sirviendo código de horas antes sin ningún error visible — el watcher de archivos no detecta cambios de forma confiable en este repo (vive bajo OneDrive). Antes de asumir un bug de lógica, comparar `Get-Item <archivo> | select LastWriteTime` contra `Get-Process -Id <pid> | select StartTime` del proceso escuchando el puerto, y reiniciar si el archivo es más nuevo.

### Generalización: analizar cualquier PDF, no solo el "archivo único" declarado

El backend (`ReclutamientoIaService.analizar`/`resolverContexto`) **ya aceptaba** un `driveFileId` opcional desde que se escribió — nunca estuvo atado a `modoSubida`. Lo que faltaba era el punto de entrada en la UI. Se agregó un botón "Analizar con IA" **por archivo**, dentro de la sección "Archivos Adicionales" del expediente del candidato (visible para cualquier PDF que no haya matcheado ningún requisito, sin importar `modoSubida`), que llama `analizarArchivoUnico(folderId, file.id)`. El aviso morado (banner "Entregó todo en un solo archivo") sigue existiendo para el caso más común y obvio — detecta el único PDF de la carpeta sin que RRHH tenga que indicarlo — pero ya no es la única puerta: el botón por archivo cubre exactamente los dos casos que planteó el usuario (alguien marcó "individual" pero subió todo en un archivo → ese archivo termina en "adicionales"; o combinó varios documentos en un PDF fuera de su casilla → mismo lugar). `AnalisisArchivoUnicoModal` ahora recibe un `driveFileId?: string` opcional: sin él, autodetecta (comportamiento de antes); con él, analiza ese archivo puntual.

### El prompt como `Agent`, no como constante

`Agent.name = 'Revisor de Documentos (IA)'`, `createdBy: null` (agente de sistema, mismo patrón que "Agente GEMESEG" en `ai.service.ts`), `scope: 'RECLUTAMIENTO'`. **Autocreación en el primer uso** (`getDocumentReviewerInstructions`): si no existe, se crea con un criterio por defecto; no depende de un paso de seed manual. Se relee de la BD en **cada** análisis, sin caché — un ajuste que haga un ADMIN desde `/admin/agents` se nota de inmediato, sin redeploy. Si el Agent está `isActive: false`, se ignora su texto y se usa el criterio por defecto (no un prompt vacío).

**División deliberada entre lo editable y lo fijo:** el Agent solo controla el CRITERIO (tono, reglas de qué es "alta/media/baja" confianza, qué anotar) — es la parte de "prompt" que de verdad vale la pena editar sin tocar código. La lista de documentos requeridos de la vacante, el total de páginas del PDF, y el contrato de salida en JSON (`{"documentos": [...]}`) los agrega el código **siempre**, en cada llamada, sin importar qué tanto edite alguien el criterio. Motivo: si esa parte fuera editable y alguien borra el contrato JSON por accidente, el parseo de la respuesta se rompe — con esta división, lo peor que puede pasar es una respuesta de peor calidad, nunca una que no se pueda interpretar. El texto por defecto mide ~1.280 caracteres, bien por debajo del límite de 2.000 que impone `UpdateAgentDto.systemMsg` (el formulario de `/admin/agents`), dejando margen para que un ADMIN lo extienda.

**Solo visible/editable por rol ADMIN** — `/admin/agents` (`AgentsController`) exige `@Roles(UserRole.ADMIN)`, no `RRHH`. Verificado: con un usuario `EMPLOYEE` la pantalla devuelve 403 en las llamadas de listado (se ve vacía, sin aviso de error); con el usuario `admin@gemeseg.com` semillado, el agente aparece correctamente en la tabla.

### Verificación real (no solo tests unitarios)

Todo lo de arriba se probó con Playwright contra la app corriendo de verdad (backend + frontend + Postgres local + Drive real + Vertex AI real), con un candidato real (postulante con `modoSubida='archivo_unico'`, PDF de 8 páginas con documentos reales escaneados): login → sincronizar → abrir candidato → botón del aviso morado (8 miniaturas renderizadas, 2 documentos ubicados correctamente, confianza alta) → cerrar → botón por-archivo en "Archivos Adicionales" sobre el mismo PDF (mismo resultado, con `?driveFileId=` en la URL confirmando que apuntó al archivo correcto) → `/admin/agents` con usuario ADMIN mostrando el agente recién autocreado. Cero errores de consola del navegador en todas las corridas.

### Pendiente

- **Falta probar `aplicar-analisis` (el "Confirmar y separar") contra Drive real** end-to-end — lo verificado en navegador llegó hasta ver las miniaturas correctamente etiquetadas, sin llegar a confirmar y partir el PDF de verdad (para no dejar archivos de prueba en una carpeta real de Reclutamiento sin que el usuario lo pidiera).
- **Antes del 16/10/2026**: conseguir acceso a Gemini 3.x y mover `GOOGLE_VERTEX_MODEL` (ver Sprint 8 arriba).
- No hay OCR de respaldo: si el modelo no reconoce un documento, RRHH lo ubica a mano con los campos de página. Es suficiente porque la corrección manual siempre está disponible.
- El botón por-archivo en "Archivos Adicionales" solo se ofrece para archivos `.pdf` — un archivo adicional que sea imagen suelta (`.jpg`/`.png`) no tiene análisis con IA (no aplica: no hay nada que "partir" en una sola imagen).

## Sprint 8.2 — Persistencia de la propuesta, causa raíz de "respuesta no interpretable", calidad de miniaturas, caché de sincronización (2026-09-16, mismo día, segunda sesión de seguimiento)

Cinco pedidos del usuario tras probar Sprint 8.1 en vivo:

### 1. La propuesta de análisis se perdía al cerrar el modal, y no había forma de reintentar

**Antes:** el resultado de `analizar()` solo vivía en el estado de React del modal — cerrarlo para revisar otra cosa y volver obligaba a repetir la llamada a Vertex AI (tiempo + costo) y perdía cualquier corrección que RRHH ya hubiera hecho.

**Ahora:** `ReclutamientoIaService.analizar()` guarda la propuesta en `analisis-ia-pendiente.json` (archivo nuevo, aparte de `analisis-ia.json` que ya existía como traza de lo *confirmado*) apenas termina con éxito. Nuevo endpoint `GET .../candidatos/:folderId/analisis-pendiente` la devuelve **sin llamar a Vertex AI**. El modal, al abrir, intenta primero esa lectura rápida; solo si no hay nada guardado dispara el análisis real. `aplicar()` borra ese archivo al confirmar — ya no tiene sentido ofrecerlo como "guardado" para un archivo que ya se separó. Verificado en vivo: cerrar el modal y reabrirlo muestra la misma propuesta al instante, con "Propuesta guardada el `<fecha>`" y **cero** llamadas nuevas a `/analizar`.

Se agregó también un botón "Reintentar" (si falló) / "Analizar de nuevo" (si tuvo éxito) en el encabezado del modal, que siempre fuerza una llamada fresca a la IA — con confirmación previa si ya hay páginas etiquetadas, para no perder trabajo manual sin avisar.

### 2. Causa probable de "La IA no devolvió una respuesta interpretable"

**Diagnóstico** (probado contra el PDF real que falló, 2026-09-16): `gemini-2.5-flash` razona internamente ("thinking") antes de responder, y esos tokens de pensamiento **salen del mismo cupo** que `maxOutputTokens`. Sobre el mismo archivo y el mismo prompt, tres llamadas seguidas gastaron entre 834 y 1.287 tokens solo en pensar, de forma no determinista — con el prompt real (más largo que el de la prueba, por el criterio del Agent) y `maxOutputTokens: 2048`, es plausible que ese consumo deje sin espacio la respuesta final, explicando por qué la primera vez funcionó y la segunda no.

**Fix:** `thinkingConfig: { thinkingBudget: 0 }` (desactiva el razonamiento — esta tarea es clasificación, no necesita cadena de pensamiento) + `maxOutputTokens` subido a 4096 (margen para vacantes con más requisitos). Además, el código ahora distingue por `finishReason`: si el modelo se queda literalmente sin espacio (`MAX_TOKENS` + texto vacío), el motivo es `SIN_ESPACIO_RESPUESTA` con un mensaje que invita a reintentar — no el genérico "respuesta no interpretable", que se reserva para cuando la IA sí respondió pero con algo que no es JSON válido.

No se pudo reproducir el fallo original de forma determinista para confirmar al 100 % que esta era la única causa, pero es una configuración estrictamente más segura (sin esa clase de fallo posible) sin downside observado, y las ~6 llamadas reales hechas después del fix (en esta sesión y en pruebas de navegador) tardaron 1-12 s y respondieron bien todas las veces.

### 3. La IA ahora puede fallar sin dejar a RRHH sin herramienta

Si `analizar()` falla en un punto donde ya se sabe qué archivo es y cuántas páginas tiene (`ERROR_IA`, `RESPUESTA_INVALIDA`, `SIN_ESPACIO_RESPUESTA`), el resultado igual incluye `archivo`, `totalPaginas` y `requisitos` — el frontend arma la misma cuadrícula de miniaturas, pero con todas las páginas en "(ninguno)", para que RRHH etiquete a mano en vez de chocar con un callejón sin salida. Si ni siquiera eso se pudo determinar (`PDF_ILEGIBLE`, `PDF_MUY_GRANDE`, `SIN_REQUISITOS`), no hay nada que mostrar y el mensaje de error sigue siendo el único resultado — no tendría sentido ofrecer una cuadrícula sin poder abrir el archivo.

### 4. Calidad de las miniaturas

Se subió la resolución de render de 220px a 1000px de ancho (JPEG calidad 0.9, antes 0.7). El costo es una sola vez por página (se cachean como imagen, no se re-renderizan al cambiar una etiqueta), y el beneficio se nota sobre todo al ampliar una miniatura — antes se veía pixelada al estirarla a pantalla completa, porque el zoom usa la MISMA imagen renderizada, no vuelve a dibujar a mayor resolución.

### 5. Ningún rastro de "Kanban" en Reclutamiento

El usuario confirmó, de forma tajante, que el Kanban de Candidatos (`Candidate`/`KanbanColumn`/`RecruitmentKanban.tsx`, ruta `/rrhh/kanban`) **no es parte de Reclutamiento** — ni conceptualmente ni en la práctica (no está enlazado desde el Sidebar, RRHH nunca lo usa). Se limpiaron todas las menciones de este módulo en la documentación de Reclutamiento (este archivo y `AGENTS.md`): la sección "Sistema B", las tablas de endpoints/modelos/rutas de Kanban, el flujo end-to-end que terminaba en "agregar al Kanban", los puntos de "Decisiones pendientes" que lo mencionaban. En este momento (2026-09-16) no se borró el código, solo la documentación — pero el usuario pidió esa eliminación completa poco después y ya se ejecutó el 2026-09-17: ver Sprint 8.3 más abajo y `.agents/modules/recursos-humanos.md` punto 2 para el detalle.

### 6. Caché de sincronización + "Última sincronización"

La lista de candidatos (viene de Drive, no de la BD) vivía solo en memoria de React — recargar la página o volver a entrar la vaciaba y obligaba a sincronizar de nuevo para ver lo mismo que ya se había traído. Ahora se guarda en `localStorage` (clave por `companyId`, vía `getUser()` de `auth.service.ts`) junto con la fecha/hora de la sincronización, y se muestra "Última sincronización: `<fecha y hora>`" junto al botón. `hasSynced` arranca en `true` si ya hay caché, así que la pantalla muestra la última lista conocida de inmediato en vez del placeholder de "aún no sincronizado". De paso, un fallo de sincronización (p. ej. un hipo de Drive) ya no borra la lista actual — antes `catch` hacía `setCandidatos([])`, perdiendo de golpe lo último bueno por un error pasajero.

### Verificación

Backend: 29 tests en `reclutamiento-ia.service.spec.ts` (antes 21) — cubren la persistencia/lectura de la propuesta pendiente, el borrado al aplicar, `thinkingConfig` en la petición real, la distinción `SIN_ESPACIO_RESPUESTA` vs `RESPUESTA_INVALIDA`, y que `requisitos`/`archivo`/`totalPaginas` viajen incluso cuando la IA falla. 122 tests en total en el módulo `personal`, todos en verde. `tsc` limpio en backend y frontend.

Navegador real (Playwright, contra Vertex AI y Drive reales): confirmado que el aviso morado ya no tiene el párrafo redundante y el botón lleva tooltip; que cerrar el modal y reabrirlo reutiliza la propuesta guardada sin llamar de nuevo a la IA; que el botón "Analizar de nuevo"/"Reintentar" aparece; que las miniaturas se ven claramente más nítidas (texto de certificados legible a simple vista); y que "Última sincronización" se muestra y sobrevive a session nuevas del navegador. Cero errores de consola en todas las corridas.

## Sprint 7 — Destino de contratación según la vacante (Guardias | Personal Administrativo)

**Contexto (2026-09-15):** hasta Sprint 6, contratar siempre creaba un **guardia** — `contratarCandidato` tenía fija la carpeta `FolderConfig type='CUMPLIMIENTO'` y el bucket "Sin Asignar". No había forma de contratar a un administrativo desde Reclutamiento.

- **`JobPosition.tipoContratacion`** (`'GUARDIA' | 'ADMINISTRATIVO'`, default `'GUARDIA'`): lo declara la vacante y lo heredan todos sus postulantes. El default preserva el comportamiento previo, así que ninguna vacante existente cambia de conducta. Migración aditiva `20260915_add_tipo_contratacion_job_position`. Se normaliza con `normalizeTipoContratacion` (cualquier valor no reconocido cae en `GUARDIA`), se espeja al JSON del puesto en Drive, y —igual que `camposRequeridos`/`archivosRequeridos`— `syncJobPositionsFromDrive` solo lo lee del JSON al **crear** una vacante detectada en Drive; para una que ya existe, Postgres manda.
- **La trampa que motivó el sprint:** los dos buckets destino **nombraban sus carpetas distinto**. Guardias usaba `Apellidos - Nombres` y Personal Administrativo `Nombre - Puesto`, sin cédula, así que un postulante con cédula en el nombre movido tal cual al bucket administrativo hacía que `syncPersonalAdminFolder` leyera `1712345678` **como si fuera el puesto**. Por eso contratar **renombra** la carpeta, y el renombrado va en la **misma llamada** `files.update` que el movimiento — así la carpeta nunca llega a existir bajo esa raíz con el nombre equivocado, ni siquiera durante una ventana breve.
  ⚠️ **Actualizado 2026-09-22:** los dos buckets ahora nombran **igual**, `Apellidos Nombres` (sin guion, sin cédula, sin puesto — ver `recursos-humanos.md` punto 13). El renombrado al contratar sigue existiendo y sigue yendo en la misma llamada, pero ya no es para evitar esa confusión sino para normalizar al formato único. Los parsers (`parseEmployeeFolderName`, `parsePersonalAdminFolderName`) conservan los formatos viejos.
- **La cédula no se pierde:** `contratarCandidato` la escribe explícitamente en `candidato.json` (junto a `estado`/`fechaContratacion`/`tipoContratacion`), que viaja con la carpeta.
- **Control de duplicados, distinto por bucket:** Guardias sigue comparando por cédula contra `EmployeeDriveFolder`. Administrativos **no pueden** — ese bucket no guarda cédula — así que se compara por `employeeName` normalizado (sin tildes ni mayúsculas) entre las filas `folderType='PERSONAL_ADMIN'`. Es más débil que la cédula, pero es lo único que ese modelo permite hoy.
- **Falta la carpeta destino → se bloquea antes de tocar nada**, con el mensaje que indica en qué pantalla configurarla (Guardias ya lo tenía; administrativos reutiliza el de `getPersonalAdminFolderId`). La carpeta del postulante se queda intacta en Reclutamiento en vez de quedar a medio camino.
- **Resolución de la vacante:** por la carpeta **padre** del postulante (`JobPosition.driveFolderId`), que es el vínculo más fiable; si falla (carpeta movida a mano en Drive), cae al `puestoId` que el portal deja en `candidato.json`; sin vacante identificable asume `GUARDIA`.
- **El controlador sincroniza el destino correcto:** `POST .../contratar` ahora corre `syncPersonalAdminFolder` o `syncEntidadesFolder` según `tipoContratacion`, no siempre el de Guardias.
- **Frontend:** selector "Al contratar, esta persona entra como" en el modal de vacante (con texto que explica a dónde irá la carpeta y que se renombrará), distintivo "Administrativo" en la tarjeta de la vacante, y el modal de confirmación de contratar (`ConfirmDialog` desde Sprint 8.3, antes `window.confirm`) nombra el destino real e incluye el nombre nuevo de la carpeta antes de confirmar.
- **`syncReclutamientoCandidates`** expone `tipoContratacion` por candidato (heredado de su vacante) para que el modal pueda anticipar el destino.
- **Tests:** `drive.service.spec.ts` → `describe('cuando la vacante es ADMINISTRATIVO', ...)` (mueve+renombra en una sola llamada, no usa "Sin Asignar", deja la cédula en `candidato.json`, bloquea sin carpeta configurada, bloquea por nombre duplicado, no aplica el chequeo de cédula de Guardias) y un caso nuevo en el camino guardia que verifica que **no** se renombre.
- **Pendiente de probar contra Drive real** antes de considerarse verificado end-to-end (mueve y renombra carpetas reales).

### Contexto crítico: el portal de postulación vive en OTRO repositorio

`modoSubida: 'individual' | 'archivo_unico'` (cómo el postulante entrega su documentación) **no se decide aquí**: lo elige el candidato en el portal público, que es un proyecto separado en `C:\Users\leidy\Documents\RECLUTAMIENTO` (módulo `recruitment`). Los dos sistemas se comunican **solo a través de Google Drive** — el portal escribe la carpeta del candidato y su `candidato.json`, MejoraGemeseg lo lee con `syncReclutamientoCandidates`. No hay API entre ellos.

Dos cosas a tener presentes al tocar `candidato.json` desde este lado:
1. `uploadCandidateJson` del portal **reconstruye el archivo desde cero** con seis claves fijas (`datosFormulario`, `puesto`, `puestoId`, `fechaPostulacion`, `archivos`, `modoSubida`). Cualquier clave agregada por MejoraGemeseg se borra si el candidato **vuelve a postular** a la misma vacante.
2. Eso **no** afecta a `estado`/`fechaContratacion`: al contratar, la carpeta se mueve fuera de Reclutamiento y el portal (que busca solo dentro de la carpeta de la vacante) ya no la encuentra — crea una carpeta nueva en vez de pisar la del contratado. Sí afectaría a datos escritos **mientras el candidato sigue en Reclutamiento**, por lo que el análisis con IA debe guardarse en un archivo aparte (`analisis-ia.json`), no dentro de `candidato.json`.

## Sprint 6 — Contratar un postulante (Candidatos Postulados → Guardia "Sin Asignar")

**Contexto (aclarado por el usuario 2026-09-10, reforzado 2026-09-16):** RRHH contrata enteramente desde "Candidatos Postulados" en `ReclutamientoPage.tsx` (los candidatos sincronizados desde Drive): se marca al postulante como contratado y su carpeta pasa a ser, directamente, una carpeta de Guardias (o de Personal Administrativo, ver Sprint 7) — sin entidad todavía, porque eso se decide después. No hay ningún tablero intermedio en este flujo.

- **Botón "Marcar como Contratado"** en el modal de detalle del candidato (`ReclutamientoPage.tsx`, footer del modal, junto a "Ver Carpeta en Drive"), visible solo con `canWrite('RRHH')`. Confirmación previa vía `ConfirmDialog` (mismo patrón que el botón de salida en `GuardiasList.tsx`; antes `window.confirm`, ver Sprint 8.3) porque mueve una carpeta real de Drive. Si la cédula ya existe pero ese guardia ya había salido, la contratación se permite igual (recontratación, ver Sprint 8.3) — solo se bloquea si sigue activo.
- **`DriveService.contratarCandidato(companyId, folderId)`** (`drive.service.ts`, cerca de `saveCandidatoDatos`):
  1. Lee la carpeta del candidato: acepta el formato estándar "Apellidos Nombres" (cédula en `candidato.json`) y los viejos "Apellidos - Nombres" y "… - Cédula" de 10 dígitos (`parseEmployeeFolderName`). Si no hay cédula en ninguno de los dos sitios, rechaza con un mensaje claro en vez de mover una carpeta con identidad ambigua.
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

El modulo de Reclutamiento es parte del modulo `Personal`. Los candidatos vienen **exclusivamente** de Google Drive (solo lectura, salvo la acción de contratar):

- **Backend:** `DriveService.syncReclutamientoCandidates()`, `DriveService.contratarCandidato()` (Sprint 6)
- **Frontend:** `ReclutamientoPage.tsx`
- **Fuente de datos:** Carpetas en Google Drive dentro de `Reclutamiento/<Nombre>-<Cedula>/`
- **Almacenamiento:** No crea registros en BD — los datos se leen de Drive al momento del sync
- **Proposito:** Monitorear postulantes externos que suben documentos a Drive, y **contratarlos** (Sprint 6) — la única vía de contratación real que usa RRHH.
- **Funcionalidades:** Tracking de completitud, checklist de documentos, links a carpetas de Drive, "Marcar como Contratado" (mueve la carpeta a Guardias/Sin Asignar o a Personal Administrativo, según la vacante — ver Sprint 7), análisis con IA del "archivo único" (ver Sprint 8).

> ⚠️ **El Kanban de Candidatos (`Candidate`/`KanbanColumn`/`RecruitmentKanban.tsx`, ruta `/rrhh/kanban`) nunca fue parte de Reclutamiento** y se eliminó por completo el 2026-09-17 (ver Sprint 8.3 más abajo) — no reintroducirlo en esta documentación ni confundirlo con este flujo si en algún momento se reconstruye algo similar desde cero.

## Flujo end-to-end

```
1. Admin crea un Puesto/Vacante en ReclutamientoPage
   -> POST /personal/reclutamiento/puestos
   -> DriveService.createJobPosition()
     -> Crea JobPosition en PostgreSQL
     -> Crea archivo JSON en Google Drive/Reclutamiento/

2. Postulantes suben documentos a Google Drive/Reclutamiento/<Nombre>-<Cedula>/
   (o un solo archivo con todo junto, ver Sprint 8)

3. RRHH hace click en "Sincronizar" en ReclutamientoPage
   -> POST /personal/reclutamiento/sync
   -> DriveService.syncReclutamientoCandidates()
     -> Lee cada carpeta de candidato desde Drive
     -> Lee candidato.json (si existe) para datos extra
     -> Compara el puesto contra los JobPosition definidos
     -> Calcula porcentaje de completitud
     -> Retorna lista de candidatos al frontend

4. RRHH marca al postulante como "Contratado"
   -> POST /personal/reclutamiento/candidatos/:folderId/contratar
   -> DriveService.contratarCandidato() (ver Sprint 6-7)
```

## Archivos clave

### Backend

| Archivo | Descripcion |
|---------|-------------|
| `backend/src/modules/personal/drive.controller.ts` | Endpoints REST de Drive + Reclutamiento |
| `backend/src/modules/personal/services/drive.service.ts` | Integracion Drive + logica de Reclutamiento |
| `backend/src/modules/personal/services/reclutamiento-ia.service.ts` | Análisis con IA del "archivo único" (Sprint 8) |
| `backend/src/modules/personal/personal.service.ts` | KPIs del dashboard |
| `backend/src/modules/personal/personal.module.ts` | wiring del modulo |
| `backend/src/modules/personal/dto/job-position.dto.ts` | DTOs de puestos |
| `backend/src/modules/personal/dto/drive.dto.ts` | DTO de configuracion Drive |
| `backend/src/modules/personal/dto/document-type.dto.ts` | DTOs de tipos de documento |
| `backend/prisma/schema.prisma` | Modelo `JobPosition` |
| `backend/prisma/migrations/20260904_add_job_positions/migration.sql` | Migracion JobPosition |

### Frontend

| Archivo | Descripcion |
|---------|-------------|
| `frontend/src/pages/personal/ReclutamientoPage.tsx` | Pagina principal de Reclutamiento |
| `frontend/src/pages/personal/reclutamiento/AnalisisArchivoUnicoModal.tsx` | Revisión con IA del "archivo único" (Sprint 8) |
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
| `POST` | `/personal/reclutamiento/candidatos/:folderId/contratar` | JWT+RRHH(write) | Contratar: mueve la carpeta a Guardias/Sin Asignar (o Personal Administrativo), marca `candidato.json` y sincroniza (Sprint 6-7) |
| `POST` | `/personal/reclutamiento/candidatos/:folderId/analizar` | JWT+RRHH(write) | IA propone qué documento está en qué páginas (Sprint 8) |
| `GET` | `/personal/reclutamiento/candidatos/:folderId/analisis-pendiente` | JWT+RRHH(view) | Última propuesta guardada, sin llamar a la IA (Sprint 8.1) |
| `POST` | `/personal/reclutamiento/candidatos/:folderId/aplicar-analisis` | JWT+RRHH(write) | RRHH confirma: separa el PDF en archivos (Sprint 8) |
| `GET` | `/personal/reclutamiento/candidatos/:folderId/pdf/:driveFileId` | JWT+RRHH(view) | Proxy del PDF para el visor (Sprint 8) |

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
**Actualizado 2026-09-09** (antes decía `String[]` para ambos campos y no tenía `driveFolderId`/`estado` — quedó desactualizado tras la migración `20260908_campos_requeridos_json`; ver [recursos-humanos.md](recursos-humanos.md) punto 1 para el contexto de ese cambio). Ver Sprint 7 más arriba para el campo `tipoContratacion` agregado después.

### ⚠️ VerificationCheck — eliminado (2026-09-09)
Este modelo ya **no existe**. Fue reemplazado por `SistemaVerificacion`/`MovimientoPersonal`/`MovimientoPersonalItem` (migración `20260909_replace_verificacion_with_movimientos`, que migró cualquier fila existente a un caso histórico `ENTRADA` antes de eliminar la tabla). Ver [movimientos-personal.md](movimientos-personal.md) para el modelo actual.

## Algoritmo de syncReclutamientoCandidates

1. Obtiene la carpeta raíz **fija en código** (`HARDCODED_DRIVE_FOLDERS.RECLUTAMIENTO`, mismo ID que el portal de postulación). Ya no se lee ni se guarda `FolderConfig` para este tipo.
2. Lista las subcarpetas de puesto dentro de esa raíz (una por vacante; el JSON del puesto vive ahí)
3. Carga todos los `JobPosition` de la empresa para conocer archivos requeridos
4. Lista las carpetas de candidatos dentro de cada puesto
5. Para cada carpeta de candidato:
   a. Parsea el nombre (`Apellidos Nombres`; cédula desde JSON si no está en el nombre)
   b. Lee `candidato.json` (si existe) para datos adicionales
   c. Compara el `puestoAplicado` contra los `JobPosition` definidos
   d. Calcula `completitudPercent` = (archivos requeridos encontrados / total archivos requeridos) * 100
   e. Recopila todos los archivos subidos
6. Retorna `{ puestosCount, candidatosCount, candidatos[] }`

**Nota:** Esta operacion es **solo lectura** — no crea registros en la base de datos.

## Reglas de negocio

### Permisos
- **Cualquier usuario autenticado (EMPLOYEE, RRHH):** Puede ver candidatos, crear puestos
- **Solo ADMIN:** Puede guardar configuracion Drive, eliminar carpetas de empleados, eliminar tipos de documento

### Validaciones
- Nombre + folder unico por empresa en tipos de documento (`@@unique([companyId, folder, name])`)

### Integridad de datos
- Todos los modelos tienen `companyId` con `onDelete: Cascade`
- Eliminar una empresa elimina todos sus puestos, etc.

## Dependencias externas

- **Google Drive API:** Requiere service account (`google-service-account.json`) con permisos de lectura/escritura
- **Carpeta compartida:** La carpeta raiz de Drive debe estar compartida con `drive-sync@agentes-504115.iam.gserviceaccount.com`
- **Prisma:** ORM para todas las operaciones de base de datos
- **googleapis:** Libreria oficial de Google para Node.js

## Decisiones pendientes / Deuda tecnica

1. **Sin notificaciones:** No hay sistema de notificaciones cuando un candidato sube documentos o cuando se completa un checklist.
2. **Sin exportacion:** No hay exportacion de candidatos a CSV/PDF.
3. **drive.module.ts duplicado:** Existe un `drive.module.ts` que duplica el registro de `DriveController` y `DriveService`. El modulo autoritativo es `personal.module.ts`.

## Rutas frontend
**Actualizado 2026-09-09** — el prefijo pasó de `/personal` a `/rrhh` (ver [recursos-humanos.md](recursos-humanos.md) punto 1); esta sección quedó con las rutas viejas y ya no eran correctas. Lista completa y verificada contra `App.tsx` en recursos-humanos.md — solo las de Reclutamiento aquí:
```
/rrhh                    -> PersonalDashboard
/rrhh/reclutamiento      -> ReclutamientoPage
```

## Navegación Sidebar
**Actualizado 2026-09-09** — ver [recursos-humanos.md](recursos-humanos.md) para el árbol completo verificado contra `Sidebar.tsx`. Resumen: ya no hay ítems separados de "Custodios" ni "Verificación SUT/SICOSEP" (reemplazado por "Movimientos de Personal", ver [movimientos-personal.md](movimientos-personal.md)); "Tipos de Documento" y "Configuración Drive" ya no aparecen en el Sidebar (quedaron huérfanas o pasaron a modales inline dentro de cada pantalla — ver recursos-humanos.md sección 7); "Certificaciones" se eliminó por completo el 2026-09-22 (ver recursos-humanos.md punto 4).
