# Modulo: Cacao

## Descripcion
Back-office de comercio de cacao para cualquier empresa del sistema (linea blanca, ver mas abajo). La primera empresa que lo uso fue Mikacao S.A., pero **nada del modulo esta atado a ella**.
Flujo: Recepcion → Liquidacion → Aprobacion → Fijacion → Kardex → Embarque → CxP/CxC
(la CxP nace al aprobar la liquidacion, no al crearla; ver "Liquidaciones, aprobacion y pagos")

## Reglas de este modulo (las tres pautas fijas de la usuaria, 2026-10-23)
1. **Linea blanca:** ninguna empresa hereda datos, textos ni valores de otra; cada una configura lo suyo y empieza vacia.
2. **Submodulos:** Cacao es un menu desplegable en `Sidebar.tsx`, no una sola entrada.
3. **El Dashboard es el primer submodulo.**
(Quedan guardadas tambien en la memoria de la usuaria; aplican a todo modulo nuevo o reformado.)

## Submodulos (menu lateral, en este orden)
Dashboard · **Compra:** Proveedores, Recepciones, Lotes, Fijaciones de precio, Liquidaciones, Cuentas por pagar · **Venta:** Clientes, Embarques, Cuentas por cobrar · (bajo una linea) Configuracion (Calidades, Unidades de medida, Plazos, Motivos) y Guia del modulo.

Piezas internas: `Suppliers`, `Clients`, `Qualities` (por empresa), `Receptions` (auto-crea el lote), `Lots` (cada lote viaja por el sistema), `Settlements` (`LIQ-XXXX`), `PriceFixings`, `Shipments` (`EMB-XXXX`), `Payables` (nacen al aprobar la liquidacion), `Receivables` (nacen del embarque), `Payments`, `Kardex` (siempre en kg), `UnitConfig` y `CacaoSetting` (ajustes por empresa).

## Unidades
- Entrada y venta: TON, KG, SACO. El kardex siempre guarda kg.
- Toneladas (1000 kg) y kilos son universales. **El peso del saco lo define cada empresa** en Configuracion → Unidades de medida (`CacaoUnitConfig`, la unidad `isDefault`). No hay peso de fabrica: sin saco configurado el servidor responde «Falta configurar el peso del saco» y las pantallas muestran kg en vez de inventar una conversion (`useCacaoUnidades`).

## IDs Formato
- Settlements: `LIQ-XXXX` (derivado del id)
- Shipments: `EMB-XXXX`
- Lots: `LOTE-YYYY-00001`, **unico por empresa** (antes era unico en toda la base)

## Convenciones
- Decimal control: max 4 decimales, `round4()` helper
- Tolerance: `+ 0.001` kg para rounding
- Date format: DD/MM/YYYY via `formatDateEc()` (UTC methods)
- Form layout: `.page-card` max-width 900px
- Pantallas del menu: `<PageHeader eyebrow="Cacao">` (cabecera estandar, sin «← Volver»); detalle y formularios de segundo nivel conservan «Volver».
- Errores al usuario: `apiErrorMessage()` (`pages/cacao/utils.ts`); un 403 se muestra como «No tienes permiso para hacer esto…».

## Liquidaciones, aprobacion y pagos — 2026-10-23

Revision del dinero del modulo (liquidaciones, CxP, CxC). Leidy confirmo ese dia que el modulo **no tiene datos ni uso real**, por eso no hubo backfill ni migracion de liquidaciones existentes. Aprobado por ella en local el mismo dia (commit `02dd776` en `feature/cacao-liquidaciones-aprobacion`).

### Decisiones
- **Aprobacion (pedido de Leidy: «alguien con rol de gerente»).** Una liquidacion nace `PENDING` y **no** crea CxP. `POST /cacao/settlements/:id/approve` (ADMIN o MANAGER, nunca quien la creo: `createdBy` ≠ quien aprueba) la pasa a `APPROVED` y recien ahi crea la CxP (vence a `dueDays` dias desde la aprobacion). `reject` (solo `PENDING`) y `cancel` (solo `APPROVED` sin pagos vigentes) piden motivo obligatorio en texto libre (`decisionReason`; no usa el catalogo de motivos de Ventas, `MotivoCierreModal` es de Ventas, ver `RECOMENDACIONES_UX_UI.md` §22). Una empresa con un solo administrador y sin gerente no puede aprobar lo que ella misma crea: es intencional.
- **Estados.** Liquidacion: `PENDING → APPROVED → PAID`, mas `REJECTED` y `CANCELLED`. CxP: `PENDING/PARTIAL/PAID/CANCELLED`. Antes `PAID` solo se mostraba en pantalla pero el servidor nunca lo asignaba; ahora lo asigna al saldar la CxP y vuelve a `APPROVED` si se anula un pago.
- **Los totales los calcula el servidor.** La pantalla ya no manda `totalAmount`/`totalNetWeight`/etc. (siguen aceptados y se ignoran por compatibilidad); manda por lote `humidityPct`, `impurityPct` y `qualityPunishment`. Formula en `calcularLoteLiquidacion` (`settlements.service.ts`): neto = cantidad − humedad% − impurezas%; costo efectivo = max(0, costo promedio del lote − castigo); monto por lote redondeado a 2 decimales; `finalPrice` = monto / neto. El costo por kg sale del lote en la BD, no de lo que mande el navegador.
- **Tope por lote = lo recibido del proveedor, no `CacaoLot.netWeight`.** Cada recepcion crea su propio lote y los embarques **bajan** `netWeight` (es existencias), asi que no sirve para saber cuanto se le debe al proveedor. Pendiente de liquidar = suma de `CacaoReception.netWeight` de ese proveedor en el lote − suma de `CacaoSettlementLot.quantity` de liquidaciones que no estan `REJECTED`/`CANCELLED`. Rechazar o anular libera el peso. Se bloquean los lotes con `SELECT … FOR UPDATE` dentro de la transaccion para que dos liquidaciones simultaneas no tomen el mismo peso. `GET /cacao/settlements/available-lots?supplierId=` devuelve eso ya calculado y lo usa el formulario.
- **Una transaccion.** Crear liquidacion (cabecera + lotes) es atomico. Aprobar crea la CxP en la misma transaccion con `updateMany … where status = PENDING` (si dos personas aprueban a la vez, una recibe «ya fue decidida»).
- **Pagos y cobros.** `POST …/pay` y `…/receive` usan DTO (`common/payment.dto.ts`): monto > 0 con maximo 2 decimales, metodo `TRANSFER|CASH|CHECK`, referencia ≤ 120. **Antes el cuerpo era un tipo en linea y `ValidationPipe` no lo validaba** (montos negativos o texto pasaban). Se bloquea la fila de la cuenta (`FOR UPDATE`) y todo ocurre en una transaccion; ya no se puede superar el saldo con dos pagos simultaneos. Solo se paga una CxP cuya liquidacion esta `APPROVED`. El pago guarda `createdBy`; el embarque pasa a `COMPLETED` dentro de la misma transaccion al saldar la CxC.
- **Anular pagos/cobros.** `POST /cacao/payables/payments/:id/void` y `/cacao/receivables/payments/:id/void` (solo ADMIN, motivo obligatorio). No se borra: `voidedAt/voidedBy/voidReason`; la cuenta recupera el saldo. El historial se ve en el boton «Pagos»/«Cobros» de cada lista.
- **Seguridad entre empresas.** Crear una liquidacion comprueba que proveedor y lotes sean de la empresa del usuario (antes no se comprobaba).
- **Dashboard.** Las CxP `CANCELLED` no cuentan en «CxP Pendiente»; hay una tarjeta «Liquidaciones por aprobar» (cuantas y cuanto), que es lo que mira un gerente.
- **Lotes ya embarcados se pueden liquidar (2026-10-23).** La pantalla ofrecia solo lotes `OPEN`, y un lote vendido por completo (`CLOSED`) no se podia liquidar al proveedor aunque no se le hubiera pagado. Decision tomada por Claude al aplicar «procede con el resto de mejoras»: **se paga lo que el proveedor entrego, este el lote abierto o cerrado**. Si la usuaria prefiere lo contrario, es un solo filtro en `SettlementForm.tsx`.

### Columnas nuevas (todas opcionales; se crean al arrancar)
`CacaoSettlement`: `decidedBy`, `decidedAt`, `decisionReason`, `dueDays`. `CacaoSettlementLot`: `humidityPct`, `impurityPct`, `qualityPunishment`, `netKg`, `amount`. `CacaoPayment`: `createdBy`, `voidedAt`, `voidedBy`, `voidReason`. Se anaden en `src/prisma/cacao-liquidaciones.schema.ts` (via `PrismaService.asegurarColumnas`, con `ALTER TABLE IF EXISTS … ADD COLUMN IF NOT EXISTS`) porque el despliegue no corre migraciones; `prisma/migrations/20261023_cacao_liquidaciones/migration.sql` es solo registro.

## Linea blanca, submodulos y Dashboard primero — 2026-10-23

Pedido de Leidy: tratar Cacao como siempre pide (1. linea blanca, 2. con submodulos, 3. Dashboard como primer submodulo) y seguir con el resto de mejoras. Rama `feature/cacao-liquidaciones-aprobacion` (commit `7f418b2` el backend).

### Que se encontro atado a una empresa o compartido entre empresas
- **`CacaoQuality` no tenia `companyId`:** `GET /cacao/qualities` devolvia las calidades de todas las empresas y crear/editar/borrar no filtraba por empresa (cualquier administrador podia borrar la calidad de otra). El nombre era unico en toda la base. Ahora es **por empresa**: `@@unique([companyId, name])`, sin repetir nombre (sin importar mayusculas) y no se elimina una calidad que ya tiene lotes. `qualities.service.ts` + DTOs validados.
- **`CacaoLot.code` era unico en toda la base** y cada empresa numera desde `LOTE-AAAA-00001`: dos empresas chocaban en su primer lote del año. Ahora `@@unique([companyId, code])`.
- **Peso del saco escrito a mano (69 kg) en 7 lugares** y sin pantalla para configurarlo (el CRUD del backend ya existia). Ahora sale de la unidad por defecto de la empresa; sin ella se pide configurarla. La primera unidad que se crea queda como por defecto; no se puede quitar «por defecto» sin elegir otra ni eliminar la que lo es.
- **Plazos fijos** (CxC a 60 dias, CxP a 30): ahora `CacaoSetting` por empresa (`plazoPagoDias`, `plazoCobroDias`, valores iniciales 30 y 60 que la pantalla muestra y la empresa cambia). Cada liquidacion y cada embarque puede traer el suyo (`dueDays`).
- **Precio de venta sugerido = precio fijo de la calidad + 15 %** en `ShipmentForm`: era una regla de negocio de alguien en particular; se quito, la persona escribe su precio.
- **Calidad por defecto escondida:** `qualityId || 1` al registrar una recepcion. Ahora la calidad es obligatoria y debe ser de la empresa.
- **Textos:** la guia de la app decia «Mikacao S.A.» y «el sistema viene con 5 calidades predefinidas» (nunca fue cierto); ahora usa el nombre de la empresa del usuario y explica que el sistema no trae nada de fabrica.
- **Resuelto el 2026-10-27:** (b) `seed.js` ya usa el id real de la empresa Mikacao que crea (`mikacao.id`, no `2` a mano) y sus calidades llevan empresa; (c) las 9 listas de Cacao (proveedores, clientes, recepciones, lotes, fijaciones, liquidaciones, CxP, embarques, CxC) usan `useTablaCacao.tsx` (`pages/cacao/`): botón «Columnas» por persona (con columna fijada), orden por encabezado y ancho arrastrable. Kardex queda aparte: es un libro mayor por lote, no un listado. Cada columna lleva un ancho inicial (`ancho`, minimo calculado por el largo de su titulo para que no se corte con el icono de orden): con `table-layout: fixed`, una columna sin ancho queda aplastada por las que si lo tienen. Los anchos arrastrados se guardan por clave de columna, no por posicion, porque las columnas cambian con «Columnas». Probado en navegador el 2026-10-27 a 1530x740 con el gerente de prueba: orden asc/desc, ocultar columnas (se recuerda al recargar), arrastrar ancho y acciones de fila; algunas tablas anchas (recepciones, liquidaciones, fijaciones) llevan scroll horizontal con la primera columna fija.
- **Pendiente de linea blanca (anotado, sin cambiar):** (d) los catalogos de medidas `TON`/`KG`/`SACO` son fijos (suficiente para cacao, pero otro producto necesitaria otras unidades). Los puntos (a) motivos de rechazo/anulacion y (e) precio ICE fijo en 8150 se resolvieron el 2026-10-27, ver «Motivos, precio ICE y estado de liquidacion de las entregas».
- **Codigo LIQ (mejora H del analisis):** no hace falta cambiarlo. El codigo mostrado sale del `id` de la liquidacion, que no cambia nunca; solo la vista previa de «siguiente numero» es aproximada si hay creaciones simultaneas.
- **Probado a mano el 2026-10-27 como administrador de Mikacao:** Configuracion (las tres pestañas; la primera unidad creada queda «por defecto») y un embarque en sacos (5 sacos x 70 kg = 350 kg: costo, margen, CxC a 60 dias, salida de kardex y bajada del lote cuadraron). Lo creado para la prueba se borro. El selector de lotes del embarque ya no dice «= kg» a secas: solo aclara «recibido en sacos/toneladas» cuando el lote entro en otra unidad.

### Recepciones y embarques (misma clase de problema que las liquidaciones)
- **Recepcion:** lote + recepcion + kardex en una sola transaccion; reintenta (hasta 5) si dos recepciones piden el mismo codigo de lote (`P2002`). DTO validado (peso bruto > 0, tara ≥ 0, porcentajes 0–100, neto > 0). Limpia el cache del dashboard.
- **Embarque:** embarque + descuento de lotes + kardex + CxC en una sola transaccion con los lotes bloqueados. **El precio de venta es en $/kg, como dice la pantalla;** el servidor lo trataba como «por unidad» y la pantalla mandaba el costo multiplicado por el factor de la unidad, asi que con sacos o toneladas la salida del kardex y la CxC salian mal (con kilos coincidia). Ahora el servidor recalcula todo con el costo promedio de cada lote: `unitCost` guardado es $/kg, `saleAmount` = kg × precio, `margin` = (venta / costo − 1) × 100 con un decimal, CxC = venta total. La pantalla ya no manda costos ni margen (siguen aceptados y se ignoran).

### Pantallas
- **Menu (`Sidebar.tsx`):** «Cacao» es un desplegable; se abre solo si se entra directo a una URL de Cacao. Ya no esta en el listado plano. Las URLs no cambiaron; `/cacao/qualities` redirige a `/cacao/configuracion?tab=calidades` (hay enlaces guardados).
- **Dashboard (`/cacao`, primero del menu):** tarjetas clicables (inventario, exposicion sin fijar, liquidaciones por aprobar, CxP, CxC) y ultimos embarques. Se quitaron los «Accesos directos» y el bloque «Configuracion» porque repetian el menu. Para una empresa nueva muestra **«Primeros pasos»** (calidades, peso del saco, proveedores, primera recepcion) con lo que ya esta hecho marcado; desaparece al completarlos. El dashboard del servidor devuelve `setup` y `pendingApproval*`.
- **Configuracion (`/cacao/configuracion?tab=calidades|unidades|plazos`):** tres pestañas con `<PageTabs>`. **Solo el administrador de la empresa guarda**; el gerente ve la pantalla en solo lectura con un aviso y, si pulsa un boton, se abre `SoloAdminDialog` (regla §21 de `RECOMENDACIONES_UX_UI.md`: el boton se muestra y se explica, no se esconde).
- Cabecera estandar `<PageHeader eyebrow="Cacao">` en todas las pantallas del menu; el filtro de Lotes paso a una barra de filtros. Sin «← Volver» en las que se abren desde el menu.
- Calidades: se corrigio que un descuento de `0` se guardaba como 7 (`|| 7`) y que un error al eliminar se tragaba en silencio; los porcentajes ya no traen valores de fabrica (se piden).

### Tablas y columnas nuevas (se crean al arrancar)
`CacaoQuality.companyId` (con relleno: la empresa de los lotes que la usan; las que nadie usa pasan a la unica empresa con Cacao habilitado, si hay una sola), `CacaoSetting` (tabla), indices unicos por empresa de calidad y lote (se elimina el unico global de cada uno). Todo idempotente en `src/prisma/cacao-config.schema.ts`, registrado en `PrismaService.asegurarColumnas`; `prisma/migrations/20261023_cacao_linea_blanca/migration.sql` es solo registro. **Es el unico cambio no aditivo:** reemplaza dos indices unicos globales por unos por empresa, que son mas permisivos (un despliegue anterior sigue funcionando).

### Endpoints nuevos o cambiados
`GET|PUT /cacao/configuracion` (PUT solo ADMIN; incluye `precioIce`) · `/cacao/motivos` (catalogo de motivos; escribe solo ADMIN) · `/cacao/qualities` (GET por empresa; POST/PATCH/DELETE solo ADMIN, con DTO) · `/cacao/unit-config` (con DTO; errores en español) · `POST /cacao/receptions` (calidad obligatoria) · `POST /cacao/shipments` (`salePrice` en $/kg, `dueDays`, lotes con `lotId` y `quantity`).

### Rutas frontend
`/cacao` (Dashboard), `/cacao/suppliers`, `/cacao/receptions`, `/cacao/receptions/new`, `/cacao/lots`, `/cacao/lots/:id`, `/cacao/price-fixings`, `/cacao/settlements`, `/cacao/settlements/new`, `/cacao/settlements/:id`, `/cacao/payables`, `/cacao/clients`, `/cacao/shipments`, `/cacao/shipments/new`, `/cacao/shipments/:id`, `/cacao/receivables`, `/cacao/configuracion`, `/cacao/guia`.

### Decisiones abiertas
- «Deducciones» de la liquidacion se guarda en **kg** (como siempre), no en dolares; la lista lo mostraba como `$` y se corrigio la etiqueta.
- Las unidades de las recepciones/embarques ya hechos se muestran con el peso de saco **actual** de la empresa: si cambia, cambia como se ve el historico (el dato guardado, en kg, no cambia).

### Endpoints (liquidaciones, CxP, CxC)
`GET /cacao/settlements`, `GET /cacao/settlements/next-id`, `GET /cacao/settlements/available-lots?supplierId=`, `GET /cacao/settlements/:id`, `POST /cacao/settlements` (ADMIN), `POST /cacao/settlements/:id/approve|reject|cancel` (ADMIN o MANAGER). `GET /cacao/payables`, `POST /cacao/payables/:id/pay` (ADMIN), `POST /cacao/payables/payments/:paymentId/void` (ADMIN). `GET /cacao/receivables`, `POST /cacao/receivables/:id/receive` (ADMIN), `POST /cacao/receivables/payments/:paymentId/void` (ADMIN).

## Motivos, precio ICE y estado de liquidacion de las entregas — 2026-10-27

Leidy aprobo («apruebo todo lo que sea para mejor») y se hicieron las tres mejoras que no dependian de datos externos. En la rama `feature/cacao-liquidaciones-aprobacion`, sin commit hasta que ella lo vea en local.

- **Catalogo de motivos por empresa.** Tabla `CacaoMotivo` (`companyId`, `tipo` LIQUIDACION|PAGO, `nombre`, `activo`; unica por empresa+tipo+nombre; creada al arrancar en `cacao-config.schema.ts`, registro en `prisma/migrations/20261027_cacao_motivos/`). API `/cacao/motivos` (GET para ver; POST/PATCH/DELETE solo ADMIN; `?tipo=` y `?todos=1`). Pantalla: Configuracion → pestaña **Motivos** (`MotivosPanel.tsx`: agregar, renombrar, desactivar, eliminar; el gerente lo ve y, si pulsa, `SoloAdminDialog`). Al rechazar o anular una liquidacion, o al anular un pago o cobro, `MotivoDialog.tsx` ofrece los motivos de la empresa (mas un detalle opcional) y, **si la empresa no armo ninguno, pide texto libre como antes**. Nace vacio (linea blanca). El servidor sigue guardando el motivo como texto (`decisionReason`, `voidReason`, max. 500): renombrar o borrar uno del catalogo no cambia lo ya registrado.
- **Precio ICE por empresa.** Se guarda en `CacaoSetting` con la clave `precioIce` (sin columna nueva), se lee y escribe por `GET|PUT /cacao/configuracion` (`precioIce`, hasta 2 decimales; `null` lo borra; solo ADMIN escribe). **No hay valor de fabrica** (antes era 8150 escrito en `PriceFixingsList.tsx` y solo vivia en pantalla): una empresa nueva ve «Sin configurar», «+ Nueva Fijacion» y «Fijar» quedan bloqueados con una explicacion y el precio de referencia de la tabla sale como «—». La caja del precio se edita ahi mismo (donde se usa); no hay pestaña aparte en Configuracion.
- **Liquidacion de cada entrega en Recepciones.** `GET /cacao/receptions` devuelve `liquidadoKg` por recepcion (suma de `CacaoSettlementLot.quantity` de su lote en liquidaciones que no estan rechazadas ni anuladas; el lote identifica la entrega porque cada recepcion crea el suyo). La lista muestra la columna **Liquidacion**: *Sin liquidar*, *Parcial* o *Liquidada* (frente al peso neto recibido, tolerancia 0.001 kg) con «Liquidado X de Y kg» al pasar el cursor. Es lo mas cercano a «cerrar tickets» de Mikacao sin pedir un paso manual: el estado sale solo de las liquidaciones.
- **Probado en navegador (1530x740, admin y gerente de prueba de Mikacao):** precio ICE (sin configurar → guardar → persiste al recargar → borrar), pestaña Motivos (agregar), dialogo de rechazo con el motivo del catalogo (boton bloqueado hasta elegir; se cancelo, la liquidacion sigue «Por aprobar»), anular un pago sin motivos de pagos (pide texto libre) y la columna Liquidacion con los datos de ejemplo. Todo lo creado para probar se borro. Pruebas automaticas: 9 suites de Cacao, 98 pruebas.

## Pendiente que necesita aprobacion de Leidy (2026-10-27)
Siguen sin hacerse porque dependen de datos que no tengo o cambian el flujo de dinero de la empresa:
1. **Pagos con aprobacion** (requerimiento → autorizacion → generacion del pago) y **archivo para el banco**: el archivo depende del formato de cada banco; el flujo ya tiene dos controles (la liquidacion la aprueba otra persona y solo un administrador paga).
2. Apertura formal de liquidacion; puntos y sucursales de acopio (solo si compran en varios sitios); contabilizar liquidaciones; facturacion y retenciones del SRI (carga legal); cupo de productor; modulo de Exportaciones (orden de corte, plan de embarque, booking, factura por DAE).
Detalle y comparacion completa en `G:\My Drive\SISTEMAS\MIKACAO\Analisis-Agrosoft-Mikacao.md`.
