# Módulo: Contabilidad (`/contabilidad`)

Dinero de las custodias: tarifas por tipo, pagos por persona y viaje, extras/descuentos, rol de pago y matriz (PDF/Excel), dashboard con montos. Hoy cubre solo custodias; cobranza, Cacao y otras cuentas quedan fuera. Viajes: `custodias.md`.

## Permisos
- Sección `CONTABILIDAD`: apagada por empresa (`alwaysEnabled: false`, la enciende un super admin) y cerrada por defecto (sin fila `UserPermission` no hay acceso). Quien tiene Operaciones/viajes NO ve dinero.
- Las rutas piden empresa (un super admin sin empresa recibe un aviso corto).

## Endpoints (`/contabilidad`)
- `GET /dashboard` (`mes`): `kpis` (viajes finalizados, total a pagar, personas a pagar, promedio por viaje, viajes sin tarifa), `por_tipo`, `por_mes` (6 meses), `por_cliente` y `por_persona` (top 6 por costo). Total a pagar y por persona incluyen ajustes; promedio por viaje y costo por tipo usan solo viajes.
- `GET /tarifas` (vigente hoy por tipo, null = sin definir, e historial); `POST /tarifas` (`tipo`, `valorPorPersona` > 0, `vigenteDesde`; misma fecha y tipo la reemplaza); `PATCH /tarifas/:id` y `DELETE /tarifas/:id` actúan sobre CUALQUIER tarifa (también las futuras): los pendientes se recalculan, lo pagado conserva su monto congelado.
- `GET /pagos`: una fila por persona y viaje de TODOS los viajes `LLEGO` (fecha, guía, tipo, rol, persona, cédula, cliente, placa, monto = tarifa, `ajuste` = extras − descuentos ligados a ese viaje y persona, `total`, `sinTarifa`, `diaViaje`, `tarifaDesde` = día de la primera tarifa del tipo o null). La pantalla filtra por columna.
- `POST /pagos/registrar` (`items: [{custodiaId, rol}]`, `fecha`, `referencia`), `PATCH /pagos/registrados/:id` (día y referencia), `POST /pagos/deshacer` (`ids`).
- `GET/POST /ajustes`, `PATCH/DELETE /ajustes/:id`: `tipo` EXTRA|DESCUENTO, `persona`/`cedula`, `monto` > 0 (el signo lo da el tipo), `concepto` obligatorio, `fecha`, `custodiaId` opcional. Ligado a un viaje: la persona debe haber participado y la fecha es la del viaje; si el viaje se borra, el ajuste queda suelto (conserva la guía como texto). Tabla `ContabAjusteCustodia`, creada al arrancar, sin modelo Prisma.
- `GET /nomina/pdf` y `GET /nomina/excel` (`fechaInicio`, `fechaFin`, `cedula`, `documento`): ver «Rol de pago y matriz».

## Reglas de negocio
1. A cada persona de un viaje se le paga tarifa + sus ajustes; si el pago está registrado, lo congelado.
2. La tarifa es por persona; en un viaje cobran 3 (chofer y dos custodios). No hay tarifa distinta para el chofer.
3. Cada viaje se paga con la tarifa vigente el día del viaje (`fechaHoraSalida`, o el registro si falta, en día de Ecuador UTC-5): subir una tarifa no recalcula el pasado.
4. Tipo sin tarifa para esa fecha: el viaje cuenta pero paga $0 y la pantalla lo avisa; no se inventa valor ni se puede registrar el pago.
5. Una empresa nueva empieza sin tarifas. A las empresas con viajes previos se les sembraron una sola vez $20/$10/$23 (HACIENDA/PUERTO/VIP) desde 2020-01-01 (marca `contabilidad-tarifas-custodia-2026-11` en `MigracionDatos`).
6. Tablas `ContabTarifaCustodia` y `ContabPagoCustodia` se crean al arrancar (`contabilidad.schema.ts`), sin modelo Prisma.
7. No hay «cierre» de período: ajustes y tarifas pasadas se calculan en vivo; solo lo registrado como pagado está congelado.

## Pagos registrados
- «Registrar» = marcar que ya se pagó. `ContabPagoCustodia`: una fila por viaje + rol, con monto (tarifa, ajuste, total) congelado, día de pago y referencia. FK `ON DELETE RESTRICT`.
- Pagos muestra estado Pendiente/Pagado, «Registrar pagos (N)» (aplica a lo pendiente que se ve: filtrar primero), «Registrar pago» por fila, «Corregir día o referencia», «Deshacer pago». Nómina, matriz, Excel y Dashboard usan lo congelado para lo pagado.
- Un viaje con pagos registrados no se elimina, no vuelve al inicio ni cambia de tipo/personal (`CustodiasService.exigirSinPagos`); sus ajustes ligados no se tocan hasta deshacer el pago.

## Pantallas
- Menú: «Dashboard», «Pagos», «Tarifas». Redirecciones: `/contabilidad/nomina` y `/contabilidad/trabajador` → `/contabilidad/pagos`.
- «Pagos» (`/contabilidad/pagos`): listado estándar que se abre con todo (cifras de lo visible, buscador, «Columnas», «Exportar», filtros en cabecera). «Exportar» usa `POST /ventas/exportar-tabla` (abierto también a CUSTODIAS/OPERACIONES y CONTABILIDAD porque solo da formato a las filas que manda la pantalla).
- Sin tarifa: aviso naranja por tipo con la causa y botón «Definir tarifa de …» (también en el «⋯» de la fila) que abre `/contabilidad/tarifas?nueva=1&tipo=…&desde=…` con el formulario lleno.
- Ajustes: botón «Extras y descuentos» de Pagos abre `AjustesModal` (crear, editar, eliminar); la fila tiene «Agregar extra o descuento». No hay pestaña propia.
- Dashboard con las piezas del de Custodias, con montos.

## Rol de pago y matriz
- Botón «Rol de pago y matriz» → «¿Qué necesitas?»: `resumen` (matriz de todo el personal), `persona` (rol de una persona), `detalle` (detalle de viajes), `cronologica` (matriz cronológica); con «Así saldrá» y el archivo PDF o Excel.
- `GET /nomina/pdf|excel?documento=…`: el PDF y la PRIMERA hoja del Excel de un mismo contenido tienen las mismas columnas en el mismo orden; las demás hojas son extras (detalle, ajustes, resumen). Sin `documento`: PDF = matriz cronológica, Excel = resumen. Con `cedula` solo esa persona.
- Rol de pago: subtotal de viajes + ajustes = total neto; quien tiene solo un descuento y sin viajes también sale. Ajustes al pie de la matriz.
- La matriz cronológica tiene una columna por cada persona CON VIAJES en el período (no las del padrón).
- Los PDF imprimen hora de Ecuador (`NominaPdfService`).

## Pendientes
- Sin pantalla de ayuda propia.
- Idea no construida: que Operaciones vea la entidad de cada custodio (dato de RRHH/Contratación Pública, `AsignacionGuardia`).
- Otros: `.agents/PENDIENTES_CUSTODIAS_CONTABILIDAD.md`.
