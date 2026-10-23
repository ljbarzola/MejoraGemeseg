# Modulo: Cacao

## Descripcion
Sistema completo de inventario de cacao para Mikacao S.A.
Flujo: Recepcion → Liquidacion → Aprobacion → Fijacion → Kardex → Embarque → CxP/CxC
(la CxP nace al aprobar la liquidacion, no al crearla; ver "Liquidaciones, aprobacion y pagos")

## Empresa
- **Mikacao S.A.** - Produccion y comercializacion de cacao desde 2010
- Productos: CCN-51 (convencional), Nacional (fino de aroma), Procesados
- Ubicaciones: Matriz (Los Rios), Sucursal 1 (Manabi), Sucursal 2 (Guayas)

## Submodulos
1. **Suppliers** - Registro de proveedores
2. **Clients** - Registro de clientes
3. **Qualities** - Calidades con reglas de descuento
4. **Receptions** - Entradas de cacao (auto-crea lotes)
5. **Lots** - Inventario de lotes (cada lote viaja por el sistema)
6. **Settlements** - Liquidaciones a proveedores (LIQ-XXXX)
7. **PriceFixings** - Fijaciones de precio (provisional → definitivo)
8. **Shipments** - Embarques/exportaciones (EMB-XXXX)
9. **Payables** - Cuentas por pagar (se crean al aprobar la liquidacion)
10. **Receivables** - Cuentas por cobrar (auto desde embarques)
11. **Payments** - Registros de pagos
12. **Kardex** - Libro de inventario (siempre en kg)
13. **UnitConfig** - Unidades de medida configurables

## Unidades
- Buy: TON, KG, SACO
- Sell: SACO
- Kardex always stores in kg
- Default sack: SACO_MICHOACAN (90 kg)
- Configurable: SACO_ESTANDAR (69 kg), SACO_PERSONALIZADO (62 kg)

## IDs Formato
- Settlements: `LIQ-XXXX`
- Shipments: `EMB-XXXX`
- Lots: `LOTE-YYYY-00001`

## Convenciones
- Decimal control: max 4 decimales, `round4()` helper
- Tolerance: `+ 0.001` kg para rounding
- Date format: DD/MM/YYYY via `formatDateEc()` (UTC methods)
- Form layout: `.page-card` max-width 900px

## Liquidaciones, aprobacion y pagos — 2026-10-23

Revision del dinero del modulo (liquidaciones, CxP, CxC). Leidy confirmo ese dia que el modulo **no tiene datos ni uso real**, por eso no hubo backfill ni migracion de liquidaciones existentes. Se probo con tsc, eslint y un arranque local; **sin tests ni commit todavia** (pendiente del ok de Leidy en local).

### Decisiones
- **Aprobacion (pedido de Leidy: «alguien con rol de gerente»).** Una liquidacion nace `PENDING` y **no** crea CxP. `POST /cacao/settlements/:id/approve` (ADMIN o MANAGER, nunca quien la creo: `createdBy` ≠ quien aprueba) la pasa a `APPROVED` y recien ahi crea la CxP (vence a `dueDays` dias desde la aprobacion, 30 por defecto). `reject` (solo `PENDING`) y `cancel` (solo `APPROVED` sin pagos vigentes) piden motivo obligatorio (`decisionReason`). Una empresa con un solo administrador y sin gerente no puede aprobar lo que ella misma crea: es intencional.
- **Estados.** Liquidacion: `PENDING → APPROVED → PAID`, mas `REJECTED` y `CANCELLED`. CxP: `PENDING/PARTIAL/PAID/CANCELLED`. Antes `PAID` solo se mostraba en pantalla pero el servidor nunca lo asignaba; ahora lo asigna al saldar la CxP y vuelve a `APPROVED` si se anula un pago.
- **Los totales los calcula el servidor.** La pantalla ya no manda `totalAmount`/`totalNetWeight`/etc. (siguen aceptados y se ignoran por compatibilidad); manda por lote `humidityPct`, `impurityPct` y `qualityPunishment`. Formula en `calcularLoteLiquidacion` (`settlements.service.ts`): neto = cantidad − humedad% − impurezas%; costo efectivo = max(0, costo promedio del lote − castigo); monto por lote redondeado a 2 decimales; `finalPrice` = monto / neto. El costo por kg sale del lote en la BD, no de lo que mande el navegador.
- **Tope por lote = lo recibido del proveedor, no `CacaoLot.netWeight`.** Cada recepcion crea su propio lote y los embarques **bajan** `netWeight` (es existencias), asi que no sirve para saber cuanto se le debe al proveedor. Pendiente de liquidar = suma de `CacaoReception.netWeight` de ese proveedor en el lote − suma de `CacaoSettlementLot.quantity` de liquidaciones que no estan `REJECTED`/`CANCELLED`. Rechazar o anular libera el peso. Se bloquean los lotes con `SELECT … FOR UPDATE` dentro de la transaccion para que dos liquidaciones simultaneas no tomen el mismo peso. `GET /cacao/settlements/available-lots?supplierId=` devuelve eso ya calculado y lo usa el formulario.
- **Una transaccion.** Crear liquidacion (cabecera + lotes) es atomico. Aprobar crea la CxP en la misma transaccion con `updateMany … where status = PENDING` (si dos personas aprueban a la vez, una recibe «ya fue decidida»).
- **Pagos y cobros.** `POST …/pay` y `…/receive` usan DTO (`common/payment.dto.ts`): monto > 0 con maximo 2 decimales, metodo `TRANSFER|CASH|CHECK`, referencia ≤ 120. **Antes el cuerpo era un tipo en linea y `ValidationPipe` no lo validaba** (montos negativos o texto pasaban). Se bloquea la fila de la cuenta (`FOR UPDATE`) y todo ocurre en una transaccion; ya no se puede superar el saldo con dos pagos simultaneos. Solo se paga una CxP cuya liquidacion esta `APPROVED`. El pago guarda `createdBy`; el embarque pasa a `COMPLETED` dentro de la misma transaccion al saldar la CxC.
- **Anular pagos/cobros.** `POST /cacao/payables/payments/:id/void` y `/cacao/receivables/payments/:id/void` (solo ADMIN, motivo obligatorio). No se borra: `voidedAt/voidedBy/voidReason`; la cuenta recupera el saldo. El historial se ve en el boton «Pagos»/«Cobros» de cada lista.
- **Seguridad entre empresas.** Crear una liquidacion ahora comprueba que proveedor y lotes sean de la empresa del usuario (antes no se comprobaba).
- **Dashboard.** Las CxP `CANCELLED` no cuentan en «CxP Pendiente».

### Columnas nuevas (todas opcionales; se crean al arrancar)
`CacaoSettlement`: `decidedBy`, `decidedAt`, `decisionReason`, `dueDays`. `CacaoSettlementLot`: `humidityPct`, `impurityPct`, `qualityPunishment`, `netKg`, `amount`. `CacaoPayment`: `createdBy`, `voidedAt`, `voidedBy`, `voidReason`. Se anaden en `src/prisma/cacao-liquidaciones.schema.ts` (via `PrismaService.asegurarColumnas`, con `ALTER TABLE IF EXISTS … ADD COLUMN IF NOT EXISTS`) porque el despliegue no corre migraciones; `prisma/migrations/20261023_cacao_liquidaciones/migration.sql` es solo registro.

### Decisiones abiertas (no se asumieron)
- La pantalla de liquidacion solo ofrece lotes `OPEN`. Un lote ya embarcado por completo queda `CLOSED` y no se puede liquidar al proveedor aunque no se le haya pagado. Falta decidir si debe poderse.
- Los embarques (`shipments.service.ts`) siguen sin transaccion (varias escrituras sueltas) y sin descontar con bloqueo; es la misma clase de problema pero no se toco.
- «Deducciones» de la liquidacion se guarda en **kg** (como siempre), no en dolares; la lista lo mostraba como `$` y se corrigio la etiqueta.
- Pendiente tras el ok en local: pruebas unitarias de `calcularLoteLiquidacion`, aprobacion, tope por lote y pagos.

### Endpoints (liquidaciones, CxP, CxC)
`GET /cacao/settlements`, `GET /cacao/settlements/next-id`, `GET /cacao/settlements/available-lots?supplierId=`, `GET /cacao/settlements/:id`, `POST /cacao/settlements` (ADMIN), `POST /cacao/settlements/:id/approve|reject|cancel` (ADMIN o MANAGER). `GET /cacao/payables`, `POST /cacao/payables/:id/pay` (ADMIN), `POST /cacao/payables/payments/:paymentId/void` (ADMIN). `GET /cacao/receivables`, `POST /cacao/receivables/:id/receive` (ADMIN), `POST /cacao/receivables/payments/:paymentId/void` (ADMIN).

### Rutas frontend
`/cacao/settlements`, `/cacao/settlements/new`, `/cacao/settlements/:id` (aprobar/rechazar/anular), `/cacao/payables` y `/cacao/receivables` (boton «Pagos»/«Cobros» con historial y anulacion).
