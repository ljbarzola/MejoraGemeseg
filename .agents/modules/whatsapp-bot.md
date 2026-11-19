# Bot de WhatsApp de Ventas

Código: `backend/src/modules/whatsapp-bot/`; pantalla `Ventas › Conversaciones` (`/ventas/conversaciones`, `pages/ventas/ConversacionesPage.tsx`); pestaña «Bot de WhatsApp» en Ventas › Configuración (`components/ventas/BotWhatsappConfigSection.tsx`).

## Decisiones de producto
- Atiende a posibles clientes y clientes actuales, con un solo número. Proveedor: Meta directo (Cloud API), no Twilio.
- Modos: `AUTO` (por defecto) y copiloto (`WaMessage.estado = PROPUESTO`: una persona aprueba, edita o descarta). Copiloto sirve para pruebas.
- Toda cotización avisa que es una IA, que el precio es referencial y que lo cierra un asesor (`avisoIA`, `avisoPrecios` en `whatsapp-bot.util.ts`, con el nombre de la empresa; aviso de datos personales editable).
- Bot 24/7; asesores en horario configurable (hora de Ecuador). Fuera de horario toma datos y avisa que responderán el siguiente día hábil.
- Si una persona toma la conversación el bot se pausa (`estado PERSONA`); «Devolver al bot» lo reactiva. Cada mensaje queda en el historial.
- Las últimas 5 correcciones de personas (`WaMessage.textoOriginalBot`) se muestran al bot como ejemplos.

## Cómo funciona
- Tablas `WaConversation` y `WaMessage` creadas al arrancar (`whatsapp-bot.schema.ts`, candado propio), sin modelo en `schema.prisma`. Ajustes por empresa en `SalesSetting` clave `whatsapp-bot` (número, activo, modo, conocimiento, horario, guion, plantilla, teléfonos de prueba).
- Entrada: `POST /api/ventas/whatsapp-bot/webhook` (público; valida `X-Hub-Signature-256` con el secreto de la app sobre el cuerpo exacto, por eso `main.ts` usa `rawBody: true`) y `GET` de verificación con `WHATSAPP_VERIFY_TOKEN`. La empresa se resuelve por `phone_number_id` de los ajustes. Idempotente por `wamid`.
- Flujo: mensaje → conversación → posible cliente (canal WHATSAPP, `externalId wa:<teléfono>`, `VentasLeadsService.ingresar`; con código `GMS-WA-…` se enlaza al clic de la landing) → aviso en la campana a quien tiene Ventas con «Escribir» explícito (una vez mientras siga sin leer) → el bot prepara la respuesta (Vertex, nivel ligero) o escala.
- El bot solo conoce el texto «Qué sabe el bot» de Configuración. **No usa la Base de Conocimiento interna** (su sección GENERAL la ve cualquiera de la empresa y lo que lee el bot puede llegar a un cliente; cambiar solo con acuerdo de Leidy). Nunca recibe costos, márgenes ni datos de otros clientes; el texto del cliente es dato, no instrucción.
- Envío: `WhatsappMetaClient`. Secretos solo en el servidor: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (opcional `WHATSAPP_API_VERSION`); se guardan en Secret Manager **antes** de añadirlos a `--set-secrets` de `cloudbuild.yaml`. Sin token: fuera de producción el envío se simula (marcado «simulado»); en producción falla a propósito.
- Texto libre solo dentro de las 24 h del último mensaje del cliente. Pasado el plazo se usa la plantilla de reanudación configurada (nombre, idioma, si lleva `{{1}}`; una vez cada 24 h) y el mensaje queda «no se envió» para reenviarlo cuando el cliente responda; sin plantilla, queda «no se envió».
- Sin Meta, solo en desarrollo: «Simular mensaje de un cliente» (`POST /ventas/conversaciones/simular`, rechazado en producción).
- Aviso en la campana: `link /ventas/conversaciones?c=<id>`; si se renombra la ruta hay que migrar esas notificaciones guardadas.

## Guion por empresa (nada fijo en el código)
- `AjustesBot.guion`: áreas/pilares (nombre, qué incluye, preguntas de indagación, activa, qué cotiza el bot), pregunta de apertura, aviso de datos personales, `sedes`, `minimoRespuestas`. Con un posible cliente nuevo el bot primero pregunta por cuál área le interesa y luego pregunta de a una o dos. «Cargar ejemplo» pone los tres pilares de `ventas-pilares.const.ts` (Gemeseg/Seguridad Física, Megamont/Monitoreo, Adasmeg/Soluciones Tecnológicas), NO «guardianía, custodia, productos». Empresa sin guion: no cotiza.
- **Qué sale solo:** en `AUTO` salen sin aprobación los mensajes básicos, las preguntas de indagación y el aviso «te pondré en contacto con un asesor»; solo una respuesta con precios espera a una persona. Las respuestas de rutina no generan notificación; sí el escalado y las cotizaciones por revisar.
- El bot NO pasa a un asesor con el primer mensaje ni con datos vagos: indaga (qué, dónde, cuánto, cuándo, nombre/empresa). Pasan de inmediato: pide una persona, queja/reclamo, emergencia, pagos o facturas (`[ESCALAR: motivo]`, hasta 600 caracteres).
- **`[LISTO: resumen]`** cierra el pedido (no `[ESCALAR]`). Si lo emite con menos mensajes del cliente que `guion.minimoRespuestas` (defecto 4; el «hola» cuenta) el servidor lo devuelve UNA vez a seguir preguntando; en la segunda se acepta. Datos mínimos: área, respuestas del área, lugar/ruta, cantidad, fecha y horario/duración, tipo de lugar, nombre y empresa.
- **Sedes:** `guion.sedes` = ciudades con oficina. Si no es sede, no cotiza ni promete: reúne datos y pasa a un asesor (`FUERA DE SEDES` en el resumen). En custodia móvil el servidor lo hace cumplir (`ciudadEnSedes`, sin tildes, una contiene a la otra): origen o destino fuera de sedes → mensaje fijo «un asesor confirmará la cobertura» y escala. Sin sedes no se comprueba.
- Posibles clientes: al darse por entendido el pedido (`[LISTO]` o fuera de sedes) `SalesLead.message` pasa a ser el resumen y el primer mensaje queda en `SalesLead.extra.mensajeInicial`.

## Cotización dentro del bot
- El modelo NO escribe precios. Emite `[COTIZAR_PRODUCTOS: {...}]` o `[COTIZAR_CUSTODIA: {...}]`; el servidor valida (el área debe permitirlo), calcula con el mismo cálculo del Cotizador (`cotizador-precios.util.ts`, `cotizador-custodia.util.ts`) y arma el texto (subtotal, IVA, total y avisos). Márgenes y tarifas se configuran en pantalla; el modelo no puede cambiarlos ni los imprevistos. Falta un dato → reintenta UNA vez; si no puede, pasa a una persona.
- **Una cotización siempre queda para revisión humana, aun en `AUTO`**; la persona ve costo y margen (`WaMessage.cotizacion`). Guardianía y Monitoreo no cotizan (no hay tarifas): reúne datos y escala. Sin tarifas guardadas se usan `TARIFAS_CUSTODIA_POR_DEFECTO` (Costa/Sierra), que pueden no ser las reales; la región de la custodia es la del destino (supuesto por confirmar con Leidy).
- Segunda lectura (`pedidoDelCierre`, `construirPromptExtraccion`: solo extrae la etiqueta o responde `NINGUNA`, no conversa): el modelo ligero a veces cierra con `[LISTO]` sin `[COTIZAR_…]`; si emite `[LISTO]` sin pedido y alguna área cotiza, o si hay `[ESCALAR]` y el último mensaje o el motivo hablan de cotizar/precio/valor, se hace esta segunda llamada y el pedido pasa por la misma validación (`cotizacionPermitida` → `calcularPedido`). Con cotización lista se crean DOS mensajes: el aviso al cliente («un asesor te enviará la cotización…», sale solo en `AUTO`) y la cotización como borrador `PROPUESTO`. Si falta un dato, `resumenListo` se anula y vuelve a preguntar. `registro` de PRODUCTOS guarda `items` (código y cantidad) para editarla.
- En Conversaciones el borrador tiene «Ver cotización» (`CotizacionBotModal`: ruta, agentes, subtotal/IVA/total y, solo para el equipo, costo y margen) y «Editar en el Cotizador» (`/ventas/cotizador?conversacion=<id>&mensaje=<id>`: borrador nuevo con nombre y teléfono, custodia recalculada por el servidor; pregunta antes de descartar una cotización sin guardar; «Volver a la conversación» → `/ventas/conversaciones?c=<id>`). Pendiente: el borrador del Cotizador no queda unido a la conversación ni a una oportunidad (enviarlo al cliente exige una oportunidad) y el texto del borrador del chat no se actualiza al editar.

## Cliente actual y teléfonos de prueba
- Si el teléfono coincide (últimos 9 dígitos) con el del cliente o de uno de sus contactos, el bot recibe un resumen SIN valores de sus contratos (servicio, estado, vigencia/renovación) y saluda por el nombre del cliente; si pide algo o reporta una falla, escala con el motivo. Un teléfono repetido en dos clientes se trata como no registrado. Un número no registrado que dice ser cliente: no se le dan datos y se escala a verificar.
- `AjustesBot.telefonosPrueba` (solo dígitos, máx. 20, `esTelefonoDePrueba` compara los últimos 9): conversan igual pero NO generan avisos al equipo (`avisarEquipo` retorna; `EntranteInput.sinAviso` en `VentasLeadsService.ingresar`); el posible cliente y la conversación sí se crean. Quitarlos al terminar de probar.

## Audios e imágenes
`whatsapp-media.service.ts` los descarga de Meta (tope 8 MB), los transcribe/describe con Vertex (no se guarda nada) y el bot atiende ese texto. Si no se pudo leer, pasa a una persona.

## Configuración en Meta (la maneja Marketing; el código está listo)
1. Número dedicado, nombre visible aprobado y método de pago en la cuenta de WhatsApp Business.
2. Usuario del sistema con token permanente (`whatsapp_business_messaging`, `whatsapp_business_management`), secreto de la app y token de verificación: se pasan a Sistemas por canal seguro, nunca se escriben en la app.
3. `phone_number_id` pegado en Configuración → Bot de WhatsApp.
4. Webhook con la URL que muestra esa pantalla, token de verificación y campo `messages` suscrito.
5. Plantilla de reanudación aprobada (categoría utilidad); nombre exacto e idioma en Configuración.
6. Perfil de empresa del número (descripción, sitio, política de privacidad) y revisión legal del aviso de datos personales.
7. Probar y afinar guion, márgenes y «Qué sabe el bot» en copiloto con el simulador y luego con un número de prueba.

## Pendiente
- Tarifas de guardianía y monitoreo (para cotizar).
- Specs: existen los de `whatsapp-bot.util.ts`; el servicio no tiene.
- Audios/imágenes y la plantilla no están probados contra Meta real.
