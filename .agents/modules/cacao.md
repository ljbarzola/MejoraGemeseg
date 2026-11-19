# Modulo: Cacao

Back-office de comercio de cacao, linea blanca (cualquier empresa del sistema; nada esta atado a una). Reglas, flujo, decisiones y gotchas vigentes.

## Descripcion
Flujo: Recepcion → Liquidacion → Aprobacion → Fijacion → Kardex → Embarque → CxP/CxC. La CxP nace al **aprobar** la liquidacion, no al crearla.

## Reglas de este modulo (fijas; aplican a todo modulo nuevo o reformado)
1. **Linea blanca:** ninguna empresa hereda datos, textos ni valores de otra; cada una configura lo suyo y empieza vacia. Sin valores de fabrica escritos en codigo (peso del saco, plazos, precio ICE, calidades, motivos).
2. **Submodulos:** Cacao es un menu desplegable en `Sidebar.tsx`, no una entrada sola (se abre solo al entrar a una URL de Cacao).
3. **El Dashboard es el primer submodulo.**

## Submodulos (menu lateral, en orden)
Dashboard · **Compra:** Proveedores, Recepciones, Lotes, Fijaciones de precio, Liquidaciones, Cuentas por pagar · **Venta:** Clientes, Embarques, Cuentas por cobrar · **Analisis:** Reportes · Configuracion (Calidades, Unidades de medida, Plazos, Motivos, Puntos de acopio, Pagos) y Guia.


## Unidades
- Entrada y venta: TON (1000 kg), QQ (100 libras = **45,359237 kg**, `KG_POR_QUINTAL` en `unit-config.service.ts` y `useCacaoUnidades.ts`), KG, SACO. Ton, qq y kg son universales; **el peso del saco lo define cada empresa** (Configuracion → Unidades de medida, `CacaoUnitConfig` con `isDefault`; la primera unidad creada queda por defecto; no se quita el «por defecto» sin elegir otra).
- Sin saco configurado el servidor responde «Falta configurar el peso del saco» y las pantallas muestran kg (`useCacaoUnidades`).
- Pesos en kg a **4 decimales**. Precio siempre en **$/kg**.
- Las unidades de lo ya registrado se muestran con el peso de saco **actual**; el dato guardado (kg) no cambia.

## IDs
- Liquidacion `LIQ-XXXX` (derivado del `id`, inmutable; la vista previa del «siguiente» es aproximada), embarque `EMB-XXXX`, lote `LOTE-YYYY-00001` **unico por empresa** (`@@unique([companyId, code])`).

## Convenciones
- Decimales: max 4, helper `round4()`; tolerancia `+ 0.001` kg.
- Fechas DD/MM/YYYY con `formatDateEc()` (metodos UTC). Formularios `.page-card` max 900px.
- Errores al usuario: `apiErrorMessage()` (`pages/cacao/utils.ts`): muestra la razon concreta del servidor (incluso en 403) y deja «No tienes permiso para hacer esto» solo para el «Forbidden» de un rol.
- Botones que el usuario no puede usar se muestran y se explican con `SoloAdminDialog`, no se esconden.

## Liquidaciones, aprobacion y pagos
- **Aprobacion.** Nace `PENDING` sin CxP. `POST /cacao/settlements/:id/approve` (ADMIN o MANAGER, **nunca quien la creo**) la pasa a `APPROVED` y crea la CxP (vence a `dueDays` desde la aprobacion). `reject` (solo `PENDING`) y `cancel` (solo `APPROVED` sin pagos vigentes) piden motivo (`decisionReason`). Una empresa con un solo administrador y sin gerente no puede aprobar lo que crea: es intencional. `POST …/approve-bulk` (`{ ids }`, hasta 100) pasa cada una por `approve()`; las fallidas se omiten: `{ aprobadas, omitidas }`.
- **Aprobacion por monto** (`CacaoSetting.montoAprobacionAdmin`, Configuracion → Pagos): sobre ese monto (`totalAmount`, no lo neto tras anticipo) solo ADMIN aprueba (gerente 403); sin monto, sin limite. Rechazar siempre se permite al gerente.
- **Estados.** Liquidacion `PENDING → APPROVED → PAID`, mas `REJECTED`/`CANCELLED`. CxP `PENDING/PARTIAL/PAID/CANCELLED`. `PAID` se asigna al saldar la CxP y vuelve a `APPROVED` si se anula un pago.
- **Totales los calcula el servidor** (`calcularLoteLiquidacion`, `settlements.service.ts`); la pantalla manda por lote `humidityPct`, `impurityPct`, `qualityPunishment`. Neto = cantidad − humedad% − impurezas%; costo efectivo = max(0, costo promedio del lote − castigo); monto por lote a 2 decimales; `finalPrice` = monto/neto. «Deducciones» va en kg.
- **Tope por lote = lo recibido del proveedor, no `CacaoLot.netWeight`** (los embarques lo bajan): suma de `CacaoReception.netWeight` del proveedor en el lote − `CacaoSettlementLot.quantity` de liquidaciones no `REJECTED`/`CANCELLED`. Lotes bloqueados con `SELECT … FOR UPDATE`. `GET /cacao/settlements/available-lots?supplierId=` lo da calculado (fuente: `common/liquidado.util.ts`). Se liquidan lotes abiertos o cerrados; un lote `VOIDED` o entrega cerrada no se ofrecen.
- **Transacciones.** Crear (cabecera + lotes) es atomico y comprueba que proveedor y lotes sean de la empresa. Aprobar crea la CxP con `updateMany … where status = PENDING` (si dos aprueban a la vez, una recibe «ya fue decidida»).
- **Pagos y cobros** (`POST …/pay`, `…/receive`, DTO `common/payment.dto.ts`): monto > 0 con max 2 decimales, metodo `TRANSFER|CASH|CHECK`, referencia ≤ 120; fila de la cuenta bloqueada en transaccion. Solo se paga una CxP de liquidacion `APPROVED`. El embarque pasa a `COMPLETED` al saldar la CxC.
- **Anular pagos/cobros:** `POST /cacao/payables/payments/:id/void` y `/cacao/receivables/payments/:id/void` (ADMIN, motivo). No se borra (`voidedAt/By/Reason`); la cuenta recupera el saldo.
- Las CxP `CANCELLED` no cuentan en el dashboard.

### Columnas y tablas se crean al arrancar
El despliegue no corre migraciones: todo cambio de esquema de Cacao va **aditivo e idempotente** en `src/prisma/cacao-liquidaciones.schema.ts` y `src/prisma/cacao-config.schema.ts` (registrados en `PrismaService.asegurarColumnas`, `ALTER TABLE IF EXISTS … ADD COLUMN IF NOT EXISTS`); los `migration.sql` son solo registro. Unico cambio no aditivo: los indices unicos globales de calidad y lote pasaron a unicos por empresa (mas permisivos). El seed de ejemplo NO se sube (repo publico).

## Linea blanca (que se corrigio y que reglas quedan)
- **`CacaoQuality` es por empresa** (`companyId`, `@@unique([companyId, name])`, sin repetir nombre sin importar mayusculas; no se elimina una con lotes). `GET /cacao/qualities` filtra por empresa; escribir solo ADMIN. Descuento `0` es valido (no usar `|| 7`); porcentajes sin valores de fabrica.
- **Plazos por empresa** en `CacaoSetting` (`plazoPagoDias`, `plazoCobroDias`, iniciales 30 y 60); cada liquidacion y embarque puede traer su `dueDays`.
- **Sin precio de venta sugerido** (la persona escribe el suyo). **Calidad obligatoria** en la recepcion y de la empresa.
- **Listas.** Las 9 listas (proveedores, clientes, recepciones, lotes, fijaciones, liquidaciones, CxP, embarques, CxC) usan `pages/cacao/useTablaCacao.tsx`: «Columnas» (`ocultaPorDefecto`), orden y filtro **por encabezado** (`ColumnFilter`; cada columna declara `filtro: { tipo: texto|valores|numero|fecha }`; con `orden` y sin `filtro` solo ordena), ancho arrastrable por clave, buscador, y **Exportar a Excel de lo que se ve** (`exceljs`; `excel: { tipo, titulo, valor }` por columna). Cada columna lleva `ancho` inicial (con `table-layout: fixed` una sin ancho queda aplastada). Kardex queda aparte.

## Recepciones y embarques
- **Recepcion:** lote + recepcion + kardex en una transaccion; reintenta hasta 5 veces si el codigo de lote choca (`P2002`). DTO: bruto > 0, tara ≥ 0, porcentajes 0–100, neto > 0. Limpia el cache del dashboard. Calidad obligatoria.
- **Embarque:** embarque + descuento de lotes + kardex + CxC en una transaccion con lotes bloqueados. **`salePrice` en $/kg.** El servidor recalcula con el costo promedio de cada lote: `unitCost` $/kg, `saleAmount` = kg × precio, `margin` = (venta/costo − 1) × 100 con 1 decimal, CxC = venta total (costos y margen del navegador se ignoran). `POST /cacao/shipments` lleva `salePrice`, `dueDays`, lotes con `lotId` y `quantity`.
- **Ticket de pesaje** (`CacaoReception`, opcionales): `ticketNumber` (unico por empresa, `companyId + ticketNumber`; avisa tambien en concurrencia), `weighingProfile` (`BULTOS|BASCULA`, informativo), `driverName`, `vehiclePlate` (mayusculas).
- **Varias pesadas por ticket:** una recepcion es un lote y una calidad; `CacaoReceptionWeighing` (sin FK) guarda cada pesada. `weighings: [{ grossWeight, tare }]` (1–50, en la unidad de la recepcion): el servidor **suma** bruto y tara (no confia en totales del navegador; `grossWeight`/`tare` dejan de ser obligatorios con `ValidateIf`); cada pesada con neto > 0. No hay varios tipos de cacao por ticket ni edicion de pesadas (se anula y se recrea).
- **Liquidacion de cada entrega:** `GET /cacao/receptions` devuelve `liquidadoKg`; columna **Liquidacion**: *Sin liquidar*, *Parcial*, *Liquidada* (tolerancia 0.001 kg), *Cerrada*, *Anulada*.
- **Cerrar entrega sin liquidar:** `POST /cacao/receptions/:id/close` (`{ reason }`) y `/reopen` (ADMIN o MANAGER). No se cierra una ya liquidada por completo (parcial si); cierre condicional (gana la primera). Una cerrada no se ofrece al liquidar (`available-lots`: `availableKg: 0`, `closed: true`) y `POST /cacao/settlements` la rechaza. No cambia el inventario.
- **Anular embarque:** `POST /cacao/shipments/:id/cancel` (`{ reason }`, ADMIN). Transaccion con CxC y lotes bloqueados: devuelve kilos al lote (lo reabre), entrada de kardex («Anulacion embarque X», mismo costo), embarque y CxC `CANCELLED`. **Con cobros vigentes no se puede**: antes se anulan los cobros. Una CxC anulada no se cobra.
- **Anular recepcion:** `POST /cacao/receptions/:id/void` (`{ reason }`, ADMIN). Lote en cero con estado `VOIDED` y salida de kardex; no se borra nada. Solo si el lote no se uso: sin liquidaciones, embarques ni fijaciones vigentes.
- **Lo anulado no cuenta** en dashboard, reportes ni inventario (el inventario solo suma lotes abiertos).
- **Consignacion:** `CacaoReception.consigned` (casilla; columna y detalle del lote). Solo marca e informe: no cambia reglas de liquidar.
- **Peso seco y merma:** `CacaoLot.dryWeight` (kg, opcional). `PATCH /cacao/lots/:id/dry-weight` (ADMIN; no supera lo **recibido** —suma de recepciones, no `netWeight`—; lote anulado no). `GET /cacao/lots` y `/:id` devuelven `receivedKg`, `shrinkageKg`, `shrinkagePct`. No toca kardex ni lo que se paga.
- **Rango de precio por calidad:** `CacaoQuality.minPrice/maxPrice` ($/kg, opcionales; min ≤ max). `POST /cacao/receptions` da 400 si el precio provisional sale del rango **salvo `confirmPriceOutOfRange: true`** (la pantalla abre «Precio fuera de rango»). No aplica a calidades de precio fijo ni precio 0.

## Catalogos de empresa
- **Motivos** (`CacaoMotivo`: `tipo` LIQUIDACION|PAGO|RECEPCION|ANULACION, unica por empresa+tipo+nombre). `/cacao/motivos` (GET ver; escribir ADMIN; `?tipo=`, `?todos=1`). `MotivoDialog.tsx` ofrece los de la empresa y, **si no hay ninguno, pide texto libre**. Se guarda como texto (max 500): renombrar o borrar no cambia lo registrado.
- **Precio ICE:** `CacaoSetting` clave `precioIce` (hasta 2 decimales, `null` lo borra, solo ADMIN) via `GET|PUT /cacao/configuracion`. Sin valor: «Sin configurar», «+ Nueva Fijacion» y «Fijar» quedan bloqueados con explicacion; se edita en la caja de Fijaciones.
- **Configuracion** (`/cacao/configuracion?tab=calidades|unidades|plazos|motivos|puntos|pagos`): solo ADMIN guarda; el gerente ve solo lectura. `/cacao/qualities` redirige ahi (hay enlaces guardados).
- **Puntos de acopio** (`CacaoPunto`, unico por empresa sin mayusculas). `GET|POST|PATCH|DELETE /cacao/puntos` (escribir ADMIN; `?todos=1`). `CacaoReception.puntoId` (opcional, sin FK). **Sin punto activo la recepcion no lo pide; con alguno, `POST /cacao/receptions` exige `puntoId`** activo y de su empresa. Un punto con recepciones se desactiva (409 al borrar). No hay punto en la liquidacion ni desglose del dashboard por punto.
- **Primeros pasos** del Dashboard (calidades, proveedores, primera recepcion; saco y puntos opcionales) desaparece al completarse.

## Pagos con autorizacion
- Ajuste `pagosRequierenAutorizacion` (`CacaoSetting`, apagado por defecto; Configuracion → Pagos). **Apagado:** ADMIN paga directo. **Encendido:** `POST /payables/:id/pay` da 400 y el pago va en tres pasos (`CacaoPaymentRequest`): `POST /payables/:id/requests` (ADMIN o MANAGER; monto ≤ saldo − lo ya pedido/autorizado) → `…/requests/:id/authorize|reject` (ADMIN o MANAGER, **distinto de quien la pidio**; rechazar lleva motivo tipo `PAGO`) → `…/requests/:id/pay` (solo ADMIN; llama al `pay` de siempre y marca la solicitud `PAID` en la misma transaccion) · `…/cancel` (quien la pidio o ADMIN).
- Estados: REQUESTED → AUTHORIZED → PAID, mas REJECTED/CANCELLED. Quien paga puede ser quien autorizo. Anular el pago despues NO reabre la solicitud: se pide otra. Cuentas por Pagar con autorizacion: pestañas «Cuentas» y «Solicitudes de pago».

## Proveedores, documentos y anticipos
- **Ficha** (`CacaoSupplier`): `idType`, `idNumber` (**unico por empresa sin mayusculas**, 409 con el nombre del otro; guardado en mayusculas), correo, direccion, datos bancarios, `rating` 1–5. Texto vacio = `null`. **Sin validar digito verificador** (formato y unicidad). El filtro global devuelve errores de validacion genericos: el formulario valida antes de enviar. Eliminar proveedor/cliente con movimientos responde 409 con mensaje.
- **Documentos:** `CacaoSupplierDocument`; archivo en `StoredFile` (`cacao/proveedores/<empresa>/…`). `GET|POST /cacao/suppliers/:id/documents` (POST ADMIN, multipart `archivo`, PDF/JPG/PNG/WebP, 10 MB, 20 por proveedor), `GET …/documents/:docId/archivo` con **`Cache-Control: private, no-store`** (con `max-age` un documento borrado seguia bajandose), `DELETE` ADMIN. Al eliminar el proveedor se borran sus documentos.
- **Anticipos** (`CacaoSupplierAdvance`, anulables con motivo). `GET /cacao/anticipos?supplierId=` (movimientos + `saldo`), `POST /cacao/anticipos`, `POST …/:id/void` (ADMIN). **El saldo no se guarda:** anticipado (sin anulados) − `CacaoSettlement.advanceApplied` de liquidaciones `PENDING/APPROVED/PAID` (`common/anticipos.util.ts`, `saldosAnticipos`): rechazar/anular una liquidacion lo devuelve solo. No se anula un anticipo ya descontado. No pasa por la autorizacion de pagos.
- **En la liquidacion:** acepta `advanceApplied` y `paymentPlan`. El anticipo **no cambia `totalAmount`**; la CxP nace por `totalAmount − advanceApplied`. Fila del proveedor bloqueada (`FOR UPDATE`); no supera el saldo y **no puede cubrir toda la liquidacion** (quedaria CxP de $0 imposible de cerrar).
- **`paymentPlan`** (JSON `[{method: CASH|TRANSFER|CHECK|CREDIT, amount}]`, opcional): debe sumar exactamente lo que se debe pagar (tolerancia 0,005) o 400. Informativo: no se conecta con el pago real.

## Dashboard y Reportes
- **Dashboard (`/cacao`):** cifras (inventario, exposicion sin fijar, liquidaciones por aprobar, CxP, CxC) y seccion **Compras** con selector de periodo propio (`GET /cacao/dashboard/compras?desde&hasta`, AAAA-MM-DD, max 400 dias). «Compra» = peso neto × costo del lote (no lo liquidado). Calculo en `dashboard/compras.util.ts`; devuelve tambien `setup` y `pendingApproval*`.
- **Reportes** (`/cacao/reportes`, `reportes/reportes.util.ts`): CxP/CxC por antiguedad, Ventas por cliente, Inventario (lotes abiertos). Dashboard y reportes deben cuadrar entre si; lo anulado no cuenta.

## Rutas frontend
Son las de `/cacao/*` (ver `App.tsx`); `/cacao/qualities` redirige a Configuracion.

## Agente de Cacao
El agente de IA del chat explica el flujo y consulta datos reales de la empresa de quien pregunta (solo consulta, no aprueba ni paga). Diseño y permisos: `.agents/modules/agents-ai.md` seccion 8. **Al cambiar una pantalla o regla de Cacao, actualizar el bloque `CACAO` de `system-guide.util.ts`** (incluida «Por qué no me deja»): es lo que el agente explica. Sus consultas (`backend/src/modules/ai/ai-cacao.queries.ts`) reutilizan `calcularCompras`, `liquidadoPorLote` y `saldosAnticipos`.

## Limitaciones y decisiones abiertas
- Decisiones que dependen de la empresa: permisos (cerrar/reabrir y aprobar = ADMIN o MANAGER; anular recepcion/embarque, pagar, anular pagos y configurar = ADMIN), «cuatro ojos» en pagos (quien paga distinto de quien autorizo: hoy no), «compra» a costo del lote vs a lo liquidado, perfil de pesaje fijo vs catalogo, libra como unidad de entrada, ticket imprimible con QR, caja con apertura/cierre diario.
- No construido (depende de datos o decisiones de la empresa/contabilidad): SRI y facturacion electronica (firma `.p12` y clave en Secret Manager, nunca por chat; reglas tributarias las confirma contabilidad), archivo/conciliacion bancaria, contabilizar liquidaciones, productor y cupo, varios tipos por ticket, reasignar empresa del ticket, bascula/QR, exportaciones, punto en la liquidacion.
- No hay pruebas automaticas del frontend de Cacao (solo `reportes.util`).

## Frontend (reglas varias)
- Pantallas del menu: `<PageHeader eyebrow="Cacao">`, sin «← Volver». Catalogos se crean/editan en `components/common/FormModal.tsx`; Recepcion, Liquidacion y Embarque son pantalla completa a proposito.
- Subidas con axios: `FormData` exige `headers: { 'Content-Type': 'multipart/form-data' }`.
- Sin precio de venta sugerido en embarques (la persona escribe el suyo).
