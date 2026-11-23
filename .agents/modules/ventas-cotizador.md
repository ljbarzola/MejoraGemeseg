# Ventas y CRM — Cotizador

Catálogo, kits, plantillas, cotizaciones, límites de precio, custodia móvil, enlace al cliente y unión con oportunidades. Menú Ventas y CRM → Cotizador, `/ventas/cotizador`, sección `VENTAS` (ver = consultar, escribir = guardar/editar catálogo). Es copia fiel del cotizador independiente (`cotizador.gemeseg.com`, sigue funcionando): misma lógica de precios, pantallas y PDF. Los cambios de lógica de los puntos 2, 3 y 4 se aplican también allá.

## 1. Alcance y lo que NO se copió

No se copió el editor tipo hoja de cálculo ni el manual del original (el catálogo se edita por producto y por lotes con `POST catalogo/lote`, transaccional). Salidas: «Imprimir / Guardar PDF» y el enlace del punto 14; no hay envío por correo.

## 1b. Diseño y teléfono del asesor

- Teléfono del emisor en hoja y PDF: el del dueño de la cotización (`ownerPhone` = `User.phone`; si es mía o nueva, el de mi perfil); si no tiene, `TELEFONO_POR_DEFECTO`. No se congela. Ver `users.md` punto 8.
- La cotización es una hoja; «Márgenes de ganancia» es un segmento ámbar «Interno · no se imprime». Acciones en `<VentasPageHeader>`; catálogo a la izquierda fijo con scroll propio (`ventas-contratos.md` §32). Divisor arrastrable (`localStorage` `cotizador:ancho-catalogo`). Formularios de la hoja siempre en 2 columnas iguales (no `auto-fit`).

## 2. El producto se identifica por su código, nunca por su posición

Cada línea guarda el código (`EQ-0001`, `MT-0001`, `SV-0001`; instalaciones `INST-001`) y una copia del precio usado (`snap`: costo, ganancia, instalación, servicio, proveedor). Las líneas importadas con solo posición quedan con `legacyPosition` y la pantalla avisa; no se corrigen en silencio. `sanitizeLines` rechaza una línea sin código salvo con `legacyPosition`.

## 3. Borrar = desactivar; el código no se reutiliza

- `DELETE productos/:id` (e `instalaciones/:id`) solo pone `isActive=false`; las cotizaciones y kits que lo usaron no cambian (usan el `snap`).
- Código nuevo = último + 1, asignado por el servidor (el DTO no acepta `code`). `CotCounter` por empresa y tipo solo sube (`reservarCodigo`: `INSERT … ON CONFLICT DO UPDATE SET lastSeq = GREATEST(lastSeq, máximo existente) + 1`).
- Un producto desactivado no se edita; código y tipo no se cambian.

## 4. Precio congelado y aviso de cambio

La cotización conserva su precio. Si el catálogo hoy tiene otro costo, sale el aviso y el botón **Usar precios actuales**; hasta pulsarlo el total no cambia.

## 5. Fórmulas (`frontend/src/utils/cotizador/pricing.ts`, con `pricing.test.ts`)

- Precio antes de IVA = costo + `round(costo × margen / 100)` si lleva ganancia. Margen por proveedor (15 % por defecto; clave «Sin proveedor»); instalaciones 35 %; margen por línea opcional.
- Servicios: costo = mensual > 0 ? mensual : anual > 0 ? `round(anual/12, 2)` : unitario; llevan IVA, no ganancia.
- **Descuento siempre ANTES del IVA** (porcentaje o fijo); IVA 15 % una vez sobre el subtotal descontado; total = `Number((subtotal + iva).toFixed(2))`. Los totales no se guardan, se recalculan.
- El PDF (`QuotePrint`) nunca muestra costo, ganancia ni proveedor.

## 6. Quién ve y quién modifica

`resolveQuoteAccess` (`cotizador.util.ts`), prioridad dueño > edición total > compartida > administrador:

| Acceso | Ve | Modifica/estado | Elimina | Comparte |
|---|---|---|---|---|
| Dueño | sí | sí | sí | sí |
| Edición total (`editor`) | sí | sí (a nombre del dueño) | no | no |
| Compartida (`shared`) | sí | no (puede «Crear copia») | no | no |
| Admin de la empresa | todas | no | no | no |

Cotización ajena o de otra empresa: **404**. Todo por `companyId`; el super administrador sin empresa no usa el Cotizador. Solo se comparte con usuarios activos de la misma empresa y no con uno mismo.

## 7. Número de cotización

`COT-AAAAMMDD-NNNN`, secuencia global por empresa (`CotQuoteSequence`, no se reinicia por día), fecha de Ecuador (UTC-5), única por empresa. Si el número tecleado existe, 409 y el frontend pregunta. El filtro global de excepciones descarta campos extra, por eso existe `GET cotizaciones/verificar-numero` (devuelve `existe` y, si es tuya, `id`).

## 8. Datos y arranque

- Modelos: `CotProduct` (con `minPrice`), `CotInstallService`, `CotCounter`, `CotQuoteSequence`, `CotKit`, `CotTemplate`, `CotQuote`, `CotQuoteShare`, `CotEditGrant`, `CotCambio`, `CotLimites`; sin relaciones a `User`/`Company` (por `companyId`/`ownerId`). Sin modelo Prisma (SQL): `CotEnlace`, `CotEnlaceVisita`, `CotEnlaceRespuesta`, `CotQuoteOportunidad`.
- **Las tablas se crean al arrancar** (`cotizador.schema.ts` → `COTIZADOR_DDL`, idempotente, vía `VentasSchemaService`); el deploy no corre migraciones. Las migraciones de `prisma/migrations/*cotizador*` son solo referencia; no usar `migrate deploy`.
- Líneas, cliente, márgenes y condiciones son `Json` con tamaño máximo (`assertJsonSize`) y lista blanca (`sanitizeLines/Client/Margins/KitComponents`).

## 9. Importar desde el cotizador original

`node prisma/import-cotizador.js --dump <volcado.sql> --company gemeseg [--dry-run] [--replace]` (`backend/prisma/import-cotizador.js`). Lee un volcado exportado (nunca se conecta a Supabase), mapea usuarios por correo (los inexistentes pasan a un administrador), convierte líneas a código con `snap`, copia el teléfono a `User.phone` si falta y deja cada contador en el máximo importado. `--replace` borra las tablas `Cot*` de la empresa (solo bases de prueba; sin él se niega si la empresa ya tiene datos). Contra la base real solo con autorización explícita y respaldo.

Importar catálogo del original sobre uno vivo: el original manda en colisiones de código; lo de Mejora que ocupaba el código pasa al siguiente libre y hay que **reescribir las referencias** en `CotQuote.items`, `CotTemplate.items` y `CotKit.components` (por código; instalaciones por `id`), en una transacción, con respaldo de Cloud SQL y comprobando que ninguna línea quede sin producto. Es script puntual.

## 10. Pruebas

Backend jest: `cotizador.util.spec.ts`, `cotizador-catalogo.service.spec.ts`, `cotizador-cotizaciones.service.spec.ts`. Frontend vitest (`npm test` en `frontend/`): `pricing`, `quoteState`, `alertas`.

## 11. Cliente desde el Directorio y hoja impresa

- `ClienteDirectorioInput`: hasta 8 coincidencias del Directorio (`SalesClient`, nombre o RUC, sin tildes) con `GET /ventas/clientes` al enfocar; si falla o no hay acceso, texto libre. No crea nada en el Directorio.
- Elegir uno rellena nombre, RUC, teléfono, dirección, email y «Contacto» (primera persona de sus contactos, con su teléfono/email si el cliente no tiene) en `traerDelDirectorio` (`CotizadorPage`). Sin vínculo vivo.
- Hoja impresa: `QuotePrint.tsx` + CSS `.cot-print-*`; logo GEMESEG o, si es otra empresa, su logo claro sobre caja oscura (`.en-caja`); Und (unidad real; servicio sin unidad: «servicio» en pantalla, «—» en PDF); letra Montserrat (enlace en `frontend/index.html`). No sale el email del emisor.
- Nombre del PDF = `document.title`: «N.º - Cliente» (solo el número si no hay cliente).

## Endpoints (`/ventas/cotizador`, `VENTAS`; rutas fijas antes de `:id`)

- Historial (12): `GET historial`, `GET historial/personas`. Límites (13): `GET limites`, `PUT limites` (ADMIN/MANAGER).
- Catálogo: `GET catalogo` (`?incluirInactivos=true`), `GET siguiente-codigo?tipo=`, `POST catalogo/lote`, `POST/PATCH/DELETE productos(/:id)` e `instalaciones(/:id)`. Kits y plantillas: `GET/POST` y `PATCH/DELETE :id`.
- Cotizaciones: `GET/POST cotizaciones`, `GET siguiente-numero`, `GET verificar-numero`, `GET/PATCH/DELETE cotizaciones/:id`, `PATCH :id/estado`, `POST :id/copiar`.
- Compartir: `GET :id/compartidos`, `POST :id/compartir`, `DELETE :id/compartir/:userId`, `GET usuarios`, `GET/POST accesos-edicion`, `DELETE accesos-edicion/:userId`.
- Custodia: `GET/PUT custodia/tarifas` (PUT solo ADMIN/MANAGER), `POST custodia/calcular`; ruta de mapa `GET /ventas/ubicaciones/ruta`.
- Enlace (14): `GET/POST/DELETE cotizaciones/:id/enlace` (GET ver; POST/DELETE escribir, dueño o edición total). Públicas sin sesión: `GET /public/cotizaciones/:token`, `POST …/visitas`, `POST …/visitas/:visita/latido`, `POST …/respuesta`.
- Oportunidad: ver punto 15.

## Catálogo (modal) e historial de cotizaciones

- `tablasVivas.ts`: un wrapper con `data-viva-en-modal` sí se activa dentro de un modal y su alto lo manda el CSS (modal del catálogo, `cot-cat-*`).
- Tabla del historial: el recorte de cliente/vendedor va en `<span className="truncate" title=...>` DENTRO del `<td>` (la clase es `display: block` y en el `<td>` rompe la tabla); los anchos suman menos que el útil de la ventana `lg` (920 px). Estilos `.cot-hist-wrap` en `cotizador.css`, que está en Latin-1: editarlo en binario.

## 12. Historial de cambios del catálogo

Solo historial (sin bloqueo ni aprobaciones). Un historial general, no por producto (el producto es un filtro).
- Registra crear, eliminar y editar (costos, proveedor, nombre, categoría, unidad, notas, precio mínimo). **«Lleva ganancia» y «Lleva instalación» NO se registran.** Kits y plantillas no. En pantalla «Eliminó» (por dentro, desactivar).
- Tabla `CotCambio` (un renglón por campo en `EDITO`, uno en `CREO`/`ELIMINO`; `userNombre` copiado). Lo escribe el servidor en la misma transacción (`anotar` en `cotizador-catalogo.service.ts`), también en el lote; sin cambios reales no anota. Comparación `diffCatalogo` (`cotizador.util.ts`; `85.0000` = `85`, vacío = `null`). `CAMPOS_PRECIO` = costo unitario/mensual/anual.
- `GET historial?q=&tipo=precio|datos|creo|elimino&desde=&hasta=&userId=&pagina=&limite=` (días de Ecuador). No registra cambios hechos por scripts directos a la base.
- Pantalla: Catálogo → pestaña «Historial» (`HistorialCatalogoModal.tsx`, `modal-ventas-lg`). Tabla estándar: filtros en la cabecera de columna (`useColumnFilters` + `ColumnFilter`), arriba solo buscador, «Columnas», limpiar y exportar. Trae el historial completo (de a 200, hasta 5.000) y filtra en el navegador. Error de carga: mensaje corto fijo.
- **Clave de columnas propia (2026-11-23):** «Columnas» y los anchos de esta ventana se guardan como `columnas:cotizador-historial-catalogo`, **no** como `cotizador-historial` (que es la del historial de cotizaciones). Antes compartían clave: si alguien dejaba solo «Fecha» en las cotizaciones, aquí también salía solo Fecha. Además, el menú «Columnas» se pinta en el `body` con `--z-popover` (1100) para que no quede detrás del modal (1050) — en producción parecía que el botón no hacía nada. Verificado en local: salen las 6 columnas y el menú se abre por encima.

## 13. Avisos de precio bajo y límites

Solo **aviso**, no bloqueo. Límites por empresa definidos por ADMIN/MANAGER; los demás los ven en solo lectura. Reglas en `utils/cotizador/alertas.ts` (`calcularAlertas`, pura):
- **Descuento máximo** (% sobre la base, también con descuento fijo): un límite para equipos/materiales/instalaciones y otro para servicios; si se mezclan, manda el más bajo de los que aplican.
- **Ganancia mínima** (% sobre el costo) solo de lo que lleva ganancia; los servicios no suman ni diluyen; cuenta el descuento repartido y los márgenes propios.
- **Precio mínimo** por producto/servicio: precio unitario antes de IVA con el descuento repartido. Instalaciones no tienen.
- Vacío o 0 = sin límite. El aviso sale junto a los botones de guardar, no se imprime ni se guarda (se calcula al abrir con los límites actuales).

Datos: `CotLimites` (una fila por empresa: `maxDescuentoPct`, `maxDescuentoServiciosPct`, `minGananciaPct`); columna `CotProduct.minPrice` creada al arrancar en `src/prisma/cot-product-minprice.schema.ts` con `to_regclass` (en base nueva la tabla la crea `VentasSchemaService` ya con la columna). `PUT limites` exige ADMIN/MANAGER. El precio mínimo de un producto solo lo fijan ADMIN/MANAGER (403 a otro rol; guardar sin tocarlo sí); sus cambios van al historial. Pantalla: «Límites de precio» (`modal-ventas-sm`) y campo «Precio mínimo de venta» en el producto.

## Custodia móvil dentro del Cotizador

«+ Custodia móvil» (en «Detalle de la cotización») abre una calculadora y agrega UNA línea de servicio (`isCustodia`).
- **Sin parámetro de IVA:** es una línea más; el IVA se calcula una vez al final sobre el subtotal descontado. No hay `ivaPct`.
- Tarifas configurables por empresa (Ventas → Configuración → «Tarifas de custodia», guardadas en `SalesSetting` clave `cotizador-custodia`; sin ellas rigen las iniciales de la hoja de origen): regiones con tarifa de agente (la elige el vendedor), mínimo de custodios (1; los choferes no cuentan) y **extras opcionales** (nocturno, relevo/pernocta, seguro, ruta alternativa, permisos, financiamiento) «Fijo» (valor × cantidad) o «Porcentaje» (del costo normal), que nacen en 0.
- Personal fijo por viaje y región: no sube con km ni horas (solo la espera del vehículo cambia el costo por horas).
- **Margen definido en cada cálculo** (30 % por defecto, `MARGEN_CUSTODIA_POR_DEFECTO`), **sobre el PRECIO**: precio = costo total ÷ (1 − margen); distinto al margen del resto del Cotizador (sobre el costo). Pendiente de confirmar con Comercial si prefieren el criterio de los productos.
- Cálculo en el servidor (`backend/src/modules/ventas/cotizador-custodia.util.ts`, `calcularCustodia`, pura; la usa también el bot de WhatsApp): suma sin redondear cada concepto y redondea solo lo mostrado; con datos faltantes devuelve `ok:false` y motivos (no lanza).
- Mapa: Nominatim para origen/destino y `GET /ventas/ubicaciones/ruta?olat&olng&dlat&dlng` → `{ km, minutos, trazo }` con OSRM público (`OSRM_URL`), 1 consulta/s y caché; los km siempre se pueden escribir a mano.
- La línea guarda sus datos y el **resultado congelado**; «Recalcular» la reemplaza. `limpiarLineaCustodia` valida y acota. `computeQuote`: suma al subtotal. El PDF agrega «SERVICIO DE CUSTODIA MÓVIL» solo con descripción y precio: **nunca** costos, utilidad ni margen. El texto legal del PDF dice «IVA del 15 %» fijo.

## 14. Enviar al cliente con un enlace

Se comparte con «Copiar» o «Enviar por WhatsApp» (abre WhatsApp con el mensaje; Mejora no envía nada). El enlace no vence (se apaga con «Desactivar enlace») y se registra su apertura. **El cliente JAMÁS ve porcentajes de ganancia.**

**Seguridad:**
- Precios calculados **en el servidor**: `cotizador-precios.util.ts` es la copia de `computeQuote` (`pricing.ts`) y devuelve solo precio unitario de venta, cantidad, total por línea y totales. La página pública recibe una **lista blanca** (`armarPagina` en `cotizador-enlaces.util.ts`): nada de costo, ganancia, margen, proveedor, `snap`, costos de custodia ni ids internos (sí teléfono y correo del propio cliente). **Si cambia una regla de `pricing.ts`, cambiarla también en `cotizador-precios.util.ts`.**
- Código al azar de 192 bits (`randomBytes(24)`), nunca el número de cotización; uno mal formado, inventado o apagado da el mismo 404. Límite por IP (lectura 120 / 10 min, avisos de tiempo 600 / 10 min, respuestas 10 / hora) y máximo 10 respuestas por enlace al día; la IP no se guarda. Cabeceras `no-store`/`noindex`, `referrer no-referrer`. Ruta pública sin `AuthGuard` (`/api/public/cotizaciones/...`).

**Seguimiento:**
- Cada apertura es una fila de `CotEnlaceVisita` (tipo de equipo, id al azar del navegador, tiempo a la vista). La página avisa cada 15 s solo si está visible; el servidor suma con tope de 30 s por aviso y 4 h por visita y no cuenta el rato oculto. El tiempo es aproximado y así se rotula.
- Aperturas del propio equipo (sesión de la misma empresa) quedan `interna` y no cuentan; sus respuestas de prueba no se guardan.
- La primera apertura pasa «Borrador/Enviada» a «Vista» y notifica al dueño; cada «Me interesa»/«Tengo dudas» (mensaje opcional, 500 caracteres) también; el aviso abre `/ventas/cotizador?cotizacion=<id>&seguimiento=1`. Crear el enlace pasa «Borrador» a «Enviada». Cambiar el estado no toca `updatedAt` (la página dice «Actualizada el…» solo si cambió la cotización).
- **«Descargar PDF» es IDÉNTICO al PDF de la app:** la hoja vive en `components/ventas/cotizador/HojaCotizacion.tsx` (datos neutros, solo precios de venta), usada por `QuotePrint.tsx` y `CotizacionPublicaPage`; un cambio de diseño del PDF se hace ahí. Para cuadrar, el servidor manda también `cantidadEnKit`, categoría/subcategoría de instalaciones y teléfono/correo del cliente. La descarga queda marcada en la visita.
- «Compartir con mi equipo» = dar una cotización en solo lectura a un compañero (no confundir con «Enviar al cliente»).

**Pantallas:** «Enviar al cliente» junto a «Guardar» (bloqueado hasta guardar); `EnviarClienteModal` (`modal-ventas-md`) con enlace, copiar, WhatsApp, «Ver como el cliente», aviso de cambios sin guardar (el cliente ve la última versión guardada), seguimiento y «Desactivar enlace» (diálogo propio). Crear/desactivar: dueño o edición total. Página pública `CotizacionPublicaPage` (`/cotizacion/:token`, fuera de `ProtectedLayout`, sin chat del agente), con colores y logo de la empresa.

## 15. Cotización ↔ oportunidad

Una oportunidad puede tener varias cotizaciones. Funciona en los dos sentidos: «Cotizar» en la oportunidad (Cotizador prellenado y unido) y selector «Oportunidad» en el Cotizador. Es **obligatoria para enviar al cliente o imprimir/descargar PDF**, no para guardar borrador (el servidor también la exige al crear el enlace: 400). El monto de la oportunidad sale de la cotización **principal** que marca el vendedor.

- Tabla `CotQuoteOportunidad`: `quoteId` (PK: una oportunidad por cotización), `opportunityId`, `principal` (índice único parcial: una principal por oportunidad). Borrar cotización u oportunidad borra la unión.
- `cotizador-oportunidad.service.ts`/`.controller.ts`: `GET /ventas/cotizador/oportunidades?q=` (abiertas) y `…/:id`; `GET|PUT /ventas/cotizador/cotizaciones/:id/oportunidad` (solo quien edita); `GET /ventas/oportunidades/:id/cotizaciones`; `POST /ventas/oportunidades/:id/cotizaciones/:quoteId/principal` (VENTAS escritura).
- El total con IVA se calcula en el servidor (`cotizador-precios.util.ts`). La principal copia su total a `SalesOpportunity.quotedAmount` al marcarla y en cada guardado (`actualizar` → `sincronizarMonto`; si falla se registra y no cae el guardado); `quotedAt` solo si estaba vacío. La primera cotización unida a una oportunidad **sin monto** queda principal sola (no pisa un monto escrito a mano). Quitar la unión no borra el monto.
- **Nunca se reemplaza el monto en silencio:** `GET|PUT …/oportunidad` devuelve total, monto actual y principal actual y la pantalla decide: ya principal (o principal sola) → aviso de monto actualizado; recién unida y no principal → pregunta usar su total o hacerla principal; monto igual y sin otra principal → se marca sola. Una ya unida y no principal no vuelve a preguntar (se cambia en Oportunidades → «Marcar principal»).
- Cotizador: `OportunidadSelector.tsx` (abiertas; empieza por el cliente escrito); «Crear oportunidad para «cliente»» la crea ahí (busca la empresa en el Directorio por RUC o nombre exacto; si no está, la agrega «solo datos»). Elegirla pone los datos de ese cliente. La unión se guarda con «Guardar cotización». `?oportunidad=<id>` empieza una cotización nueva prellenada (pregunta si hay una sin guardar). Una copia conserva la oportunidad.
- Oportunidades: «⋯» → «Cotizar»; en «Editar», `CotizacionesDeOportunidad.tsx` con «Cotizar» y «Marcar principal». Con principal, «Monto cotizado» queda bloqueado y no se envía al guardar.
- **Ojo:** el cambio de etapa a «Cotizada» aún pide y guarda un monto a mano; con principal, el siguiente guardado de esa cotización lo vuelve a poner.

## 16. Modelo del equipo en la cotización y edición desde la línea (2026-11-23)

**Pedido de Leidy:** que el modelo (el campo `model` del producto, ej. «DS-X») se vea en la cotización, y que al hacer clic en un producto dentro de la cotización se abra su edición.

- **Dónde sale el modelo:** solo en los equipos (`CotProduct.model`; materiales y servicios no lo llevan). `toPriceItem` lo copia a `PriceItem.model` y `QuotePrint`/`cotizador-precios.util.ts` a `HojaFilaProducto.modelo` / `FilaProductoVenta.modelo`.
  - **Pantalla de la cotización** (`QuoteDetail`): debajo del nombre queda `EQ-0422 · DS-X` (código y modelo).
  - **PDF de la app y del enlace** (`HojaCotizacion`): **el código ya no se imprime**; en su lugar sale solo el modelo. Sin modelo no sale ninguna línea extra.
  - **Página del enlace** (`CotizacionPublicaPage`, tabla web): el modelo ocupa el lugar del código, igual que su PDF.
  - El modelo se lee del catálogo **actual** (no se congela por cotización, igual que el nombre).
- **Clic en el producto (o en un componente del kit):** si la persona puede **editar Ventas** y la cotización es suya o de edición total, abre directo el formulario del catálogo (`ProductFormModal`) con aviso de que el cambio es de **toda la empresa** y queda en Catálogo → Historial. Si no (compartida, vista de administrador, solo lectura) o el producto está **desactivado**, se abre la ficha de solo lectura (`ProductDetailModal`).
- **Al guardar desde la cotización:** se recarga el catálogo y se avisa «Producto actualizado». El precio sigue congelado con su aviso «precio de cuando se cotizó».
- **Fuera de alcance:** editar cantidad o margen desde ese clic, y modelo para materiales o servicios.

**Archivos:** `utils/cotizador/pricing.ts` (+ prueba en `pricing.test.ts`), `QuoteDetail.tsx`, `HojaCotizacion.tsx`, `QuotePrint.tsx`, `CotizadorPage.tsx`, `CatalogForms.tsx`, `services/cotizacionPublica.service.ts`, `CotizacionPublicaPage.tsx`, `backend/.../cotizador-precios.util.ts` (+ `cotizador-precios.util.spec.ts`).

## 17. Condiciones generales por pilar (2026-11-23)

**Pedido de Leidy:** en Ventas → Configuración → Servicios, debajo de cada pilar debe existir una configuración «Condiciones generales»; ese texto es el que aparece por defecto en el Cotizador (y por lo tanto al imprimir, en el PDF y en el enlace del cliente).

- **Dónde se configura:** al pie de cada columna/pilar de Configuración → Servicios (Gemeseg / Megamont / Adasmeg) hay un textarea «Condiciones generales» y su botón «Guardar condiciones». Lo puede cambiar quien tiene «Escribir» en Ventas.
- **Infraestructura de pilares incluida:** constantes `ventas-pilares.const.ts` / `utils/pilares.ts`, columna `SalesService.pilar` (DDL al arrancar) y selector de pilar en el alta/edición inline de servicios.
- **Dónde se guarda:** tabla nueva `CotCondicionesPilar` (companyId + pilar + texto), creada al arrancar. `GET/PUT /ventas/cotizador/condiciones-pilares`. La consulta siempre devuelve los TRES pilares; los que no tengan fila entregan el texto de siempre (`CONDICIONES_GENERALES_POR_DEFECTO`), así que nadie nota el cambio hasta que lo edite.
- **En el Cotizador:** selector «Pilar» junto a «Oportunidad» con los tres siempre visibles. Se preselecciona solo si todos los servicios de la oportunidad son de un pilar; si hay varios queda sin elegir. El backend manda `pilares` en `GET /ventas/cotizador/oportunidades[/:id]`.
- **Cuándo se precarga:** si el campo está vacío o sigue siendo el texto automático se rellena sin preguntar; si la persona lo editó se abre un `ConfirmDialog` propio con «Usar las de [pilar]» / «Conservar las actuales». Reglas en `utils/cotizador/condiciones.ts` (+ test).
- **Persistencia:** la cotización guarda el `pilar` elegido (columna nueva en `CotQuote`, asegurada con `ALTER TABLE ... IF NOT EXISTS` y en el `CREATE TABLE` del DDL). Impresión, PDF y enlace siguen usando el campo `conditions`, sin cambios. Las cotizaciones ya guardadas no se reescriben.

**Verificado en local:** compilan frontend y backend; pasan los tests de `utils/cotizador` y del Cotizador en backend; probado en navegador (configuración, preselección desde oportunidad, diálogo al cambiar de pilar, PDF/enlace) y round-trip de `pilar` por API.

## Rutas frontend

- `/ventas/cotizador` (`SectionRoute section="VENTAS"`): `pages/ventas/CotizadorPage.tsx`, `components/ventas/cotizador/`, `utils/cotizador/` (`types`, `pricing`, `quoteState`, `alertas`, `format`, `draft`), `services/cotizador.service.ts`. Acepta `?cotizacion=<id>&seguimiento=1` y `?oportunidad=<id>`.
- `/cotizacion/:token` (pública): `pages/ventas/CotizacionPublicaPage.tsx` + `cotizacionPublica.css`, `services/cotizacionPublica.service.ts`.
