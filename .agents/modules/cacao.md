# Modulo: Cacao

## Descripcion
Sistema completo de inventario de cacao para Mikacao S.A.
Flujo: Recepcion → Liquidacion → Fijacion → Kardex → Embarque → CxP/CxC

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
9. **Payables** - Cuentas por pagar (auto desde liquidaciones)
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
