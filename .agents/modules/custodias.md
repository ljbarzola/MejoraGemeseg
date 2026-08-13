# Modulo: Custodias

## Descripcion
Gestion completa de custodias de transporte y nomina de seguridad. Migrado del repositorio `ljbarzol/Custodias` (branch `cursor/add-custodias-full-stack`) e integrado al ecosistema MejoraGemeseg con NestJS + Prisma + React.

## Tipos de Custodia
| Tipo | Tarifa/persona | Costo Total (3 personas) |
|------|---------------|--------------------------|
| HACIENDA | $20 | $60 |
| PUERTO | $10 | $30 |
| VIP | $23 | $69 |

## Estados de Custodia
| Estado | Label UI | ¿Liquida nomina? |
|--------|----------|-------------------|
| `LISTO_PARA_CUSTODIAR` | LISTO PARA CUSTODIAR | No |
| `EN_CAMINO` | EN CAMINO | No |
| `LLEGO` | LLEGÓ | **Sí** |

Flujo: `LISTO_PARA_CUSTODIAR` → `EN_CAMINO` → `LLEGO`

## Schema Prisma
```prisma
enum CustodiaType { HACIENDA, PUERTO, VIP }
enum CustodiaEstado { LISTO_PARA_CUSTODIAR, EN_CAMINO, LLEGO }

model Custodia {
  id, numeroGuia, tipoCustodia, estado
  choferName, choferCedula, custodio1Name, custodio1Cedula, custodio2Name, custodio2Cedula
  cliente, placa, direccionSalida, direccionLlegada
  fechaHoraSalida, fechaHoraLlegada, observaciones
  nombreHacienda, cantidadSacos, contenedores[]
  companyId, createdBy, createdAt, updatedAt
}
```

## Endpoints Backend
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/custodias` | Crear custodia |
| GET | `/custodias` | Listar (filtros: fechaInicio, fechaFin, tipo, estado) |
| GET | `/custodias/dashboard` | KPIs del mes (total_viajes, total_nomina_usd, empleados_activos, por_tipo, por_estado) |
| GET | `/custodias/trabajador` | Consulta de viajes e ingresos por cédula (cedula, mes) |
| POST | `/custodias/gemebot/query` | Asistente de consulta operativo GEME-BOT (keywords/SQL) |
| GET | `/custodias/:id` | Detalle de custodia |
| PATCH | `/custodias/:id/estado` | Cambiar estado (LISTO_PARA_CUSTODIAR/EN_CAMINO/LLEGO) |
| DELETE | `/custodias/:id` | Eliminar custodia |
| GET | `/custodias/:id/pdf` | PDF Orden de Custodia con firmas |
| GET | `/custodias/available-custodios` | Empleados disponibles de Drive CUSTODIAS |
| GET | `/custodias/nomina` | Nomina con matriz cronologica (filtro: fechaInicio, fechaFin) |
| GET | `/custodias/nomina/pdf` | PDF nomina (cedula=individual, todos=true, sin param=matriz) |

## Nomina y Matrix Cronologica
- Filtra solo custodias en estado `LLEGO`
- Agrupa por empleado (chofer, custodio1, custodio2) con desglose por tipo (HACIENDA/PUERTO/VIP)
- **Matriz cronologica**: tabla pivote `fechas x trabajadores` con celdas coloreadas (chofer amarillo, custodios gris)
- Calcula total por trabajador y gran total del periodo

## Generacion de PDFs (PDFKit)
| Tipo | Descripcion |
|------|-------------|
| Orden de Custodia | Documento LETTER con campos + bloque de firmas (Cliente, Chofer, Custodio 1, Custodio 2) |
| Nomina General (Matriz) | Papel LEGAL landscape, matriz cronologica completa |
| Rol de Pago Individual | Papel LETTER, liquidacion de un empleado con detalle de viajes |
| Nomina Masiva | Mismo que matriz general (exporta la pantalla) |

**Colores PDF:** Navy `#1e3a5f`, Gold `#d4a017`, Chofer BG `#fffbeb`, Custodio BG `#f1f5f9`

## Frontend - Componentes
| Componente | Ubicacion | Descripcion |
|------------|-----------|-------------|
| `EstadoSelect` | `components/custodias/` | Dropdown inline para cambiar estado con colores |
| `CustodiaDetalleModal` | `components/custodias/` | Modal con toda la info + link a PDF |
| `ImprimirOrdenModal` | `components/custodias/` | Confirmacion post-registro para imprimir |
| `EmpleadoSelect` | `components/custodias/` | Busqueda y seleccion de empleados de Drive |

## Frontend - Paginas
| Pagina | Ruta | Descripcion |
|--------|------|-------------|
| `CustodiaForm` | `/custodias/new` | Formulario completo: tipo, guia, ruta, horarios, personal (EmpleadoSelect), cliente, placa, datos por tipo |
| `CustodiasList` | `/custodias` | Lista con filtros (tipo/estado/fecha), cambio de estado inline, detalle modal |
| `NominaPage` | `/custodias/nomina` | Resumen cards, tabla desglose por tipo, matriz cronologica, exportaciones PDF |

## Campos por Tipo
- **Hacienda**: nombreHacienda (obligatorio), cantidadSacos (obligatorio)
- **Puerto**: contenedores[] con numero, sello, guia, BL (opcionales)
- **VIP**: sin campos extra

## Personal para Custodias
- Empleados se obtienen de `EmployeeDriveFolder` (folderType='CUSTODIAS') + `Candidate` (positionApplied='Custodio')
- El formulario usa `EmpleadoSelect` con busqueda por nombre/cedula
- Exclusion automatica: no se puede repetir chofer y custodios
- Opcion "+ Manual" para ingreso directo si no esta en la lista

## Archivos Clave
### Backend
- `backend/src/modules/custodias/custodias.service.ts` - CRUD + estado + nomina con matriz
- `backend/src/modules/custodias/custodias.controller.ts` - Todos los endpoints incluyendo PDF
- `backend/src/modules/custodias/pdf.service.ts` - Generacion PDF con PDFKit
- `backend/src/modules/custodias/dto/create-custodia.dto.ts` - Validacion completa
- `backend/src/modules/custodias/dto/update-estado.dto.ts` - Validacion de estado

### Frontend
- `frontend/src/pages/custodias/CustodiaForm.tsx` - Formulario rico
- `frontend/src/pages/custodias/CustodiasList.tsx` - Lista con filtros y estado
- `frontend/src/pages/custodias/NominaPage.tsx` - Nomina con matriz y PDFs
- `frontend/src/services/custodia.service.ts` - Todos los endpoints
- `frontend/src/components/custodias/` - Componentes reutilizables

## Seed
- 10 custodias de ejemplo (4 HACIENDA, 3 PUERTO, 3 VIP)
- Numeracion: G-0001 a G-0010
- Estilos variados para testing

## Dependencias
- `pdfkit` + `@types/pdfkit` - Generacion de PDFs
- `EmployeeDriveFolder` (modulo Personal) - Empleados disponibles
- `Candidate` (modulo Personal) - Candidatos a custodio
