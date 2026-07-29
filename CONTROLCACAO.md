# CONTROLCACAO.md - Modulo de Inventario de Cacao (Mikacao S.A.)

## Descripcion
Sistema de control de inventario de cacao para Mikacao S.A., cubre el flujo completo:
Recepcion → Liquidacion → Fijacion → Kardex → Embarque → CxP/CxC

## Empresa
- **Mikacao S.A.** - Produccion y comercializacion de cacao desde 2010
- Productos: CCN-51 (convencional), Nacional (fino de aroma), Procesados
- Ubicaciones: Matriz (Los Rios), Sucursal 1 (Manabi), Sucursal 2 (Guayas)
- Web: https://mikacao.com/

## Stack Tecnologico
- Backend: NestJS v11 + TypeScript + Prisma v7
- Frontend: React 18 + Vite + TypeScript
- Base de datos: PostgreSQL 17
- Auth: JWT (Passport.js)
- CSS: custom con paleta corporativa Mikacao (#361F13, #606B42)

## Acceso
- **Solo usuario:** `admin@mikacao.com` (companyId: 2)
- **Contrasena:** `mikacao2026`
- **Ruta frontend:** `/cacao/*`
- **Ruta backend:** `/cacao/*`
- **Guard:** companyId === 2 (Mikacao) en Navbar
- **Navbar:** menu "Cacao" visible solo para companyId 2

---

## Navegacion del Sistema

Al hacer clic en "Cacao" del navbar, el usuario llega al **Dashboard** que contiene:

### Layout del Dashboard
1. **KPIs arriba** (4 tarjetas clickeables):
   - Inventario: valor total + kg disponibles → clic → /cacao/lots
   - Fijaciones Abiertas: valor estimado + kg pendientes → clic → /cacao/price-fixings
   - Cuentas por Pagar: total pendiente → clic → /cacao/payables
   - Cuentas por Cobrar: total pendiente → clic → /cacao/receivables

2. **Accesos directos** (11 tarjetas con iconos SVG + descripcion):
   - Recepciones: "Registrar entradas de cacao" → /cacao/receptions
   - Lotes: "Inventario y seguimiento" → /cacao/lots
   - Liquidaciones: "Liquidar compras a proveedores" → /cacao/settlements
   - Fijaciones: "Fijar precio definitivo" → /cacao/price-fixings
   - Embarques: "Exportaciones y ventas" → /cacao/shipments
   - CxP: "Pendientes a proveedores" → /cacao/payables
   - CxC: "Cobros a clientes" → /cacao/receivables
   - Kardex: "Historial de movimientos" → /cacao/kardex
   - Calidades: "Configurar calidades y descuentos" → /cacao/qualities
   - Proveedores: "Directorio de proveedores" → /cacao/suppliers
   - Clientes: "Directorio de clientes" → /cacao/clients
   - Fijaciones: icono dolar dorado, "Fijar precio definitivo" → /cacao/price-fixings
   - Embarques: icono grafico verde, "Exportaciones y ventas" → /cacao/shipments
   - CxP: icono flecha derecha rojo, "Pendientes a proveedores" → /cacao/payables
   - CxC: icono flecha izquierda verde, "Cobros a clientes" → /cacao/receivables
   - Proveedores: icono persona gris, "Directorio de proveedores" → /cacao/suppliers
   - Clientes: icono personas gris, "Directorio de clientes" → /cacao/clients

3. **Tabla "Ultimos Embarques"** al fondo:
   - 5 ultimos embarques: Fecha, Cliente, Referencia, Peso, Precio Venta, Margen

---

## Estructura de Base de Datos

### Maestros
| Modelo | Descripcion |
|--------|-------------|
| CacaoSupplier | Proveedor de cacao (nombre, contacto, telefono, condiciones de pago, banco) |
| CacaoClient | Cliente/exportador destino (nombre, pais, contacto, email) |
| CacaoQuality | Calidad del cacao (Convencional, Organico, Fino de Aroma, Grado 1, Grado 2) |

### Operaciones
| Modelo | Descripcion |
|--------|-------------|
| CacaoReception | Recepcion de cacao en bodega |
| CacaoLot | Lote - unidad que viaja por todo el sistema |
| CacaoSettlement | Liquidacion de compra |
| CacaoSettlementLot | Lotes incluidos en una liquidacion |
| CacaoPriceFixing | Fijacion de precio |
| CacaoKardex | Kardex de inventario (promedio ponderado) |
| CacaoShipment | Embarque/exportacion |
| CacaoShipmentLot | Lotes en un embarque |

### Financieros
| Modelo | Descripcion |
|--------|-------------|
| CacaoPayable | Cuentas por pagar |
| CacaoReceivable | Cuentas por cobrar |
| CacaoPayment | Pagos realizados/recibidos |

---

## CASOS DE USO

### CASO 1: Recepcion normal + Liquidacion basica

**Escenario:** Llega un camion con cacao CCN-51 de la Cooperativa Agricola.

**Paso 1 - Registrar recepcion:**
1. Click "Cacao" en navbar → Dashboard
2. Click "Recepciones" → Lista de recepciones
3. Click "+ Nueva Recepcion"
4. Completar formulario:
   - Proveedor: Cooperativa Agricola (dropdown)
   - # Guia: TR-2026-0045
   - Peso bruto: 1000 kg
   - Tara: 50 kg → **Peso neto: 950 kg** (calculado automatico)
   - Humedad: 7.5%
   - Impurezas: 0.8%
   - Precio provisional: $2.50/kg
   - Calidad: Convencional (dropdown)
5. Click "Guardar"
6. **Resultado:** Se crea recepcion + lote automatico LOTE-2026-001

**Paso 2 - Crear liquidacion (quincena):**
1. Click "Liquidaciones" → Lista
2. Click "+ Nueva Liquidacion"
3. Seleccionar: Cooperativa Agricola, periodo 01-15 julio
4. Seleccionar lotes: LOTE-2026-001 (950 kg)
5. Descuento humedad: 71.25 kg (7.5% de 950)
6. Castigo calidad: 0 kg
7. Precio final: $2.45/kg
8. **Resultado:** Total = 878.75 kg × $2.45 = $2,152.94 → CxP creada automaticamente

---

### CASO 2: Recepcion con merma alta + castigo de calidad

**Escenario:** Llega cacao de un proveedor nuevo con calidad inferior y alta humedad.

**Paso 1 - Registrar recepcion:**
1. Nueva Recepcion → Proveedor: "Finca El Oro"
2. Peso bruto: 800 kg, Tara: 40 kg → Neto: 760 kg
3. **Humedad: 9.2%** (alta, lo normal es 6-7%)
4. **Impurezas: 2.5%** (elevadas)
5. Precio provisional: $2.30/kg
6. Calidad: Convencional

**Paso 2 - Liquidacion con castigos:**
1. Nueva Liquidacion → Finca El Oro
2. Lote seleccionado: 760 kg
3. **Descuento humedad: 69.92 kg** (9.2% de 760)
4. **Castigo calidad: 38 kg** (por impurezas elevadas)
5. Peso final: 652.08 kg
6. Precio final: $2.20/kg (reducido por calidad)
7. **Resultado:** Total = 652.08 × $2.20 = $1,434.58 → CxP creada

**Variante - Si la humedad supera 10%:**
- El sistema podria rechazar la recepcion o aplicar un castigo doble
- Ejemplo: humedad 11% → descuento = 11% × 760 = 83.6 kg + penalizacion extra del 2% = 15.2 kg → Total descuento: 98.8 kg

---

### CASO 3: Fijacion de precio con cambio de mercado

**Escenario:** 3 lotes comprados a precio provisional. El precio de ICE Cocoa sube.

**Estado inicial:**
| Lote | Peso | Precio Ref. ICE | Diferencial | Estado |
|------|------|-----------------|-------------|--------|
| LOTE-2026-001 | 950 kg | $8,000/T | -$200/T | OPEN |
| LOTE-2026-003 | 1200 kg | $8,000/T | -$200/T | OPEN |
| LOTE-2026-005 | 800 kg | $8,000/T | -$200/T | OPEN |

**Variante A - Fijacion parcial (1 lote):**
1. Click "Fijaciones" → Lista de lotes OPEN
2. Seleccionar LOTE-2026-001
3. Precio referencia ICE: **$8,200/T** (subio)
4. Diferencial: -$200/T
5. **Precio fijado: $8,000/T = $8.00/kg**
6. Click "Fijar Precio"
7. **Resultado:** LOTE-2026-001 → CLOSED, costo promedio actualizado, otros lotes siguen OPEN

**Variante B - Fijacion multiple (varios lotes):**
1. Fijar LOTE-2026-003: ICE $8,200, diff -$150 → $8.05/kg → CLOSED
2. Fijar LOTE-2026-005: ICE $8,300, diff -$100 → $8.20/kg → CLOSED
3. **Resultado:** Todos los lotes cerrados, exposicion sin fijar = $0

**Variante C - Precio baja (riesgo):**
1. ICE bajo a $7,500/T
2. Diferencial sigue en -$200/T
3. **Precio fijado: $7,300/T = $7.30/kg** (perdida vs precio original)
4. El dashboard muestra la exposicion con el nuevo valor estimado

---

### CASO 4: Embarque completo + exportacion parcial

**Escenario:** Cliente europeo pide 1500 kg. Solo hay 2300 kg disponibles en total.

**Estado del kardex antes:**
| Lote | Disponible | Costo Promedio |
|------|-----------|----------------|
| LOTE-2026-001 | 950 kg | $7.90/kg |
| LOTE-2026-003 | 1200 kg | $7.50/kg |
| LOTE-2026-005 | 150 kg | $2.53/kg |

**Variante A - Embarque completo (todos los lotes):**
1. Click "Embarques" → "+ Nuevo Embarque"
2. Cliente: ChocoLovers GmbH (Alemania)
3. Contrato: CNT-2026-005
4. Seleccionar lotes:
   - LOTE-2026-001: 950 kg × $8.50/kg = $8,075
   - LOTE-2026-003: 550 kg × $8.20/kg = $4,510
5. Peso total: 1500 kg
6. **Resultado:**
   - LOTE-2026-001: 950 → 0 kg (SOLD)
   - LOTE-2026-003: 1200 → 650 kg (PARTIAL_SOLD)
   - Kardex: salidas registradas
   - CxC: $12,585 creada
   - Margen: $12,585 - $10,945 = $1,640

**Variante B - Embarque sin completar (stock insuficiente):**
1. El usuario intenta enviar 2000 kg
2. Solo hay 2300 kg disponibles
3. Selecciona LOTE-2026-001 (950) + LOTE-2026-003 (1050)
4. Peso total: 2000 kg
5. **Resultado:**
   - LOTE-2026-001: SOLD
   - LOTE-2026-003: 150 kg restante (PARTIAL_SOLD)
   - Quedan 150 kg + 150 kg en otros lotes

---

### CASO 5: Pago parcial a proveedor + cobro parcial de cliente

**Escenario:** Pagos y cobros escalonados por vencimiento.

**CxP #1: $4,867.54 (Cooperativa Agricola)**
| Fecha | Accion | Monto | Saldo | Estado |
|-------|--------|-------|-------|--------|
| 25/07 | Pago parcial | $2,000 | $2,867.54 | PARTIAL |
| 10/08 | Pago parcial | $1,500 | $1,367.54 | PARTIAL |
| 25/08 | Pago total | $1,367.54 | $0 | PAID |

**CxC #1: $12,585 (ChocoLovers GmbH)**
| Fecha | Accion | Monto | Saldo | Estado |
|-------|--------|-------|-------|--------|
| 01/08 | Cobro parcial | $5,000 | $7,585 | PARTIAL |
| 15/09 | Cobro parcial | $4,000 | $3,585 | PARTIAL |
| 30/09 | Cobro total | $3,585 | $0 | RECEIVED |

**Dashboard refleja:**
- CxP pendientes disminuyen
- CxC pendientes disminuyen
- Antiguedad de saldos se actualiza

---

### CASO 6: Multiples recepciones del mismo proveedor + liquidacion agrupada

**Escenario:** Proveedor entrega cacao en 3 dias distintos de la misma semana.

**Recepciones:**
| Fecha | # Guia | Peso Neto | Humedad | Lote |
|-------|--------|-----------|---------|------|
| 01/07 | TR-001 | 950 kg | 7.0% | LOTE-2026-001 |
| 03/07 | TR-002 | 1100 kg | 6.5% | LOTE-2026-002 |
| 05/07 | TR-003 | 800 kg | 8.1% | LOTE-2026-003 |

**Liquidacion agrupada (semana 1-7 julio):**
1. Seleccionar las 3 recepciones
2. Calcular descuentos por lote:
   - LOTE-2026-001: 950 - (7%×950) = 883.5 kg
   - LOTE-2026-002: 1100 - (6.5%×1100) = 1028.5 kg
   - LOTE-2026-003: 800 - (8.1%×800) - 15(castigo) = 719.2 kg
3. Peso total final: 2631.2 kg
4. Precio: $2.45/kg
5. **Total: $6,446.44 → CxP unica para las 3 recepciones**

---

## Reglas de Negocio

### Lotes
- Cada recepcion crea automaticamente un lote (codigo: LOTE-YYYY-XXX)
- Estados: AVAILABLE → PARTIAL_SOLD → SOLD
- El lote es la unidad que viaja por todo el sistema

### Kardex (Promedio Ponderado)
```
ENTRADA: nuevo saldo = saldo anterior + cantidad
         nuevo costo = (saldo anterior + entrada) / nueva cantidad

SALIDA:  nuevo saldo = saldo anterior - cantidad
         costo usa el promedio actual (no cambia)
```

### Liquidaciones
- Agrupan recepciones del mismo proveedor/periodo
- Descuentos: humedad (% sobre peso neto) + castigo calidad
- Precio final: fijo o resultado de fijacion
- Genera CxP automaticamente

### Fijaciones
- Precio provisional: diferencial sobre ICE Cocoa ($/Tonelada)
- Puede ser fijacion parcial o total
- Fecha limite para fijar
- Al fijar: actualiza costo promedio del lote en kardex

### Embarques
- Descuentan del kardex por lote
- Generan CxC automaticamente
- Calculan margen: precio venta - costo

### CxP / CxC
- Se crean automaticamente (liquidacion → CxP, embarque → CxC)
- Soportan pagos/cobros parciales
- Estados: PENDING → PARTIAL → PAID/RECEIVED

---

## Dashboard - KPIs

| KPI | Click | Que muestra |
|-----|-------|-------------|
| Valor Inventario | /cacao/lots | Suma de (peso × costo promedio) de lotes disponibles |
| Fijaciones Abiertas | /cacao/price-fixings | Kg y valor estimado de lotes con precio provisional |
| CxP Pendiente | /cacao/payables | Total de cuentas por pagar pendientes |
| CxC Pendiente | /cacao/receivables | Total de cuentas por cobrar pendientes |
| Ultimos Embarques | tabla | 5 ultimos embarques con margen |

---

## Endpoints Backend

### Masters
- `GET /cacao/suppliers` - Listar proveedores
- `POST /cacao/suppliers` - Crear proveedor
- `PATCH /cacao/suppliers/:id` - Actualizar proveedor
- `DELETE /cacao/suppliers/:id` - Eliminar proveedor
- `GET /cacao/clients` - Listar clientes
- `POST /cacao/clients` - Crear cliente
- `PATCH /cacao/clients/:id` - Actualizar cliente
- `DELETE /cacao/clients/:id` - Eliminar cliente
- `GET /cacao/qualities` - Lista de calidades

### Operaciones
- `GET /cacao/receptions` - Listar recepciones
- `POST /cacao/receptions` - Crear recepcion (crea lote auto)
- `GET /cacao/lots` - Lista de lotes (filtros: estado, calidad)
- `GET /cacao/lots/:id` - Detalle de lote + kardex
- `GET /cacao/settlements` - Listar liquidaciones
- `POST /cacao/settlements` - Crear liquidacion (crea CxP auto)
- `GET /cacao/price-fixings` - Fijaciones pendientes
- `POST /cacao/price-fixings` - Crear fijacion
- `PATCH /cacao/price-fixings/:id` - Fijar precio definitivo

### Inventario
- `GET /cacao/kardex` - Kardex general
- `GET /cacao/kardex/:lotId` - Kardex por lote

### Embarques
- `GET /cacao/shipments` - Listar embarques
- `POST /cacao/shipments` - Crear embarque (descuenta kardex, crea CxC)

### Financieros
- `GET /cacao/payables` - Cuentas por pagar
- `POST /cacao/payables/:id/pay` - Registrar pago
- `GET /cacao/receivables` - Cuentas por cobrar
- `POST /cacao/receivables/:id/receive` - Registrar cobro

### Dashboard
- `GET /cacao/dashboard` - KPIs

---

## Frontend - Paginas

```
/cacao                          - Dashboard con navegacion + KPIs
/cacao/suppliers                - CRUD proveedores (tabla + formulario inline)
/cacao/clients                  - CRUD clientes (tabla + formulario inline)
/cacao/receptions               - Lista recepciones + boton "+ Nueva Recepcion"
/cacao/receptions/new           - Formulario nueva recepcion
/cacao/lots                     - Lista lotes con filtros (estado, calidad)
/cacao/lots/:id                 - Detalle lote + tabla kardex
/cacao/settlements              - Lista liquidaciones + boton "+ Nueva Liquidacion"
/cacao/settlements/new          - Formulario nueva liquidacion
/cacao/price-fixings            - Fijaciones pendientes + boton "Fijar Precio"
/cacao/shipments                - Lista embarques + boton "+ Nuevo Embarque"
/cacao/shipments/new            - Formulario nuevo embarque
/cacao/payables                 - CxP con boton "Registrar Pago"
/cacao/receivables              - CxC con boton "Registrar Cobro"
/cacao/kardex                   - Historial de movimientos, filtro por lote
/cacao/qualities                - CRUD de calidades con descuentos y precios
```

---

## Cambios en Archivos Existentes

- `backend/prisma/schema.prisma`: +14 modelos Cacao* (CacaoQuality con humidityDiscount, impurityDiscount, isFixedPrice, fixedPrice)
- `backend/src/app.module.ts`: +CacaoModule import
- `frontend/src/App.tsx`: +rutas /cacao/* (incluye /cacao/qualities, /cacao/kardex)
- `frontend/src/components/layout/Navbar.tsx`: +menu Cacao (companyId=2)
- `frontend/src/styles.css`: +.navbar-link-cacao, .cacao-form, .cacao-back-btn, .unsaved-dialog, .btn-danger
- `frontend/src/pages/cacao/utils.ts`: formatDateEc(), formatMoney(), formatKg()
- `scripts/supabase-schema.sql`: +tablas Cacao*

## Paginas del Modulo Cacao

### Formularios (solo creacion)
- RecepcionForm: Seleccion calidad, peso bruto/tara, descuento por humedad/impureza, peso neto automatico, vista previa de lote
- SettlementForm: Selector proveedor+periodo, lotes automaticos, precio final, monto total prominente
- ShipmentForm: Validacion estricta de cantidad vs lote disponible, warning si margen negativo
- PriceFixingsList: Solo muestra lotes con precio provisional, precio ICE simulado, modal editable
- QualityForm: CRUD completo con descuentos por humedad/impureza, precio fijo/provisional

### Listas (navegacion)
- ReceptionList: Lista recepciones, filtro por lote
- SettlementList: Lista liquidaciones por periodo
- ShipmentList: Lista embarques con estado y tracking
- PriceFixingsList: Fijaciones con precio simulado
- KardexList: Historial de movimientos, filtro por lote
- PayablesList: Cuentas por pagar con boton pago
- ReceivablesList: Cuentas por cobrar con boton cobro
- SuppliersList: Directorio proveedores CRUD
- ClientsList: Directorio clientes CRUD
- QualitiesList: CRUD de calidades con configuracion de descuentos

### Detalle
- ShipmentDetail: Detalle completo de embarque con Timeline, PDF export, pagos registrados

## Archivos Nuevos

- `CONTROLCACAO.md`: Este documento
- `backend/src/modules/cacao/`: 10 submodulos
- `frontend/src/pages/cacao/`: 14 paginas React
- `frontend/src/services/cacao.service.ts`: API service

---

## Credenciales

| Usuario | Email | Contrasena | Empresa |
|---------|-------|------------|---------|
| Admin Mikacao | admin@mikacao.com | mikacao2026 | Mikacao S.A. (companyId: 2) |

## Version
- v1.1.0 - Julio 2026 (agregados flujos variantes y navegacion del dashboard)
- v1.2.0 - Julio 2026 (mejoras UX: fijaciones con precio simulado, liquidaciones con total prominente, embargues con validacion estricta, iconos SVG, formato fechas Ecuador, paginas calidades+kardex)
- v1.3.0 - Julio 2026 (recepcion con precio opcional + diferencial, liquidacion con desglose descuentos por calidad, validacion lotes duplicados, fijaciones antes de liquidaciones en dashboard, precio venta calculado en embarques)
- v1.4.0 - Julio 2026 (sistema de conversion de unidades: compra en TON/KG/SACO, venta en SACO, kardex siempre en kg, modelos configurables)
- v1.5.0 - Julio 2026 (UI informativa: formularios con tarjeta de conversion visual, listados con unidades originales, lotes con unidad de entrada, kardex con columna de unidad original)
- v1.6.0 - Julio 2026 (guia interactiva del sistema, dashboard mejorado con KPIs y boton de ayuda)

---

## REGLA CRITICA

- **NUNCA hacer push sin confirmacion explicita del usuario**
- Todos los cambios del modulo cacao se mantienen en local hasta que el usuario autorice el push

## Mejoras Recientes (v1.6.0 - Guía del Sistema)

- **CacaoHelpGuide**: Página interactiva `/cacao/guia` con guía paso a paso para nuevos usuarios. Explica cada sección del sistema: Maestros → Recepción → Liquidación → Fijación → Kárdex → Embarque → CxP/CxC.
- **Flujo visual**: Diagrama que muestra cómo se conectan las secciones: Proveedor → Recepción → Lote → Liquidación → CxP, Lote → Fijación, Lote → Embarque → CxC → Kárdex.
- **Glosario**: Definiciones de términos clave: Lote, Kárdex, Costo Promedio, Diferencial, Fijación, Liquidación, CxP, CxC, Unidad de Medida, Guía de Remisión.
- **Tips por sección**: Cada paso incluye un tip práctico para evitar errores comunes.
- **Dashboard mejorado**: Botón "Guía del Sistema" en el header. KPIs mejorados con conteo de facturas pendientes.
- **Ruta**: `/cacao/guia` (protegida, requiere autenticación).

## Mejoras Recientes (v1.5.0 - UI Informativa de Unidades)

- **RecepcionForm - Tarjeta de conversion visual**: Muestra la formula completa: `1.5 T × 1,000 kg/T = 1,500.00 kg`. Explica que el lote y kárdex se crearán en kg. Labels dinámicos: "Peso Bruto (T)", "Tara (T)", "Peso Neto (en Toneladas)".
- **ReceptionsList - Columna "Entrada"**: Badge con la unidad original (TON/KG/SACO). Pesos muestran ambos valores: `1,500 kg (1.50 T)`.
- **LotsList - Columna "Entrada"**: Muestra la unidad de recepción del lote. Pesos: `1,200 kg (1.33 T)`.
- **LotDetail - Info box de unidad**: Cuando el lote se recibió en no-kg, muestra: "Se recibió en: Toneladas | Peso original: 1.50 T | Factor: 1 T = 1,000 kg". Kárdex con unidades originales.
- **ShipmentForm - Tarjeta de conversión de salida**: Muestra: `30 sacos × 90 kg/sacos = 2,700.00 kg`. Por-lot: `10 sacos × 90 kg/sacos = 900.00 kg (lote recibido en T)`. Dropdown de lotes muestra unidad de recepción.
- **SettlementForm - Columna "Unidad Orig."**: En tabla de desglose, muestra: `6,000 kg = 6.67 T`.
- **KardexList - Columna "Unidad Orig." + Leyenda**: Leyenda explica que kárdex siempre está en kg. Columna muestra badge con unidad original. Cantidades: `1,200 kg (1.33 T)`.

## Mejoras Recientes (v1.4.0 - Unidades de Medida)

- **Problema resuelto**: Compra en toneladas, venta en sacos. El kárdex ahora almacena SIEMPRE en kilogramos, sin importar la unidad de compra o venta.
- **Modelo CacaoUnitConfig**: Configurable por empresa. Default: SACO_MICHOACAN (90 kg), SACO_ESTANDAR (69 kg), SACO_PERSONALIZADO (62 kg).
- **Recepciones**: Selector de unidad (TON/KG/SACO). Conversión automática: TON×1000, SACO×factor. El lote y el kárdex se crean en kg.
- **Embarques**: Selector de unidad de venta (TON/KG/SACO). El lote del embarque almacena tanto la cantidad en la unidad original como el kg equivalente (`quantityKg`).
- **Kárdex**: Campo `referenceUnit` indica la unidad original de la transacción. El frontend muestra "X kg (Y T)" o "X kg (Y sacos)" para dar contexto.
- **Schema**: `CacaoUnitConfig`, `unitOfMeasure` en CacaoReception/CacaoShipment/CacaoShipmentLot, `quantityKg`/`totalWeightKg`/`salePricePerKg` en CacaoShipment, `referenceUnit` en CacaoKardex.

## Mejoras Recientes (v1.3.0)

- **Recepcion - Precio provisional opcional**: El campo de precio provisional puede dejarse vacio y fijar el precio despues. Se agrego campo "Diferencial Pactado ($/T)" en recepcion.
- **Diferencial viaja con el lote**: El diferencial se almacena en la recepcion y el lote. Viaja "dormido" hasta que se ejecuta la fijacion, donde se usa para calcular el precio final.
- **Liquidacion - Desglose de descuentos**: Tabla detallada por lote mostrando: peso bruto, descuento humedad %, descuento impurezas %, peso neto descontado, precio/kg y subtotal.
- **Liquidacion - Validaciones reforzadas**: Previene seleccion del mismo lote dos veces. Valida que la cantidad no exceda el peso neto del lote.
- **Dashboard - Orden corregido**: Fijaciones ahora aparece antes de Liquidaciones (Recepciones → Lotes → Fijaciones → Liquidaciones → Embarques).
- **Embarques - Precio calculado**: El precio de venta se auto-calcula del precio fijo + 15% margen, pero es editable manualmente.
- **Schema**: Campo `differential Float?` agregado a CacaoLot y CacaoReception.
