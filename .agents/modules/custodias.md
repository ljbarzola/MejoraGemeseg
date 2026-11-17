# Modulo: Custodias

> **2026-11-16 (solo local, sin desplegar): Custodias se separó de Contabilidad.** Lo que sigue describe el módulo ya separado; las secciones marcadas «movido» ya no existen aquí. Decisiones de Leidy (pregunta por pregunta): (1) Nómina y Liquidación → módulo **Contabilidad** (sección de permisos propia, cerrada por defecto); (2) las tarifas dejan de estar fijas en el código y se editan en Contabilidad, por empresa y con fecha de vigencia; (3) el Dashboard Operativo, el formulario «Nueva Custodia», el detalle del viaje y la Orden de Custodia en PDF **no muestran dinero**; (4) «Consulta por Cédula» queda solo con viajes y rol, y las ganancias pasan a Contabilidad; (5) GEME-BOT se convierte en el **Agente de Custodia** del chat (sin dinero, lo usa quien vea Custodias, ver `agents-ai.md` punto 8); (6) Custodias sigue siendo módulo propio y NO pasa a Operaciones (la misma persona puede tener los dos permisos); (7) los datos de prueba locales se conservan; en producción se cree que no hay viajes (sin verificar). El detalle de tarifas, nómina y ganancias está en `AGENTS.md`, «Contabilidad». **Segunda vuelta (mismo día):** Leidy pidió que ambos módulos se parezcan al resto de la app: «Lista de Operaciones» pasó a **«Viajes»** (listado estándar con «Columnas», «Exportar» y filtros en cabecera), **«Nueva Custodia» es una ventana**, **«Consulta por Cédula» se eliminó** (es el filtro de persona del listado), el Dashboard muestra más cifras (tendencia 6 meses, por tipo, por estado, clientes y personal con más viajes) y se quitaron los accesos rápidos. Elegido por ella: tendencia por mes, por cliente y por persona; no pidió placas ni tiempo de viaje. Detalle en `AGENTS.md`, «Custodias».

## Descripcion
Gestion completa de custodias de transporte y nomina de seguridad. Migrado del repositorio `ljbarzol/Custodias` (branch `cursor/add-custodias-full-stack`) e integrado al ecosistema MejoraGemeseg con NestJS + Prisma + React.

## Tipos de Custodia
HACIENDA, PUERTO y VIP. Lo que se paga por cada uno ya no vive aquí: ver Contabilidad → Tarifas (hasta 2026-11-16 eran $20, $10 y $23 por persona, escritos en el código).

## Estados de Custodia
| Estado | Label UI | ¿Liquida nomina? |
|--------|----------|-------------------|
| `LISTO_PARA_CUSTODIAR` | LISTO PARA CUSTODIAR | No |
| `EN_CAMINO` | EN CAMINO | No |
| `LLEGO` | LLEGÓ | **Sí** (en Contabilidad) |

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
| GET | `/custodias/dashboard` | KPIs operativos del mes (total_viajes, viajes_finalizados, empleados_activos, por_tipo con cantidad, por_estado), sin dinero |
| GET | `/custodias/trabajador` | Viajes de una persona por cédula (cedula, mes) con su rol, sin montos |
| GET | `/custodias/:id` | Detalle de custodia |
| PATCH | `/custodias/:id/estado` | Cambiar estado (LISTO_PARA_CUSTODIAR/EN_CAMINO/LLEGO) |
| DELETE | `/custodias/:id` | Eliminar custodia |
| GET | `/custodias/:id/pdf` | PDF Orden de Custodia con firmas |
| GET | `/custodias/available-custodios` | Empleados disponibles de Drive CUSTODIAS |

## Nomina y Matrix Cronologica (movido a Contabilidad, 2026-11-16)
Ya no está en este módulo: `GET /contabilidad/nomina` y su PDF. La lógica es la misma (solo viajes `LLEGO`, agrupada por persona con desglose por tipo, matriz fecha × trabajador) pero cada viaje se paga con la tarifa vigente el día del viaje. Ver `AGENTS.md`, «Contabilidad».

## Generacion de PDFs (PDFKit)
| Tipo | Descripcion |
|------|-------------|
| Orden de Custodia | Documento LETTER con campos + bloque de firmas (Cliente, Chofer, Custodio 1, Custodio 2). Sin tarifa desde 2026-11-16. |
| Nomina, rol de pago, masivo | Movidos a Contabilidad (`NominaPdfService`) |

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
| `CustodiaFormModal` (componente) | ventana desde `/custodias` | Formulario completo: tipo, guia, ruta, horarios, personal (EmpleadoSelect), cliente, placa, datos por tipo |
| `CustodiasDashboard` | `/custodias/dashboard` | Dashboard (cifras del mes, tendencia, tipo, estado, clientes y personal; sin dinero) |
| `CustodiasList` | `/custodias` | «Viajes»: listado estándar; «+ Nueva custodia» abre `CustodiaFormModal` |
| ~~`ConsultaTrabajador`~~ | ~~`/custodias/trabajador`~~ | Eliminada: es el filtro «Personal (nombre o cédula)» de Viajes; la ruta redirige a `/custodias` |
| ~~`CustodiaForm`~~ | ~~`/custodias/new`~~ | Ahora es una ventana; la ruta redirige a `/custodias?nueva=1` |
| ~~`NominaPage`~~ | ~~`/custodias/nomina`~~ | Movida a Contabilidad, donde es el listado «Pagos» (`/contabilidad/pagos`); la ruta vieja redirige |
| ~~`GemeBotChat`~~ | ~~`/custodias/gemebot`~~ | Reemplazada por el Agente de Custodia del chat; la ruta vieja redirige al dashboard |

## Campos por Tipo
- **Hacienda**: nombreHacienda (obligatorio), cantidadSacos (obligatorio)
- **Puerto**: contenedores[] con numero, sello, guia, BL (opcionales)
- **VIP**: sin campos extra

## Personal para Custodias
- Empleados se obtienen de `EmployeeDriveFolder` (folderType='CUSTODIAS'). (Hasta 2026-09-17 también se unían candidatos del Kanban de Candidatos con `positionApplied='Custodio'` — modelo eliminado por no ser un flujo real, ver `.agents/modules/recursos-humanos.md` punto 2; el "estado" que mostraba cada custodio ahora es un valor fijo `'Inscrito'`, igual que ya se veía en la práctica.)
- El formulario usa `EmpleadoSelect` con busqueda por nombre/cedula
- Exclusion automatica: no se puede repetir chofer y custodios
- Opcion "+ Manual" para ingreso directo si no esta en la lista

## Archivos Clave
### Backend
- `backend/src/modules/custodias/custodias.service.ts` - CRUD + estado + dashboard operativo + viajes por cédula
- `backend/src/modules/custodias/custodias.controller.ts` - Endpoints de viajes y la orden en PDF
- `backend/src/modules/custodias/pdf.service.ts` - Solo la orden de custodia (PDFKit)
- `backend/src/modules/custodias/dto/create-custodia.dto.ts` - Validacion completa
- `backend/src/modules/custodias/dto/update-estado.dto.ts` - Validacion de estado

### Frontend
- `frontend/src/components/custodias/CustodiaFormModal.tsx` - Formulario rico (ventana)
- `frontend/src/pages/custodias/CustodiasList.tsx` - «Viajes»: listado con filtros, columnas, exportar y siguiente paso
- `frontend/src/services/custodia.service.ts` - Todos los endpoints
- `frontend/src/components/custodias/` - Componentes reutilizables

## Seed
- 10 custodias de ejemplo (4 HACIENDA, 3 PUERTO, 3 VIP)
- Numeracion: G-0001 a G-0010
- Estilos variados para testing

## Dependencias
- `pdfkit` + `@types/pdfkit` - Generacion de PDFs
- `EmployeeDriveFolder` (modulo Personal) - Empleados disponibles

## Estados y edición del viaje (2026-11-16, tercera vuelta de Leidy)
- **Estados:** un viaje solo AVANZA al paso siguiente (`LISTO_PARA_CUSTODIAR → EN_CAMINO → LLEGO`, botón «Salió»/«Llegó» de la fila) o VUELVE AL INICIO (`Volver al inicio` en «⋯», desde En camino o Llegó). No se salta pasos ni se retrocede de a uno; el servidor lo valida (`TRANSICIONES` en `custodias.service.ts`, error 400). Volver desde «Llegó» pide confirmación porque el viaje deja de contar como pago en Contabilidad. Al volver al inicio se borra la hora de llegada (el viaje aún no llegó) y la de salida queda: se corrige con «Editar».
- **Editar:** antes un viaje no se podía corregir (la API solo tenía crear, cambiar estado y eliminar; nunca se construyó). Ahora `PATCH /custodias/:id` (`UpdateCustodiaDto` = el de crear con todo opcional) y «Editar» en «⋯» abre `CustodiaFormModal` con los datos cargados; no cambia el estado. La guía no puede repetirse con otro viaje, chofer y custodios deben ser distintos, y al cambiar el tipo se borran los datos del tipo anterior (hacienda y sacos, o contenedores). Editar un viaje que ya llegó puede cambiar lo que se paga (tipo/personal): el formulario lo avisa.
- **Orden en PDF:** rediseñada con el logo de Gemeseg (`backend/src/assets/logo-gemeseg.png`, versión para fondo blanco; Nest lo copia a `dist/assets` por `nest-cli.json`), secciones Servicio / Ruta y horarios / Personal / Contenedores / Observaciones / Firmas, estado como etiqueta de color. Ahora incluye hacienda, sacos y contenedores (antes no salían) y las horas se imprimen en hora de Ecuador (antes salían en UTC, 5 h adelantadas). El logo es siempre el de Gemeseg, no el de la empresa del usuario.
- **Salió / Llegó con hora elegible (2026-11-16, cuarta vuelta de Leidy):** no siempre se alcanza a marcar a tiempo. El botón de la fila lleva UNA palabra («Salió» / «Llegó»; con icono solo no se entendía, con texto largo ensanchaba la columna: 160 → 116 px, clase `col-acciones--dos`) y abre `MarcarEstadoModal` con la hora de ahora, cambiable (día y hora; el calendario ya no se abre solo al enfocar el campo: ver `RECOMENDACIONES_UX_UI.md` §26). El servidor guarda esa hora real en `fechaHoraSalida`/`fechaHoraLlegada` (`PATCH /custodias/:id/estado` acepta `fecha`), rechaza horas futuras (margen de 5 min) y una llegada anterior a la salida. Esa hora decide a qué día y mes cuenta el viaje en Contabilidad. «Volver al inicio» borra la hora de llegada.
- **Viaje con pagos registrados (2026-11-16):** si Contabilidad ya registró como pagado algún pago de un viaje, el viaje no se elimina, no vuelve al inicio y no cambia de tipo ni de personal (sí se corrigen cliente, placa, direcciones, horas y observaciones): primero se deshacen esos pagos en Contabilidad → Pagos. El aviso del servidor (400) se muestra tal cual en el listado.
- **Custodias dentro de Operaciones (2026-11-16, quinta vuelta de Leidy: «custodias como módulo está de más»):** ya no hay módulo «Custodias» en el menú. «Viajes» es un grupo («Custodias») del menú **Operaciones**, que adoptó el icono 🛡️ que tenía Custodias, y el dashboard es la pestaña **«Custodias»** del Resumen de Operaciones (`/operaciones?vista=custodias`; `CustodiasDashboard` con `incrustado`). Es SOLO un cambio de menú y pantallas: las rutas `/custodias*`, la sección de permisos `CUSTODIAS` y el Agente de Custodia no cambian (fusionar los permisos con `OPERACIONES` queda pendiente, ver `.agents/PENDIENTES_CUSTODIAS_CONTABILIDAD.md`). Quien tiene Custodias y no Operaciones ve en ese menú «Resumen» (`/custodias/dashboard`, pantalla completa) y «Viajes».
