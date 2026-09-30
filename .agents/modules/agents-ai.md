# Modulo: Agents (IA)

## Descripcion
Agentes de IA con instrucciones personalizadas y conversaciones. El motor conversacional (chat "Agente Gemeseg") vive en `backend/src/modules/ai/`; el catálogo de agentes (crear/editar/asignar) vive en `backend/src/modules/agents/`.

## Endpoints Admin
- `GET /admin/agents` - Listar usuarios con agentes asignados
- `GET /admin/agents/catalog` - Catalogo de agentes
- `GET /admin/agents/assignments` - Todas las asignaciones
- `POST /admin/agents` - Crear agente (se auto-asigna al creador)
- `PATCH /admin/agents/:id` - Actualizar agente
- `DELETE /admin/agents/:id` - Eliminar agente
- `POST /admin/agents/:id/assign/:userId` - Asignar agente
- `DELETE /admin/agents/:id/assign/:userId` - Quitar agente

## Endpoints Usuario
- `GET /agents/available` - Agentes disponibles (global + asignados)
- `POST /chat/message` - Enviar mensaje al asistente IA
- `GET /chat/conversations` - Listar conversaciones
- `GET /chat/conversations/:id/messages` - Mensajes de una conversacion

## Endpoints Base de Conocimiento (`/company-knowledge-base`, ver punto 1 abajo)
- `GET /company-knowledge-base` - Leer el documento institucional de la empresa (ADMIN)
- `PUT /company-knowledge-base` - Guardar el documento (ADMIN); responde `{ content, warnings }` con encabezados `##` no reconocidos

## Reglas
- Solo ADMIN puede gestionar agentes
- Cada agente tiene: nombre, instrucciones (system prompt), alcance (GLOBAL/PROJECTS/TASKS/ADMIN)
- El agente global por defecto se identifica por `Agent.isDefault = true` (no por nombre exacto, ver punto 1) — createdBy: null, disponible para todos
- Un agente puede estar asignado a multiples usuarios; un usuario puede tener multiples agentes asignados
- Cada combinacion usuario+agente tiene sus propias conversaciones
- Rate limit: 50 mensajes/dia por usuario
- Motor: Google Vertex AI (Gemini), no streaming — un request/response por turno (ver punto 1)

## 1. Migración a Google Vertex AI + permisos por sección en las respuestas + Base de Conocimiento institucional (2026-09-29)

### Por qué se cambió de proveedor
El chat (`ai.service.ts`) usaba GitHub Models (`gpt-4o-mini`, endpoint `https://models.inference.ai.azure.com/chat/completions`). GitHub Models está en proceso de retiro (ver hallazgo en `.agents/modules/recursos-humanos.md` punto "Fase B" de Reclutamiento — `410 github_models_retirement_brownout` y el endpoint viejo ya ni resuelve por DNS). El proyecto ya paga por Google Vertex AI para RRHH (`reclutamiento-ia.service.ts`, revisión de documentos), así que en vez de buscar un tercer proveedor o parchar GitHub Models, el chat se movió al mismo Vertex AI — un solo proveedor de IA en todo el repo. **`GitHub Models`/`GITHUB_TOKEN`/`gpt-4o-mini` ya no existen en `ai.service.ts` ni en ningún archivo de `backend/src/modules/ai/`.**

⚠️ `backend/src/modules/personal/services/document-extraction.service.ts` (extracción de fecha de vencimiento por IA en RRHH, "Leer con IA") **sigue usando GitHub Models/`gpt-4o-mini` sin cambios** — quedó fuera del alcance de esta tarea. Con el retiro de GitHub Models ya confirmado, esa función seguramente está devolviendo `RESPUESTA_INVALIDA` o un error de red en producción. Migrarla a Vertex (mismo patrón que este documento) queda pendiente — no asumir que ya se resolvió solo porque el chat se migró.

### Arquitectura nueva
- **`vertex-chat.client.ts`** (nuevo): motor conversacional, `POST :generateContent` contra `https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent`. No streaming — una sola llamada por turno (out of scope por ahora, ver "Pendiente" abajo).
- **`backend/src/common/services/google-auth.service.ts`** (nuevo, compartido): extrae la carga de credenciales de service account + obtención de token OAuth2 que antes vivía duplicada dentro de `reclutamiento-ia.service.ts`. Ambos consumidores de Vertex (RRHH y el chat) dependen ahora de este único servicio — evita que la lógica de "dónde buscar el JSON de credenciales" (archivo local → `GOOGLE_SERVICE_ACCOUNT_JSON`) diverja entre los dos.
- **Variables de entorno**: `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` (compartidas con RRHH) + **`GOOGLE_VERTEX_CHAT_MODEL`**, nueva y deliberadamente separada de `GOOGLE_VERTEX_MODEL` (que sigue siendo solo de `reclutamiento-ia.service.ts`) — son tareas distintas (conversación de texto vs. clasificación de documentos escaneados) con necesidades de modelo/tuning independientes; compartir la variable haría que ajustar una rompiera la otra en silencio. Default si no está seteada: `gemini-2.5-flash` (mismo modelo y misma fecha límite de retiro — 16/10/2026 — que RRHH, ver `reclutamiento.md`). Sin `GOOGLE_VERTEX_PROJECT`, el chat cae al modo mock (comportamiento sin cambios respecto a antes).
- **`getDefaultAgentId()`** (`ai.service.ts`) y `AgentsService` buscan el agente global por `createdBy: null, isDefault: true` en vez de por `name: 'Agente GEMESEG'` — el nombre visible cambió a **"Agente Gemeseg"** en todo el frontend (fallback de `ChatDrawer.tsx`, `seed.js`). Nuevo campo `Agent.isDefault` (Boolean, default false); la unicidad de "solo un default a la vez" se controla en el servicio, no en la BD (mismo criterio que `CompanySection.fixedForAll`). Un entorno ya sembrado se migra corriendo una vez `node prisma/rename-default-agent.js` (renombra + marca `isDefault: true` el agente global existente en vez de crear uno nuevo, para no perder las conversaciones/`UserAgent` que ya apuntan a su id — seguro de correr más de una vez, no hace nada si ya está renombrado). `seed.js` para una base nueva ya crea el agente con el nombre y `isDefault: true` desde el inicio.
- **El selector multi-agente de `ChatDrawer.tsx` (cambiar a otro agente configurado por un admin) se mantuvo sin cambios** — la migración es solo del motor y del agente por defecto, no del mecanismo de múltiples agentes.

### Nunca responder sobre un módulo al que el usuario no tiene acceso — reforzado en código, no en el prompt
Se agregaron 4 intenciones nuevas de datos en vivo en `ai.processor.ts` (mismo mecanismo `[INTENCION: nombre]` que las 5 originales de Proyectos/Tareas/Usuario, que siguen sin dueño de sección — `PROJECTS` es `alwaysEnabled` para cualquier usuario de todos modos, así que no es un hueco nuevo):

| Intención | Sección dueña (`INTENT_SECTION`) | Qué devuelve |
|---|---|---|
| `cacao_resumen` | `CACAO` | Recepciones de los últimos 30 días, lotes abiertos/cerrados |
| `custodias_resumen` | `CUSTODIAS` | Custodias agrupadas por estado |
| `rrhh_resumen_personal` | `RRHH` | Personal con ficha registrada, vacantes abiertas |
| `ventas_resumen` | `VENTAS` | Leads por estado con valor estimado |

`AiService.canUseIntent(userId, companyId, section)` replica **exactamente** los mismos 4 pasos que `SectionPermissionGuard` aplica a un endpoint REST normal (super admin → pasa; sección no habilitada para la empresa → 403; sección fija para todos → pasa; existe fila `UserPermission` → manda su `canView`; sin fila → permitido, mismo default permisivo del resto del sistema — ver `AGENTS.md` "Permisos por seccion"). Se llama **antes** de que `AiProcessor.executeQuery` se ejecute: si la respuesta es `false`, la consulta a Prisma nunca corre y el usuario recibe "No tienes acceso a esa información con tu usuario actual." sin una segunda llamada a Vertex. Esto es deliberado — la exigencia no es "pedirle" al modelo que no revele datos de un módulo ajeno (un prompt se puede saltar), es no ejecutar la consulta.

**Verificado con llamadas reales a Vertex (no mockeado):** un ADMIN preguntando por un módulo que su empresa no tiene habilitado recibió el rechazo correcto; un EMPLOYEE recién creado (con las filas `UserPermission` denegadas por defecto del punto de Permisos en `.agents/modules/users.md`) preguntando por Custodias fue rechazado, mientras un ADMIN de la misma empresa sí recibió datos reales.

### Base de Conocimiento institucional (`CompanyKnowledgeBase`) — nueva, completamente construida
Un documento Markdown por empresa (`CompanyKnowledgeBase.content`, único por `companyId`) que Agente Gemeseg usa como contexto adicional al responder, editable solo por el ADMIN de esa empresa desde **Sistemas → "Base de conocimiento de Agente Gemeseg"** (`frontend/src/pages/sistemas/KnowledgeBasePage.tsx`, ruta `/sistemas/base-conocimiento`, gateada igual que `/sistemas/agentes`: `SectionRoute section="SISTEMAS"` en frontend + rol ADMIN en el controller).

- **Formato**: encabezados de nivel 2 exactos en mayúsculas, uno por sección de `ALL_SECTIONS` (`## RRHH`, `## VENTAS`, etc.) más un encabezado especial `## GENERAL`. El texto antes del primer encabezado reconocido, y todo lo que esté bajo `## GENERAL`, se entrega **siempre** a cualquier usuario sin importar sus permisos.
- **Un encabezado mal escrito o inventado (typo, mayúscula distinta, clave que no existe en `ALL_SECTIONS`) NO abre una sección nueva**: la línea se trata como texto normal y se pega a la sección que estaba abierta antes (o a `GENERAL` si es la primera línea del documento). Decisión deliberada (`backend/src/modules/ai/knowledge-base.util.ts`, `parseKnowledgeBase`): la alternativa — tratar cualquier encabezado desconocido como "general" — dejaría visible para todo el mundo un bloque que el admin quiso restringir y escribió mal. El endpoint `PUT` devuelve `warnings: string[]` con los encabezados no reconocidos para que el admin los corrija, sin bloquear el guardado.
- **Filtrado por permisos** (`AiService.getFilteredKnowledgeBase`): antes de cada llamada a Vertex se calcula qué claves de sección puede ver ese usuario (mismo cálculo de sección habilitada + fija + `UserPermission.canView` que `canUseIntent`) y se recorta el documento a esas secciones + `GENERAL` antes de insertarlo en el `systemPrompt`. El contenido nunca filtrado no sale de la base de datos hacia el modelo para ese usuario.
- **Verificado con Vertex real**: un documento con `## CACAO`/`## RRHH`/`## GENERAL`/un encabezado mal escrito `## FOOBAR` a propósito — la respuesta de chat de un empleado restringido incluyó solo `GENERAL`, omitió `RRHH` (sección que no tenía habilitada), y el texto de `FOOBAR` no se filtró como visible para todos (quedó pegado a la sección anterior, tal como documenta `knowledge-base.util.ts`).

### Pendiente / fuera de alcance de esta migración
- **Streaming de respuestas**: no implementado, `vertexChat.sendChat` es un solo request/response por turno. Mejora futura si la latencia de Vertex lo justifica.
- **`document-extraction.service.ts` (RRHH, "Leer con IA") sigue en GitHub Models** — ver aviso arriba, es la pieza que de verdad hay que migrar pronto dado el retiro ya confirmado del proveedor.

## Modelos de Prisma relevantes
- `Agent` (`isDefault: Boolean @default(false)`, nuevo) — catálogo de agentes, ver arriba.
- `Conversation`, `ChatMessage`, `AiLog` — sin cambios de esquema en esta migración.
- `CompanyKnowledgeBase` (`companyId` único, `content`, `updatedAt`, `updatedByUserId`) — nuevo, ver arriba.

## Rutas frontend
- `/sistemas/agentes` — `AgentsPage.tsx`, catálogo de agentes (sin cambios).
- `/sistemas/base-conocimiento` — `KnowledgeBasePage.tsx` (nueva), enlazada desde "Accesos rápidos" en `SistemasDashboardPage.tsx`.

## 2. Manual de uso integrado + permisos vigentes en conversaciones viejas (2026-09-30)

### Problema
- El agente respondía "No tengo información sobre cómo usar el módulo de Contratación Pública" y "No tengo información sobre sub-módulos como clientes y contratos" a usuarios que SÍ tenían esos módulos: el "cómo se usa" dependía solo de la Base de Conocimiento, que nadie había llenado.
- Una conversación iniciada con un permiso seguía respondiendo sobre ese módulo después de quitarle el permiso al usuario: el modelo releía sus propias respuestas viejas del historial.

### Solución
- **`system-guide.util.ts`** (nuevo): manual de uso escrito desde la interfaz (menús y botones reales, flujos paso a paso, relaciones entre sub-módulos, preguntas frecuentes de usuarios nuevos). Bloque `GENERAL` para todos (Inicio, Proyectos y Tareas, Encuestas, Buzón de Quejas, Referir un cliente, campana, llave inglesa, Mi perfil) + un bloque por sección (`RRHH` muy detallado, `VENTAS`, `CONTRATACION_PUBLICA`, `CACAO`, `CUSTODIAS`, `ADMIN`, `SISTEMAS`) que solo se entrega si el usuario ve esa sección AHORA. El bloque GENERAL no nombra ningún módulo con permiso (el spec lo verifica). La Base de Conocimiento sigue existiendo y se suma encima, para lo propio de cada empresa. **Cuando cambie una pantalla, actualizar su bloque en este archivo.**
- `capabilities-prompt.util.ts`: instruye explicar paso a paso con el manual (nunca "no tengo información" sobre algo disponible), lenguaje para principiantes, no inventar botones, y que la lista de módulos vigente manda sobre lo dicho antes en la conversación.
- **`ChatMessage.sections`** (nueva columna): cada mensaje guarda con qué secciones se generó. `getConversationHistory` descarta los turnos generados con una sección que el usuario ya perdió, y los anteriores a esta columna (`null`, sin forma de saber sus permisos). De paso, el historial ahora es de los **últimos** 20 mensajes (antes eran los primeros 20), usa el rol real de cada mensaje (antes asumía que alternaban) y ya no duplica el mensaje actual.

Verificado con Vertex real en local: Contratación Pública "¿cómo lo uso?" → pasos completos; relación Clientes/Contratos → explicada; usuario sin permisos → responde lo común y no revela Ventas; conversación con RRHH, luego RRHH revocado en la misma conversación → ya no responde sobre Cumplimiento.

### Formato de las respuestas en el chat (2026-09-30)
`ChatDrawer.tsx` mostraba el texto crudo del modelo y `.chat-msg-text` no conservaba saltos de línea: las listas salían como un párrafo con asteriscos. Ahora las respuestas del agente pasan por `components/chat/ChatMarkdown.tsx` (listas, listas numeradas, subniveles por sangría, **negrita**, *cursiva*, `código`; arma elementos de React, nunca HTML inyectado; también parte listas que el modelo pega en una sola línea). El prompt (`capabilities-prompt.util.ts`) pide Markdown simple, un elemento por línea, respuestas breves ante preguntas generales, y no decir "si tienes acceso" de módulos que el usuario ya tiene.
