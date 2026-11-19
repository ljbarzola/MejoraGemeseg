# Módulo: Custodias

Viajes operativos de custodia (rutas y transporte), sin dinero. Dinero (tarifas, pagos, nómina) en `contabilidad.md`. No confundir con «Guardias» (personal de seguridad, RRHH).

## Reglas de diseño vigentes
- Custodias es solo operativo: ni el Dashboard, ni el formulario, ni el detalle, ni la Orden en PDF muestran montos.
- Ya no es sección de permisos: `CUSTODIAS` no está en `ALL_SECTIONS`. El controlador pide `OPERACIONES`. Las filas `CUSTODIAS` viejas de `UserPermission` se ignoran.
- Dentro del menú de Operaciones: grupo «Custodias» → «Viajes» (`/operaciones/viajes`); dashboard como pestaña «Custodias» del Resumen (`/operaciones?vista=custodias`, `CustodiasDashboard` con `incrustado`).
- Redirecciones: `/custodias` (con búsqueda), `/custodias/new` (abre la ventana), `/custodias/trabajador`, `/custodias/dashboard`, `/custodias/gemebot`, `/custodias/nomina` → `/contabilidad/pagos`.
- Al arrancar, una sola vez (`asegurarCustodiasEnOperaciones`, `operaciones-seccion.schema.ts`), se enciende OPERACIONES en las empresas que tenían CUSTODIAS. Las filas de permiso por persona NO se copian (copiar un «no» quitaría Operaciones entera).
- Se conservan a propósito con nombre «custodias»: `folderType 'CUSTODIAS'` de las carpetas Drive de guardias, la API `/custodias/*` y el grupo del menú.
- GEME-BOT es el Agente de Custodia del chat (ver `agents-ai.md`): sin dinero, lo ve quien ve Operaciones; su `scope` interno sigue siendo `'CUSTODIAS'` (guardado en base) y sus intenciones (`custodias_resumen`…) exigen `OPERACIONES`.

## Tipos y estados
- Tipos: HACIENDA, PUERTO, VIP. Lo que se paga por cada uno está en Contabilidad → Tarifas.
- Estados: `LISTO_PARA_CUSTODIAR` → `EN_CAMINO` → `LLEGO`. Solo `LLEGO` entra a Pagos/nómina.
- Campos por tipo: Hacienda = `nombreHacienda` y `cantidadSacos` (obligatorios); Puerto = `contenedores[]` (numero, sello, guia, BL opcionales); VIP = sin extras. Al cambiar el tipo se borran los datos del tipo anterior.
- Modelo `Custodia` (Prisma): ver schema. Guarda `choferName/Cedula`, `custodio1…`, `custodio2…`, `fechaHoraSalida/Llegada`, `companyId`.

## Endpoints (`/custodias`)
- `POST /` crear; `GET /` listar (fechaInicio, fechaFin, tipo, estado); `GET /:id` detalle; `PATCH /:id` editar (`UpdateCustodiaDto`, no cambia estado); `DELETE /:id`.
- `GET /dashboard` (`mes`): `kpis` (`total_viajes`, `viajes_finalizados`, `en_camino`, `empleados_activos`, `clientes_atendidos`), `por_tipo`, `por_estado`, `por_mes` (6 meses por tipo), `por_cliente` y `por_persona` (top 6). Sin dinero. Un viaje cuenta en el día y mes de Ecuador (UTC-5) de su salida (o registro): `common/utils/viaje-fechas.util.ts`.
- `PATCH /:id/estado` (acepta `fecha`); `GET /:id/pdf` (Orden de Custodia); `GET /available-custodios`; `POST /personal` (persona nueva).
- `:id` se valida como entero (una ruta vieja como `/custodias/nomina` da 400, no 500). Ya no existen `/custodias/nomina`, `/nomina/pdf`, `/trabajador` ni `/gemebot/query`.

## Estados y edición del viaje
- Solo avanza al paso siguiente (botón «Salió»/«Llegó» de la fila) o vuelve al inicio («Volver al inicio» en «⋯», desde En camino o Llegó). No salta pasos ni retrocede de a uno; el servidor lo valida (`TRANSICIONES` en `custodias.service.ts`, 400). Volver desde «Llegó» pide confirmación (deja de contar como pago). Al volver al inicio se borra la hora de llegada; la de salida queda (se corrige con «Editar»).
- «Salió»/«Llegó» abren `MarcarEstadoModal` con la hora de ahora, editable. El servidor guarda esa hora en `fechaHoraSalida/Llegada`, rechaza horas futuras (margen 5 min) y llegada anterior a la salida. Esa hora decide el día y mes en Contabilidad. El calendario no se abre solo al enfocar (ver `RECOMENDACIONES_UX_UI.md`).
- Editar: la guía no se repite con otro viaje; chofer y custodios deben ser personas distintas. Editar un viaje ya llegado puede cambiar lo que se paga (el formulario avisa).
- Viaje con pagos registrados en Contabilidad: no se elimina, no vuelve al inicio, no cambia de tipo ni personal (sí cliente, placa, direcciones, horas, observaciones). Primero se deshacen los pagos (`CustodiasService.exigirSinPagos`); el 400 se muestra tal cual.

## Pantallas
- «Viajes» (`CustodiasList`): listado estándar (`PageHeader`, buscador, «Columnas», limpiar filtros, «Exportar», filtros y orden en la cabecera). Acción visible por fila = siguiente paso; el resto en «⋯» (Ver detalle, Orden en PDF, Editar, Volver al inicio, Eliminar).
- «+ Nueva custodia» es una ventana (`CustodiaFormModal`), no pantalla. No hay «Consulta por Cédula»: es el filtro «Personal (nombre o cédula)».
- Dashboard (`CustodiasDashboard`): franja de cifras, tendencia 6 meses, por tipo, por estado, clientes y personal con más viajes. Sin «accesos rápidos». Quien no tiene Operaciones pero sí viajes ve «Resumen» (`/custodias/dashboard`) y «Viajes».
- Componentes en `components/custodias/`: `EstadoSelect`, `CustodiaDetalleModal`, `ImprimirOrdenModal`, `EmpleadoSelect`, `NuevaPersonaModal`, `MarcarEstadoModal`, `CustodiaFormModal`.
- Los PDF se descargan con token como archivo (`utils/archivos.ts`); `window.open` daría 401.

## Orden de Custodia en PDF (PDFKit, `pdf.service.ts`)
- LETTER con logo de Gemeseg siempre (`backend/src/assets/logo-gemeseg.png`, copiado a `dist/assets` por `nest-cli.json`), secciones Servicio / Ruta y horarios / Personal / Contenedores / Observaciones / Firmas (Cliente, Chofer, Custodio 1, Custodio 2), estado como etiqueta. Incluye hacienda, sacos y contenedores. Horas en hora de Ecuador. Sin tarifa.
- Colores: Navy `#1e3a5f`, Gold `#d4a017`, Chofer BG `#fffbeb`, Custodio BG `#f1f5f9`.

## Personal desde Operaciones: elegir o crear
- Fuente de la lista (`getAvailableCustodios`): guardias de RRHH (`EmployeeDriveFolder`, `folderType 'CUSTODIAS'`) más personas de los horarios (`CPPuestoGuardia`, que no crean ficha en RRHH). Se deduplica por cédula real o, si falta, por nombre sin importar orden de apellidos ni mayúsculas (`mismoNombre`). Quien solo tiene clave interna `SC-…` sale «Sin cédula».
- Una sola lista, sin distinguir guardias de custodios: quien es chofer puede ser custodio y al revés. No hay marca «es custodio» ni se va a pedir. Solo se impide repetir a la misma persona en un viaje (`exigirPersonasDistintas`: compara por cédula y, si falta, por nombre; en crear, editar y formulario).
- Cédula o documento libre y OPCIONAL: cualquier documento de 5 a 20 caracteres (letras, números, guion, sin espacios, en mayúsculas); claves internas `ID-…`, `TEMP-…`, `SC-…` prohibidas. Regla en `validarCedulaIngresada` (`personal/utils/identidad-persona.util.ts`), usada por «Crear persona» y las fichas de guardias y de administrativos de RRHH. El selector ofrece a todos los guardias; sin documento devuelve `cedula: ''` y `sinCedula: true` (la clave interna nunca sale del servidor ni se guarda en el viaje). Contabilidad identifica por cédula o, si falta, por nombre (`clavePersona`). NO se cambió la validación de postulación (`postulacion-validacion.util.ts`, igual al portal público, 10 dígitos) ni la lectura de cédulas de Drive.
- En el viaje solo se elige o se crea (`EmpleadoSelect` con `permitirCrear` filtra al escribir; no guarda nombre suelto). Una persona creada se agrega a los tres campos (evento `empleado-select:persona-creada`). Otros usos del selector (RRHH, inventario, contratos) aceptan texto. El desplegable resalta lo escrito sin distinguir tildes y se navega con teclado.
- «¿No existe? Créalo aquí» abre `NuevaPersonaModal`: obligatorio solo el nombre («Apellidos Nombres»); opcionales cédula, teléfono, correo, dirección, contacto de emergencia (a `GuardiaFichaPersonal`). `POST /custodias/personal` (`CustodiasPersonalService`, sección de escritura de Operaciones): si la cédula ya es un guardia lo devuelve sin duplicar; si es de otro tipo de personal, error explicativo. Sin cédula recibe clave `ID-OP-<12 hex>` (RRHH la ve «Sin cédula»); sin cédula no duplica a un guardia con el mismo nombre.
- Sin Drive y sin migración: se crea solo en la base con `folderId`/`folderUrl` vacíos («Sin carpeta»); nada se escribe en Drive. RRHH recibe notificación («Persona nueva sin carpeta», `/rrhh/guardias`); `GET /personal/guardias` trae `sinCarpeta`. «Archivar carpeta» y «Mover a entidad» (`DriveService`) responden con mensaje claro si no hay carpeta. El sync de Drive solo agrega y actualiza; no borra a estas personas.
- Advertencia: el botón «Crear carpeta» en RRHH no existe (tocaría el Drive real). Si RRHH crea a mano una carpeta «Apellidos Nombres» sin cédula, el sync la ve como ficha nueva con clave `ID-…` y duplica a la persona «Sin carpeta»; se unen con «Unir cédulas».

## Dependencias y archivos clave
- `pdfkit` + `@types/pdfkit`; `EmployeeDriveFolder` (Personal).
- Backend: `backend/src/modules/custodias/` (`custodias.service.ts`, `custodias.controller.ts`, `pdf.service.ts`, `dto/create-custodia.dto.ts`, `dto/update-estado.dto.ts`).
- Frontend: `frontend/src/pages/custodias/CustodiasList.tsx`, `frontend/src/components/custodias/`, `frontend/src/services/custodia.service.ts`.
- Seed: 10 custodias de ejemplo (G-0001 a G-0010).
- Pendientes del módulo: `.agents/PENDIENTES_CUSTODIAS_CONTABILIDAD.md`.
