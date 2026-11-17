# Ventas y CRM — Cotizador

Copia fiel del cotizador independiente (`C:\Users\leidy\Documents\COTIZADOR`, JS + Supabase, `cotizador.gemeseg.com`) dentro de Ventas y CRM. Menú **Ventas y CRM → Cotizador**, ruta `/ventas/cotizador`, sección de permisos `VENTAS` (ver = consultar, escribir = guardar/editar el catálogo).

> **Decisión de Leidy (2026-10-15): copia fiel, no rediseño.** Misma lógica de precios, mismas pantallas y mismo PDF. El cotizador independiente **sigue funcionando** (convivencia); no se apaga ni se redirige. Los cambios de lógica que sí se hicieron (puntos 2, 3 y 4) se aplicaron **también** al original, que está en producción con cotizaciones reales.

## 1. Alcance y lo que NO se copió

Copiado: catálogo (equipos, materiales, servicios, servicios de instalación), kits, plantillas, cotizaciones con historial por estados, compartir / edición total, descuento, márgenes por proveedor, IVA, PDF por impresión.

No copiado (anotado, no olvidado):
- El **editor tipo hoja de cálculo** del catálogo en bloque y el **manual de ayuda** del original. El catálogo se edita producto a producto y por lotes desde `CatalogManager` (la API `POST /ventas/cotizador/catalogo/lote` existe y es transaccional).
- Envío por correo: el original tampoco lo tenía; la salida es «Imprimir / Guardar PDF».
- Vincular la cotización a una **oportunidad** (al emitirla pasa a «Cotizada» con su monto; al aceptarla ofrecer el contrato). Es lo siguiente natural; no entra todavía.

## 1b. Diseño y teléfono del asesor (2026-10-15)

- **Teléfono del emisor:** el encabezado de la hoja y del PDF muestra el **icono de teléfono** y el número (antes decía «Tel.»; ver punto 11): el del **dueño** de la cotización (campo `ownerPhone`, su teléfono actual en `User.phone`; si la cotización es mía o nueva, el de mi perfil), y si no tiene, **+593 99 897 4909** como en el original (decisión de Leidy; constante `TELEFONO_POR_DEFECTO`). Ver `users.md` punto 8. No se congela en la cotización: si el asesor cambia de número, una reimpresión sale con el nuevo.
- **Diseño (pedido de Leidy: «parecido al original, sin perder la estructura de MejoraGemeseg»):** la barra de acciones va **debajo** del título (barra oscura con el degradado de la app; naranja solo en «Nueva cotización»); la cotización es **una hoja** (encabezado con logo/empresa/teléfono, N.º, fecha y estado editables ahí mismo, cliente, detalle, descuento, condiciones y totales) y **«Márgenes de ganancia» es un segmento ámbar marcado «Interno · no se imprime»** porque son costos que el cliente nunca ve. Campos con el estilo del resto de la app (borde 2 px, foco azul, etiquetas en frase normal, no en mayúsculas); el catálogo conserva su pestaña subrayada y el **divisor arrastrable** del original (ancho en `localStorage` `cotizador:ancho-catalogo`, doble clic lo restablece, flechas del teclado). Formularios de la hoja siempre en 2 columnas iguales (una regla `auto-fit` anterior los partía en 3 en pantallas anchas y los desalineaba: no volver a ella). **ACTUALIZADO 2026-10-20:** la barra oscura de botones ya no existe; las acciones van en el encabezado estándar de Ventas (`<VentasPageHeader>`) y el catálogo de la izquierda queda fijo con scroll propio mientras la cotización de la derecha se mueve con la página (ver `ventas-contratos.md` §32).
- Se quitó la tarjeta duplicada «Datos de la cotización» (N.º y fecha viven en el encabezado de la hoja).

## 2. El producto se identifica por su código, nunca por su posición

En el original la cotización guardaba `catalogIdx` (posición en la lista) y solo a veces `sourceId`: si se borraba un producto, los de abajo se corrían y una cotización vieja apuntaba a **otro** producto. Aquí cada línea guarda el **código** (`EQ-0001`, `MT-0001`, `SV-0001`; instalaciones `INST-001`) y una **copia del precio usado** (`snap`: costo, ganancia sí/no, instalación sí/no, servicio, proveedor).
- Las líneas importadas que solo traían posición quedan con `legacyPosition` y la pantalla avisa al abrir la cotización («Cotización antigua: …»). No se adivina ni se corrige en silencio (había 33 líneas dudosas de 3 vendedores; no se tocaron).
- `sanitizeLines` (backend) rechaza una línea sin código salvo que traiga `legacyPosition`.

## 3. Borrar = desactivar; el código no se reutiliza

- `DELETE /ventas/cotizador/productos/:id` (y `/instalaciones/:id`) solo pone `isActive=false`. El producto sale del catálogo y de las búsquedas; las cotizaciones y kits que lo usaron **no cambian** (se leen con el `snap` guardado).
- **Código nuevo = último + 1**, asignado por el servidor (el DTO ni siquiera acepta `code`). Contador `CotCounter` por empresa y tipo que **solo sube** (`reservarCodigo`: `INSERT … ON CONFLICT DO UPDATE SET lastSeq = GREATEST(lastSeq, máximo existente) + 1`), atómico aunque dos personas guarden a la vez. Borrar el último producto nunca devuelve su código.
- Un producto desactivado no se edita. El código y el tipo de un producto no se pueden cambiar.

## 4. Precio congelado y aviso de cambio

La cotización conserva el precio con que se hizo. Al abrirla, si el catálogo hoy tiene otro costo, sale un aviso («precio cuando cotizaste» vs «precio actual») y el botón **Usar precios actuales**; hasta que se pulse, el total sigue siendo el original. (Pedido de Leidy 2026-10-14 para minimizar el cambio de lo que ya vieron los clientes.)

## 5. Fórmulas (idénticas al original; `frontend/src/utils/cotizador/pricing.ts`, con `pricing.test.ts`)

- Precio antes de IVA de un producto = costo + `round(costo × margen / 100)` si tiene ganancia. Margen por proveedor (por defecto **15 %**, clave «Sin proveedor» para los que no tienen); instalaciones **35 %**; margen individual por línea opcional.
- Servicios: costo efectivo = mensual > 0 ? mensual : anual > 0 ? `round(anual/12, 2)` : unitario; llevan IVA pero no ganancia.
- **Descuento siempre ANTES del IVA** (porcentaje o valor fijo), IVA **15 %** una sola vez sobre el subtotal ya descontado; total = `Number((subtotal + iva).toFixed(2))`. Decisión 2026-10-14: el historial del original restaba el descuento fijo después del IVA y daba otro total que la pantalla y el PDF; se corrigió en los dos (los totales no se guardan, se recalculan, así que no hubo datos que arreglar).
- El PDF (`QuotePrint`) nunca muestra costo, ganancia ni proveedor. Hoja de impresión con CSS propio (`body:has(.cot-page)` oculta chat, avisos y botones flotantes).

## 6. Quién ve y quién modifica (reglas de las políticas del original)

Capa propia además de `VENTAS`; `resolveQuoteAccess` en `cotizador.util.ts`, prioridad **dueño > edición total > compartida > administrador**:

| Acceso | Ve | Modifica / cambia estado | Elimina | Comparte |
|---|---|---|---|---|
| Dueño (`owner`) | sí | sí | sí | sí |
| Edición total (`editor`: el dueño le dio acceso a todas las suyas) | sí | sí (queda a nombre del dueño) | no | no |
| Compartida (`shared`: una cotización) | sí | **no** (solo lectura; puede «Crear copia») | no | no |
| Administrador de la empresa (`admin`) | todas las de su empresa | **no** (solo lectura) | no | no |

Una cotización ajena o de otra empresa responde **404** (no revela que existe). Todo está acotado por `companyId`; el super administrador sin empresa no usa el Cotizador. Al compartir solo se aceptan usuarios **activos de la misma empresa** y no uno mismo.

## 7. Número de cotización

`COT-AAAAMMDD-NNNN`, con secuencia **global** por empresa (`CotQuoteSequence`, no se reinicia por día), fecha de **Ecuador** (UTC-5), única por empresa (`@@unique([companyId, quoteNumber])`). Se puede teclear otro número; si ya existe, responde 409 y el frontend pregunta («Cotización existente»). El filtro global de excepciones descarta campos extra de los errores, por eso existe `GET /cotizaciones/verificar-numero` (devuelve `existe` y, si es tuya, su `id`) en vez de leer un código del 409.

## 8. Datos y arranque

- Modelos Prisma: `CotProduct`, `CotInstallService`, `CotCounter`, `CotQuoteSequence`, `CotKit`, `CotTemplate`, `CotQuote`, `CotQuoteShare`, `CotEditGrant` (sin relaciones a `User`/`Company`, todo por `companyId`/`ownerId` numéricos).
- **Las tablas se crean al arrancar** (`cotizador.schema.ts` → `COTIZADOR_DDL`, DDL idempotente, enganchado en `VentasSchemaService`), como el resto de Ventas, porque el deploy no corre migraciones. `prisma/migrations/20261016_cotizador/migration.sql` existe solo como referencia; no usar `migrate deploy`.
- Líneas, cliente, márgenes y condiciones de la cotización van en columnas `Json` con **tamaño máximo comprobado** (`assertJsonSize`) y lista blanca de campos (`sanitizeLines/Client/Margins/KitComponents`).

## 9. Importar desde el cotizador original

`backend/prisma/import-cotizador.js`: `node prisma/import-cotizador.js --dump <volcado.sql> --company gemeseg [--dry-run] [--replace]`. Lee un volcado SQL del Supabase **exportado** (nunca se conecta a producción de Supabase), mapea usuarios por correo (los que no existan en MejoraGemeseg pasan a un administrador y se avisa), convierte las líneas a código con `snap`, copia el teléfono de cada asesor a `User.phone` si no tiene uno (y no es el número por defecto) y deja el contador de cada tipo en el máximo importado. `--replace` borra antes los datos del Cotizador de esa empresa (solo tablas `Cot*`; **solo para bases de prueba**: sin él, el importador se niega a correr si la empresa ya tiene datos). Comprobado contra 72 cotizaciones con datos de forma real: totales **idénticos** a los del original. Ejecutarlo contra la base real solo con autorización explícita de Leidy y después de un respaldo.

## 10. Pruebas

- Backend (jest): `cotizador.util.spec.ts`, `cotizador-catalogo.service.spec.ts`, `cotizador-cotizaciones.service.spec.ts` (49 pruebas; servicios instanciados con `PrismaService` simulado).
- Frontend: **primer** runner del frontend, **vitest** (`npm test` en `frontend/`, `vitest.config.ts`): `pricing.test.ts` y `quoteState.test.ts` (fórmulas y reglas del carrito).
- De punta a punta se probó con scripts de Playwright y una API real sobre una base local (no están en el repo): 39 pruebas de API y 27 de pantalla, incluida la vista de solo lectura de una compartida, el modo edición total, borrar un producto sin afectar cotizaciones y el aviso de precio cambiado.

## 11. Cliente desde el Directorio y PDF con el formato del original (2026-10-28)

Pedido de Leidy tras comparar el PDF del original (`COT-…`) con el de la app: el cotizador de Ventas debía **traer los clientes del Directorio** y su hoja impresa debía quedar «casi exactamente igual» a la del original.

- **Cliente con desplegable** (`ClienteDirectorioInput`): al escribir en «Cliente / Razón social» salen hasta 8 coincidencias del **Directorio de Ventas** (`SalesClient`, por nombre o RUC, sin importar tildes; primero las que empiezan por lo escrito). Se pide la lista una sola vez, al enfocar el campo, con `GET /ventas/clientes`; si falla o la persona no tiene acceso, el campo sigue siendo texto libre. Un cliente que no está en el Directorio se escribe a mano como siempre (no se crea nada en el Directorio desde aquí).
- **Elegir a alguien rellena el cliente de la cotización** (`traerDelDirectorio` en `CotizadorPage`): nombre, RUC, teléfono, dirección y email del cliente; «Contacto» sale de la **primera persona** de sus contactos (`getSalesContacts`) con su cargo, y si el cliente no tiene teléfono o email propio se usa el de esa persona. Lo traído queda en la cotización como cualquier dato escrito: se puede corregir, y no hay vínculo vivo con el Directorio (si cambia allí, la cotización ya guardada no cambia).
- **Vincular la cotización a una oportunidad sigue sin hacerse** (punto 1): solo se copian datos.
- **Hoja impresa** (`QuotePrint.tsx` + CSS `.cot-print-*`): logo de GEMESEG en sus colores (`/resources/logo-gemeseg-bgwhite.png`, el mismo del original) sobre blanco; si la empresa no es GEMESEG se usa su logo claro sobre una caja oscura (`.en-caja`). Teléfono con icono; N.º, fecha (ISO `AAAA-MM-DD`) y validez en columna; datos del cliente en dos columnas con el espaciado del original; tabla con **Und** (unidad real del producto, en negrita), **Costo unit.**, **Cant**, **Costo total** e **Inst** (casilla marcada si la línea lleva instalación); cuadro de totales oscuro (degradado `#0f172a → #1e1b4b`) con el descuento y la línea de TOTAL en rojo `#ee3b1b`; firmas, condiciones y texto legal en cursiva; letra Montserrat (enlace en `frontend/index.html`). Diferencias que se dejaron a propósito respecto al original: no sale la línea de email del emisor.
- **Unidad (Und):** `PriceItem.unit` viene del producto (`toPriceItem`); un servicio sin unidad cargada se ve «servicio» en la pantalla y «—» en el PDF. Antes la columna salía vacía en los dos.
- **Nombre del PDF:** el navegador lo toma de `document.title` al imprimir: ahora es «N.º de cotización - Cliente» (o solo el número si el cliente está vacío); antes, con el cliente vacío, quedaba «GEMESEG App».
- Verificado en local (2026-10-28): desplegable, relleno de datos y la hoja impresa comparada con el PDF del original; **no** se probó el PDF real con `Ctrl+P` ni con productos reales del catálogo.

## Endpoints (`/ventas/cotizador`, `VENTAS` ver/escribir; rutas fijas antes de las de `:id`)

- Historial del catálogo (punto 12): `GET historial` (`?q=&tipo=&desde=&hasta=&userId=&pagina=&limite=`), `GET historial/personas`.
- Límites de precio (punto 13): `GET limites` (quien ve el Cotizador), `PUT limites` (solo ADMIN/MANAGER).
- Catálogo: `GET catalogo` (`?incluirInactivos=true`), `GET siguiente-codigo?tipo=`, `POST catalogo/lote`, `POST/PATCH/DELETE productos(/:id)`, `POST/PATCH/DELETE instalaciones(/:id)`.
- Kits: `GET/POST kits`, `PATCH/DELETE kits/:id`. Plantillas: `GET/POST plantillas`, `PATCH/DELETE plantillas/:id`.
- Cotizaciones: `GET cotizaciones`, `GET cotizaciones/siguiente-numero`, `GET cotizaciones/verificar-numero`, `POST cotizaciones`, `GET/PATCH/DELETE cotizaciones/:id`, `PATCH cotizaciones/:id/estado`, `POST cotizaciones/:id/copiar`.
- Compartir: `GET cotizaciones/:id/compartidos`, `POST cotizaciones/:id/compartir`, `DELETE cotizaciones/:id/compartir/:userId`, `GET usuarios`, `GET/POST accesos-edicion`, `DELETE accesos-edicion/:userId`.
- Custodia móvil (sección «Custodia móvil», 2026-11-16): `GET custodia/tarifas`, `PUT custodia/tarifas` (solo ADMIN/MANAGER), `POST custodia/calcular`; la ruta del mapa es `GET /ventas/ubicaciones/ruta`.
- Enlace para el cliente (punto 14): `GET cotizaciones/:id/enlace` (ver), `POST cotizaciones/:id/enlace` y `DELETE cotizaciones/:id/enlace` (escribir; dueño o edición total). Públicas, sin sesión: `GET /public/cotizaciones/:token`, `POST /public/cotizaciones/:token/visitas`, `POST /public/cotizaciones/:token/visitas/:visita/latido`, `POST /public/cotizaciones/:token/respuesta`.

## Catálogo, totales e importación del original (2026-10-30)

- **Catálogo (modal):** columnas por defecto Tipo, Nombre, Subcategoría, Costo, Unidad y Proveedor (Márgenes sigue en «Columnas»; cada usuario conserva la suya). El modal ocupa la pantalla con la tabla dentro (`cot-cat-*`), con columna fija elegible. `tablasVivas.ts` tiene una excepción: un wrapper con `data-viva-en-modal` sí se activa dentro de un modal y su alto lo manda el CSS, no el script.
- **Totales en pantalla:** el descuento y la línea sobre el TOTAL usan el naranja de la marca (`--naranja`) sobre el degradado azul de la marca, igual que ya hacía la hoja impresa.
- **Importar catálogo del Cotizador original (hecho 2026-10-30 en producción):** el original manda en las colisiones de código (dos sistemas asignan «último + 1» y chocaron el 28/10). Lo de Mejora que ocupaba el código pasa al siguiente libre y **hay que reescribir las referencias guardadas** en `CotQuote.items`, `CotTemplate.items` y `CotKit.components` (las líneas apuntan al producto por código; las de instalación, por `id`). Se hace en una sola transacción, con respaldo de Cloud SQL antes y comprobando que ninguna línea queda sin producto. Esa vez: EQ-0422→EQ-0430, EQ-0423→EQ-0431, SV-0036→SV-0039, INST-058→INST-059, más 9 productos nuevos, 4 cambios de costo del original y 71 productos sin nombre ni referencias borrados (quedan 6 sin nombre a decidir). No hay endpoint ni pantalla para esto: fue un script puntual.

## Historial de cotizaciones: tabla (2026-11-06)

La tabla del historial tenía las celdas de cliente y vendedor apiladas en una sola columna: usaban `className="truncate"` en el `<td>`, y esa clase es `display: block`, así que sacaba la celda de la tabla (la misma causa que ya se había arreglado en el catálogo). El recorte va en un `<span className="truncate" title=...>` dentro del `<td>`. El Total se alinea a la derecha (`cot-num`), las cifras de arriba dicen «borradores» (no «borradors») y los anchos de columna suman menos que el ancho útil de la ventana `lg` (920 px) para que no salga barra horizontal; el estilo compacto es el del catálogo (`.cot-hist-wrap` en `cotizador.css`; ese archivo está en Latin-1, editarlo en binario).

## 12. Historial de cambios del catálogo (2026-11-12, local, sin desplegar)

**Por qué:** cualquier persona con permiso de escribir en Ventas puede cambiar el costo de un producto del catálogo, que es global para la empresa, y no quedaba rastro de quién lo hizo ni qué valor tenía antes (solo `updatedAt`). Pedido del equipo comercial: limitar la edición de precios, aprobar cambios, alertas de precio bajo y un link único para el cliente. **Orden decidido con Leidy:** primero el historial (sin él no se puede aprobar ni alertar con sentido), después alertas y descuento con límite, después solicitudes de cambio con aprobación, y el link único aparte.

**Decisiones de Leidy (esta entrega):**
- **Solo historial**: nadie pierde permisos todavía (los vendedores siguen editando el catálogo).
- **Un historial general, no por producto**: los cambios de precio son raros, lo útil es ver qué cambió en el catálogo y quién lo hizo. Rechazó la vista «Historial» en el menú «⋯» de cada fila. El producto es solo un filtro (buscar por código o nombre).
- **Qué se registra**: crear, eliminar y editar (costos, proveedor, nombre, categoría, unidad, notas). **«Lleva ganancia» y «Lleva instalación» NO se registran** (Leidy, 2026-11-12: «un poquito de más»). Kits y plantillas no entran.
- En pantalla se dice **«Eliminó»**, igual que el botón «Eliminar»; por dentro sigue siendo desactivar (punto 3). No hay opción «desactivar» nueva.

**Cómo funciona:**
- Tabla nueva `CotCambio` (arranque, `cotizador.schema.ts`; un renglón por campo cambiado en `EDITO`, uno solo en `CREO`/`ELIMINO`; `userNombre` se copia para que el nombre sobreviva si el usuario se borra; `valorAntes`/`valorDespues` en texto normalizado). Migración solo de referencia: `prisma/migrations/20261112_cotizador_historial/`.
- Lo escribe el **servidor** en la misma transacción del cambio (`anotar` en `cotizador-catalogo.service.ts`): si el guardado falla, el historial tampoco queda. Cubre crear, editar, eliminar y el lote (`POST catalogo/lote`). Si se guarda sin cambiar nada, o se elimina algo ya desactivado, no se anota nada. La comparación es la función pura `diffCatalogo` (`cotizador.util.ts`; `85.0000` = `85`, texto vacío = `null`).
- Campos que cuentan como «precio» (`CAMPOS_PRECIO`): costo unitario/mensual/anual. Sirven al parámetro `tipo=precio|datos` de la API y a resaltar esas filas en negrita.
- Lectura: `GET /ventas/cotizador/historial?q=&tipo=precio|datos|creo|elimino&desde=&hasta=&userId=&pagina=&limite=` y `GET historial/personas`, sección `VENTAS` ver (lo ve quien ve el Cotizador). Las fechas son días de Ecuador (UTC-5), también en el filtro.
- Pantalla: Catálogo → pestaña «Historial» (a la derecha de Kits) → ventana `modal-ventas-lg` (`HistorialCatalogoModal.tsx`), columnas Fecha, Persona, Producto, Qué cambió, Antes, Después. **Es una tabla como las demás (decisión de Leidy, 2026-11-12):** los filtros viven en la cabecera de cada columna (`useColumnFilters` + `ColumnFilter`, con ordenar), arriba solo el buscador por código/nombre, «Columnas» (con fija elegible), limpiar y exportar, columnas redimensionables. Una primera versión con selectores de Tipo de cambio / Persona / Fecha sueltos por fuera se rechazó. Como los filtros son de columna, la ventana trae el historial completo (pedidos de 200, hasta 5.000 cambios) y filtra en el navegador; los parámetros de `GET historial` siguen existiendo pero esta pantalla no los usa. Las celdas hacen salto de línea (sin barra horizontal a 1530 px). Si la carga falla se muestra un mensaje corto fijo, no el texto del servidor.

**No incluido / pendiente:** no se reconstruye el pasado (empieza al desplegar); sin bloqueo de edición, aprobaciones ni alertas; no registra cambios hechos por scripts/importaciones directas a la base (como el del 2026-10-30). Probado en local por pantalla (crear, editar costo, eliminar, filtros) y por API; las pruebas jest nuevas están escritas pero **sin ejecutar** hasta el ok de Leidy.

## 13. Avisos de precio bajo y límites (2026-11-12, local, sin desplegar)

**Pedido del equipo:** que un vendedor no pueda dañar el catálogo ni vender por debajo de lo razonable. Propuestas originales: edición solo a nivel de cotización, solicitudes de cambio con aprobación y alertas de precio bajo (sobre todo servicios). **Orden decidido con Leidy:** historial (punto 12) → **avisos** (este punto) → solicitudes con aprobación → link único para el cliente.

**Decisiones de Leidy (esta entrega):**
- **Solo aviso, no bloqueo**: hoy no existe quien apruebe, así que nada impide guardar ni enviar; el aviso lo ve quien cotiza.
- Se vigilan **las tres cosas**: descuento máximo, ganancia mínima y precio mínimo por producto.
- **Límites por empresa, definidos por administradores y gerentes**, con **un límite de descuento distinto para servicios**. Los vendedores los ven (pantalla de solo lectura) pero no los cambian.
- El **historial** del punto 12 lo ve todo el que ve el Cotizador.

**Cómo funciona (reglas en `frontend/src/utils/cotizador/alertas.ts`, función pura `calcularAlertas`, con `alertas.test.ts`):**
- **Descuento máximo:** % del descuento sobre la base (también si el descuento es de valor fijo). Un límite para equipos/materiales/instalaciones y otro para servicios; si la cotización mezcla, manda el más bajo de los que aplican. Una cotización solo de servicios usa solo el límite de servicios.
- **Ganancia mínima:** % de ganancia sobre el costo, **solo de lo que lleva ganancia** (equipos, materiales, instalaciones); un servicio se vende a su costo y no suma ni diluye. Cuenta el descuento (repartido en proporción) y los márgenes propios de cada línea.
- **Precio mínimo por producto o servicio:** precio de venta unitario **antes de IVA**, con el descuento repartido en proporción; avisa con la lista de productos. Vacío o 0 = no vigila.
- Vacío en cualquier límite = sin límite. Sin límites configurados no hay avisos. El aviso sale junto a los botones de guardar («Precio bajo: revisa antes de enviar … Es solo un aviso»), no se imprime en el PDF.

**Datos:**
- Tabla nueva `CotLimites` (una fila por empresa; `maxDescuentoPct`, `maxDescuentoServiciosPct`, `minGananciaPct`; arranque, `cotizador.schema.ts`).
- **Columna nueva en tabla existente** `CotProduct.minPrice` (decimal, nula): se crea al arrancar en `src/prisma/cot-product-minprice.schema.ts` (misma regla que `User.phone`; protegida con `to_regclass` porque en una base nueva la tabla la crea `VentasSchemaService` después, y ahí la columna ya está en su `CREATE TABLE`). Migración solo de referencia: `prisma/migrations/20261112_cotizador_limites/`.
- **Quién cambia qué:** `PUT /ventas/cotizador/limites` exige rol ADMIN o MANAGER (y `VENTAS` escribir); `GET limites` lo ve quien ve el Cotizador. El **precio mínimo** de un producto solo lo fijan ADMIN o MANAGER: el servidor responde 403 si otro rol lo cambia (guardar un producto que ya tiene mínimo sin tocarlo sí se permite), y el formulario lo muestra de solo lectura. Los cambios del precio mínimo quedan en el historial del punto 12 («Precio mínimo»).

**Pantallas:** botón «Límites de precio» en el encabezado del Cotizador (lo abren todos; editan solo admin/gerente; ventana `modal-ventas-sm`), campo «Precio mínimo de venta» en el formulario de producto del Catálogo y columna opcional «Precio mínimo» en su tabla.

**No incluido / pendiente:** no hay aprobación ni bloqueo; no se anotan los cambios de los límites de la empresa en el historial; los servicios de instalación no tienen precio mínimo (se venden por margen); el aviso no se guarda con la cotización (se calcula al abrirla con los límites de hoy). Probado en local por pantalla (aviso con los tres tipos, ventana de límites, formulario) y por API (403 a vendedor); pruebas jest y vitest escritas y pasando.

## Custodia móvil dentro del Cotizador (2026-11-16)

Pedido de Leidy: pasar al Cotizador la hoja de Google «GEMESEG | Cotizador de Custodia Móvil» que el equipo usaba para cotizar (la hoja **no se tocó**: solo se leyó). En «Detalle de la cotización», el botón **«+ Custodia móvil»** abre una calculadora y agrega UNA línea de servicio a la cotización (`isCustodia`), que se guarda, se comparte, se copia y se imprime como cualquier otra.

**Decisiones de Leidy (2026-11-16):**
- **Sin parámetro de IVA (corregido por Leidy el mismo 2026-11-16, después del primer despliegue).** Primero se hizo configurable (15 % por defecto, con filas de IVA por tasa); Leidy lo quitó: la custodia es **una línea más de la cotización** y el IVA se calcula una sola vez al final sobre el subtotal con descuento, como con los productos (la hoja ni siquiera calculaba IVA). No hay `ivaPct` en tarifas, entrada ni resultado, ni desglose de IVA por tasa en `computeQuote`.
- **Todas las tarifas configurables.** Los valores iniciales son los de la hoja (los que el equipo usa hoy; el propio archivo los llama «de demostración»): Ventas → Configuración → «Tarifas de custodia». Región configurable (lista de regiones con su tarifa de agente, el vendedor elige una en cada cotización: no se decide por origen/destino).
- **Mínimo de custodios** (1 por defecto, configurable): los choferes no cuentan. La hoja de ejemplo traía 0 custodios y 2 choferes.
- **Mapa para la ruta:** se busca origen y destino (Nominatim, el mismo buscador de «Ubicación» de las oportunidades), se dibuja la ruta por carretera y llena los km de ida; los km siempre se pueden corregir a mano y el regreso/desvíos también.
- **Costos que la hoja solo nombraba en su guía** (recargo nocturno, relevo/pernocta, seguro de carga, ruta alternativa, permisos o equipo especializado, financiamiento) son **extras opcionales** configurables: «Fijo» (valor × cantidad) o «Porcentaje» (del costo normal). Nacen con valor 0 (no inventamos tarifas): se llenan en Configuración y el vendedor los marca solo si aplican.
- **Personal fijo por viaje y región, como en la hoja:** no sube con los km ni con las horas (solo la espera del vehículo cambia el costo por horas). A Leidy no le quedó clara la pregunta, así que se conservó la regla de la hoja; es fácil de cambiar si Comercial quiere cobrar por km/hora.
- **Margen definido en la propia custodia (corregido 2026-11-16):** ya no está en las tarifas; cada cálculo lo trae en «Margen e imprevistos» de la calculadora, **30 % por defecto** (`MARGEN_CUSTODIA_POR_DEFECTO`), como el margen de cualquier producto de la cotización. La fórmula sigue siendo la de la hoja, **sobre el PRECIO**: precio = costo total ÷ (1 − margen); 30 % = de cada $100, $30 son utilidad (precio = 1,43× el costo). Es distinto al margen del resto del Cotizador (se suma sobre el costo); la pantalla lo rotula así. Pendiente de confirmar con Comercial si prefieren el mismo criterio que los productos. «Recalcular» permite cambiarlo.

**Cómo funciona:**
- El cálculo vive en el servidor (`backend/src/modules/ventas/cotizador-custodia.util.ts`, función pura `calcularCustodia`) para que la pantalla y, más adelante, el bot de WhatsApp usen la misma fórmula. Reproduce la hoja **al centavo** (ejemplo: costo directo 325,89, imprevistos 16,29, costo total 342,19, precio 488,84, utilidad 146,65): se suma sin redondear cada concepto y solo se redondea lo que se muestra. Un cálculo con datos que faltan devuelve `ok:false` y la lista de motivos (no lanza).
- Endpoints (`/ventas/cotizador/custodia`, sección `VENTAS`): `GET tarifas` (ver), `PUT tarifas` (solo ADMIN/MANAGER: son costos internos), `POST calcular` (ver). Ruta del mapa: `GET /ventas/ubicaciones/ruta?olat&olng&dlat&dlng` → `{ km, minutos, trazo }` con el servicio público de OSRM (`OSRM_URL` lo cambia), espaciado a 1 consulta por segundo y con caché; si no responde, se escriben los km a mano.
- Las tarifas se guardan por empresa en `SalesSetting` (clave `cotizador-custodia`): **sin tablas ni columnas nuevas**. Una empresa que nunca las guardó usa las de la hoja.
- La línea guarda sus datos y el **resultado congelado** (como `snap` de los productos): si las tarifas cambian, la cotización no se mueve; «Recalcular» abre la calculadora con esa línea y la reemplaza. El servidor valida y acota los números de la línea (`limpiarLineaCustodia`).
- Totales (`computeQuote`): la custodia suma al subtotal como un producto más; el descuento se resta antes y el IVA 15 % se calcula una sola vez al final (el total de siempre). El PDF agrega la sección «SERVICIO DE CUSTODIA MÓVIL» solo con descripción y precio: **nunca** costos, utilidad ni margen (esos van en la fila interna de la pantalla).

**Pendiente / ojo:** el texto legal del PDF sigue diciendo «IVA del 15 %» (no se cambió); el servicio de rutas es público y de uso moderado (si se vuelve cuello de botella, cambiar `OSRM_URL` o contratar uno); sin pruebas de pantalla automáticas.

## 14. Enviar al cliente con un enlace (2026-11-17, local, sin commit ni despliegue)

**Pedido de Leidy:** «modernizarnos»: mandarle al cliente un enlace con su cotización en vez del PDF suelto, saber si la vio y cuánto tiempo, ideas para lucir mejor, y **seguridad ante todo: el cliente JAMÁS ve porcentajes de ganancia** (igual que el PDF). La idea venía solo como «opcional: enviar la cotización en PDF» en el plan del bot de WhatsApp; el diseño se acordó en esta sesión.

**Decisiones de Leidy:** el enlace se comparte con **«Copiar»** y **«Enviar por WhatsApp»** (abre WhatsApp con el número del cliente y el mensaje escrito; no se envía nada desde Mejora, ni correo); **sí** se registra la apertura; el enlace **no vence** (solo se apaga a mano con «Desactivar enlace»); aprobó las ideas de presentación (página con la marca, asesor con WhatsApp/llamar, «Válida hasta», «Me interesa» / «Tengo dudas», «Actualizada el…»).

**Seguridad (lo más importante):**
- Los precios finales se calculan **en el servidor**: `cotizador-precios.util.ts` es la copia de `computeQuote` (`frontend/src/utils/cotizador/pricing.ts`) y devuelve **solo** precio unitario de venta, cantidad y total por línea, más los totales. La página pública recibe una **lista blanca** (`armarPagina` en `cotizador-enlaces.util.ts`): nada de costo, ganancia, margen, proveedor, `snap`, costos de la custodia ni ids internos. El teléfono y el correo **del propio cliente** sí van desde el 2026-11-17 (tarde), porque el PDF de la app los imprime y Leidy pidió que el PDF del enlace sea el mismo. **Si cambia una regla de `pricing.ts`, hay que cambiarla también en `cotizador-precios.util.ts`.** Verificado el 2026-11-17 comparando los dos cálculos sobre todas las cotizaciones de la BD local y casos armados con kits, instalaciones, servicios, márgenes propios, producto inexistente y precio congelado: iguales al centavo.
- Código del enlace al azar de 192 bits (`randomBytes(24)`, 32 caracteres), nunca el número de la cotización; un código mal formado, inventado o apagado da el mismo 404 («ya no está disponible»), sin revelar si existió. Límite por IP (lectura 120 / 10 min, avisos de tiempo 600 / 10 min, respuestas 10 / hora) y máximo 10 respuestas por enlace al día. La IP no se guarda. Cabeceras `no-store` y `noindex`; la página pone `robots noindex` y `referrer no-referrer`.
- Ruta pública **sin** `AuthGuard` (`/api/public/cotizaciones/...`), como las encuestas y las quejas.

**Seguimiento:**
- Cada apertura es una fila de `CotEnlaceVisita` con el tipo de equipo (celular/tablet/computadora, del User-Agent), un identificador al azar del navegador (para contar personas distintas; nada personal) y el tiempo a la vista: la página avisa cada 15 s **solo si está visible**; el servidor suma lo transcurrido con tope de 30 s por aviso y 4 h por visita, y al volver de otra pestaña (`reanudar`) no suma el rato oculto. **El tiempo es aproximado** y así se rotula.
- **«Descargar PDF» sale IDÉNTICO al PDF de la app (pedido de Leidy, 2026-11-17 tarde).** La hoja impresa vive en UNA pieza, `components/ventas/cotizador/HojaCotizacion.tsx` (datos neutros, solo precios de venta): `QuotePrint.tsx` (el PDF del Cotizador) la arma con el cálculo de la pantalla y `CotizacionPublicaPage` con lo que manda el servidor; al imprimir la página pública se ocultan la barra y el contenido web y sale solo esa hoja (estilos `.cot-print-*` de `cotizador.css`, márgenes A4 de `styles.css`). Verificado: el HTML de las dos hojas es igual carácter por carácter en la cotización de prueba. Para que cuadre, el servidor manda además la cantidad por kit (`cantidadEnKit`), la categoría/subcategoría de cada instalación y el teléfono y correo del cliente. Un cambio de diseño del PDF se hace en `HojaCotizacion.tsx` y vale para los dos. La descarga queda marcada en la visita.
- **Nombres (pedido de Leidy, 2026-11-17):** «Compartir» (dar a un compañero una cotización en solo lectura) se confundía con «Enviar al cliente»; ahora se llama **«Compartir con mi equipo»** (botón, acción del Historial y título de su ventana, icono de personas). «Compartir edición» del encabezado no cambió.
- **Aperturas del propio equipo no cuentan:** si el navegador tiene sesión de la misma empresa, la página manda el token y la visita queda `interna` (la página lo avisa y las respuestas de prueba no se guardan).
- La primera apertura del cliente pasa la cotización a «Vista» (si estaba en borrador o enviada) y deja una **notificación en la app** al dueño; cada «Me interesa»/«Tengo dudas» (con mensaje opcional, 500 caracteres) también. El aviso lleva a `/ventas/cotizador?cotizacion=<id>&seguimiento=1`, que carga la cotización y abre su seguimiento. Crear el enlace pasa «Borrador» a «Enviada».
- Cambiar el estado ya no toca `updatedAt` (también `cambiarEstado` del Historial): la página dice «Actualizada el…» solo cuando cambió la cotización, no su estado.

**Pantallas:** botón «Enviar al cliente» junto a «Guardar cotización» (bloqueado hasta guardar); ventana `EnviarClienteModal` (`modal-ventas-md`) con el enlace, «Copiar», «Enviar por WhatsApp», «Ver como el cliente», el aviso «Tienes cambios sin guardar» (el cliente ve la última versión guardada), «Lo que hizo el cliente» (veces, tiempo, PDF, primera/última vez, tabla de visitas, respuestas) y «Desactivar enlace» (diálogo propio). Crear/desactivar: dueño o edición total; ver el seguimiento: quien ve la cotización. Página pública `CotizacionPublicaPage` (`/cotizacion/:token`, fuera de `ProtectedLayout`; sin chat del agente aunque haya sesión), con los colores y el logo de la empresa, lista en celular (la tabla pasa a bloques) e impresión.

**Tablas nuevas (al arrancar, `cotizador.schema.ts`, sin modelo Prisma; se consultan con SQL):** `CotEnlace` (un activo por cotización; desactivar lo conserva), `CotEnlaceVisita`, `CotEnlaceRespuesta`. Sin columnas nuevas en tablas existentes.

**Verificado en local por pantalla (2026-11-17, servidor propio en 3100 + Vite en 5180):** crear enlace, mensaje de WhatsApp, página como cliente sin sesión (escritorio y 375 px sin desplazamiento lateral), respuesta «Me interesa», notificaciones, apertura desde la notificación, aviso de cambios sin guardar, visita interna no contada, desactivar y 404. **No probado:** el diálogo de impresión real («Descargar PDF»; sí se comparó el HTML de la hoja con el de la app), WhatsApp abriéndose en un celular de verdad, y el enlace con el dominio de producción. Sin pruebas jest/vitest escritas para esto todavía.

**Pendiente / ideas:** los datos de prueba (`PRUEBA enlace (borrar)`, COT-20261117-0005, y sus visitas) quedan en la BD local; el envío por correo desde Mejora no se hizo (decisión: solo copiar y WhatsApp).

## 15. Cotización ↔ oportunidad (2026-11-17, local, sin commit ni despliegue)

**Pedido del asesor comercial y decisiones de Leidy:** al cotizar se elige la oportunidad; **una oportunidad puede tener varias cotizaciones** (versiones o alternativas de la misma negociación, no son varias oportunidades). Debe funcionar **en los dos sentidos**: botón «Cotizar» en la oportunidad (abre el Cotizador prellenado y ya unido) **y** selector «Oportunidad» dentro del Cotizador. Elegirla es **obligatorio para enviar al cliente o descargar el PDF**, no para guardar un borrador. El monto de la oportunidad sale de la cotización que **el vendedor marca como principal** (descartado: «la aceptada o la última» y «escribirlo a mano»). La primera propuesta (solo desde el Cotizador) no la convenció; la de los dos sentidos sí.

**Cómo quedó:**
- Tabla nueva `CotQuoteOportunidad` (al arrancar, `cotizador.schema.ts`, sin modelo Prisma): `quoteId` (PK: una oportunidad por cotización), `opportunityId`, `principal` (índice único parcial: una principal por oportunidad), quién y cuándo. Borrar la cotización o la oportunidad borra la unión. Sin columnas nuevas en tablas existentes.
- `cotizador-oportunidad.service.ts` / `.controller.ts`: buscar oportunidades abiertas (`GET /ventas/cotizador/oportunidades?q=`, por cliente, RUC o título), una (`GET .../oportunidades/:id`), unir/quitar (`GET|PUT /ventas/cotizador/cotizaciones/:id/oportunidad`, solo quien edita la cotización), cotizaciones de una oportunidad con su total (`GET /ventas/oportunidades/:id/cotizaciones`) y marcar principal (`POST /ventas/oportunidades/:id/cotizaciones/:quoteId/principal`, permiso VENTAS escritura).
- El total (con IVA) se calcula en el servidor con `cotizador-precios.util.ts` (el mismo del enlace). La principal copia su total a `SalesOpportunity.quotedAmount` al marcarla y **cada vez que esa cotización se guarda** (`actualizar` → `sincronizarMonto`; si falla, se registra y no se cae el guardado); `quotedAt` solo se pone si estaba vacío. Al unir la primera cotización a una oportunidad **sin monto** queda principal sola (no pisa un monto escrito a mano). Quitar la unión no borra el monto.
- **Nunca se reemplaza el monto en silencio (pedido de Leidy, 2026-11-17 tarde: «si cotizo y guardo, ¿por qué no se actualiza el valor?»).** Al guardar, `GET|PUT …/oportunidad` devuelve además el total de la cotización, el monto actual de la oportunidad y la principal actual, y la pantalla decide: si **ya es la principal** (o quedó principal sola porque la oportunidad no tenía monto) → aviso «Monto de la oportunidad actualizado a $X»; si **se acaba de unir y no es la principal** → pregunta «Esta oportunidad tiene $A. ¿Usar el total de esta cotización ($B) como monto?» o, si hay otra principal, «La principal es COT-… ($A). ¿Hacer esta la principal?», con «Usar esta cotización» / «Dejar el monto como está»; si el monto ya es igual y no hay otra principal, se marca sola. Una cotización que ya estaba unida y no es principal no vuelve a preguntar (se cambia en Oportunidades → «Marcar principal»). Probado en pantalla los tres casos.
- «Enviar al cliente» exige la unión también en el servidor (`CotizadorEnlacesService.crear` → 400 «elige a qué oportunidad pertenece»).
- **Cotizador:** campo «Oportunidad» arriba de «Datos del cliente» (`OportunidadSelector.tsx`): busca entre las abiertas, empieza por el RUC/nombre del cliente escrito, y «Crear oportunidad para «cliente»» la crea ahí mismo (busca la empresa en el Directorio por RUC o nombre exacto; si no está, la agrega con «solo datos» y los datos escritos en la cotización). Elegirla pone los datos de ese cliente (avisa si reemplaza a otro). La unión se guarda junto con «Guardar cotización» (`PUT` después de crear/actualizar); el borrador local la recuerda. `?oportunidad=<id>` (lo usa «Cotizar») empieza una cotización nueva prellenada y unida; si hay una sin guardar en pantalla, pregunta antes. «Imprimir / Guardar PDF» y «Enviar al cliente» sin oportunidad marcan el campo y no siguen; «Enviar» con una oportunidad elegida pero aún no guardada pide guardar. Una copia (Historial → «Crear copia») conserva la oportunidad del original.
- **Oportunidades:** «⋯» → «Cotizar»; en «Editar» la sección «Cotizaciones» (`CotizacionesDeOportunidad.tsx`) lista número, fecha, estado, vendedor y total, con «Cotizar», «Marcar principal» y enlace para abrir la que el usuario puede ver; con principal, «Monto cotizado» queda bloqueado («Sale de la cotización principal») y no se envía al guardar.
- **Ojo:** el cuadro de cambio de etapa a «Cotizada» todavía pide y guarda un monto a mano; si hay principal, el siguiente guardado de esa cotización lo vuelve a poner. No se tocó para no cambiar ese flujo sin preguntar.

**Verificado en local por pantalla (3100/5180):** crear oportunidad desde el selector, guardar y unir (monto 148,48 = total en pantalla), «Cotizar» desde Oportunidades (cliente prellenado y aviso de borrador sin guardar), segunda cotización de la misma oportunidad (no principal), «Marcar principal» (el monto cambia a 21,33), «Enviar al cliente» con unión, y bloqueo de PDF/envío sin oportunidad. Datos de prueba en la BD local: oportunidad 145, cliente 188 «PRUEBA enlace (borrar)», cotizaciones 217 y 219.

## Rutas frontend

- `/ventas/cotizador` (`SectionRoute section="VENTAS"`), página `pages/ventas/CotizadorPage.tsx`, componentes en `components/ventas/cotizador/`, lógica pura en `utils/cotizador/` (`types`, `pricing`, `quoteState`, `format`, `draft`), servicio `services/cotizador.service.ts`. Acepta `?cotizacion=<id>&seguimiento=1` (punto 14) y `?oportunidad=<id>` (punto 15).
- `/cotizacion/:token` (pública, sin sesión): `pages/ventas/CotizacionPublicaPage.tsx` + `cotizacionPublica.css`, servicio `services/cotizacionPublica.service.ts` (punto 14).

## Modelos de Prisma relevantes

`CotProduct`, `CotInstallService`, `CotCounter`, `CotQuoteSequence`, `CotKit`, `CotTemplate`, `CotQuote`, `CotQuoteShare`, `CotEditGrant`, `CotCambio` (historial, punto 12), `CotLimites` (punto 13); `CotProduct` tiene además `minPrice`. Sin modelo Prisma (SQL, punto 14): `CotEnlace`, `CotEnlaceVisita`, `CotEnlaceRespuesta`; (punto 15) `CotQuoteOportunidad`.
