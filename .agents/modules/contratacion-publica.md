# Modulo: Contratacion Publica

## Descripcion
Gestion de contratos de seguridad privada con entidades del sector publico (SERCOP): entidades, contratos (con renovaciones, adendas y adjuntos), puestos de servicio, horarios mensuales de guardias con generador automatico de patrones de rotacion, e informes mensuales generados desde una plantilla `.docx`. Backend en `backend/src/modules/contratacion-publica/`, frontend en `frontend/src/pages/contratacion-publica/`.

## Submodulos backend
| Submodulo | Responsabilidad |
|---|---|
| `entidades/` | CRUD de entidades publicas (nombre, RUC, direccion) |
| `contratos/` | CRUD de contratos, renovacion (enlaza `contratoOrigenId`), adendas, adjuntos |
| `puestos/` | Puestos de servicio por contrato, guardias asignados (snapshot cedula+nombre, sin FK a RRHH), patron de rotacion |
| `codigos-turno/` | Catalogo de codigos de turno por empresa (D/N/L, libre) |
| `horarios/` | Horario por rango de fechas, celdas guardia x dia, generador de patron, cobertura minima, export PDF/Excel |
| `informes/` | Informe mensual: datos autogenerados + texto redactado + plantilla `.docx` -> PDF |
| `textos-institucionales/` | Catalogo clave -> texto reutilizable en informes |

## Puesto de Servicio
```prisma
model CPPuestoServicio {
  nombre, tipoTurno (8H|12H|24H), cantidadGuardias
  guardiasSimultaneosRequeridos Int @default(1) // minimo de guardias "trabajando" cada dia
  guardias CPPuestoGuardia[]       // snapshot cedula+nombre
  patronRotacion CPPatronRotacion? // patron guardado, uno por puesto
}
```
`guardiasSimultaneosRequeridos` es independiente de si el puesto usa o no el generador automatico — aplica tambien a horarios llenados 100% a mano (ver "Cobertura minima" abajo).

## Codigos de Turno
```prisma
model CPCodigoTurno {
  codigo, nombre, color, activo
  esDescanso Boolean @default(false) // true = no cuenta como "trabajando" para la cobertura minima
}
```
Sin este flag no hay forma de saber que codigos son de trabajo vs descanso — es explicito, no se infiere por nombre/codigo.

## Horario Mensual — rango de fechas libre (no mes calendario)
Un horario real casi nunca es del 1 al 30/31 (ej. "30 de julio al 29 de agosto"). Por eso:
```prisma
model CPHorarioMensual {
  fechaInicio DateTime
  fechaFin    DateTime
  anio Int // derivado de fechaInicio, solo etiqueta para el cruce con Informes
  mes  Int // derivado de fechaInicio, idem
  estado String @default("BORRADOR") // BORRADOR, ENVIADO, APROBADO, RECHAZADO
}
model CPHorarioCelda {
  horarioId, puestoId, cedula, nombreGuardia, fecha, codigoTurno
  @@unique([horarioId, puestoId, cedula, fecha])
}
```
- **Sin solapamiento**: al crear un horario se valida que su rango `[fechaInicio, fechaFin]` no se cruce con el de NINGUN otro horario existente del mismo contrato (sin importar su estado) — `CPHorariosService.create` -> `assertSinSolapamiento`.
- Flujo de estados: `BORRADOR -> ENVIADO -> APROBADO/RECHAZADO`, `RECHAZADO -> BORRADOR`. Solo se edita en BORRADOR.
- `CPHorarioCelda` es una fila por celda guardia x dia (no columnas fisicas), asi el reemplazo en lote de un puesto es `deleteMany` + `createMany` (`reemplazarCeldasPuesto`).

## Generador de Patron de Rotacion
Autocompleta el mes/rango en vez de llenar celda por celda. Algoritmo puro en `backend/src/modules/contratacion-publica/shared/patron-rotacion.util.ts` (`calcularPatronRotacion`) — misma funcion usada para el preview (no persiste) y para la generacion real, para que nunca diverjan.

**Modelo del patron** (uno por puesto, `CPPatronRotacion`):
```prisma
model CPPatronRotacion {
  puestoId Int @unique
  tramos Json               // [{codigoTurno, dias}, ...] ciclo ordenado
  coberturaSimultanea Int   // cuantos guardias trabajan a la vez en cada tramo
  ordenGuardias Json        // [{cedula, nombreGuardia}, ...] define el desfase
  fechaInicioCiclo DateTime
}
```

**Algoritmo**: `cicloLongitud = suma de dias de los tramos`. `numGrupos = guardias / coberturaSimultanea` (debe ser entero, si no se bloquea). `desfaseDias = cicloLongitud / numGrupos` (debe ser entero, si no se bloquea — evitar que un dia quede con cobertura despareja). Grupo `g` arranca desfasado `g * desfaseDias` dias respecto al inicio del ciclo.

**Ejemplo verificado — 3 guardias, cobertura 1, patron 2D-2N-2L** (ciclo=6, 3 grupos, desfase=2):
| Guardia | Día 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| G1 | D | D | N | N | L | L | D | D |
| G2 | L | L | D | D | N | N | L | L |
| G3 | N | N | L | L | D | D | N | N |
Cada columna (dia) tiene exactamente 1D+1N+1L.

**Mismo patron, 6 guardias, cobertura 2** (2 guardias simultaneos por turno, ej. puesto que necesita pareja): mismos `numGrupos=3`/`desfase=2`, pero cada grupo tiene 2 guardias con el mismo codigo ese dia — cada columna queda con 2D+2N+2L.

**Endpoints** (`backend/src/modules/contratacion-publica/puestos/patron-rotacion.service.ts` + `horarios.service.ts`):
| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/contratacion-publica/puestos/:id/patron-rotacion` | Patron guardado del puesto, o `null` |
| PUT | `/contratacion-publica/puestos/:id/patron-rotacion` | Guarda/actualiza la configuracion (sin generar celdas) |
| POST | `/contratacion-publica/puestos/:id/patron-rotacion/preview` | Calcula sin persistir — usado por la mini-grilla del modal |
| POST | `/contratacion-publica/horarios/:id/generar-patron` | Calcula, guarda el patron (si `guardarComoPatronDelPuesto`, default true) y reemplaza las celdas del puesto en una transaccion |

Solo funciona con el horario en BORRADOR (`assertEditable`). Si el puesto ya tenia celdas cargadas ese periodo, el frontend pide confirmacion antes de llamar al endpoint (el backend no bloquea, solo sobreescribe — la decision de avisar es de UI).

## Cobertura minima de guardias simultaneos
Valida que, dia por dia, cada puesto tenga al menos `guardiasSimultaneosRequeridos` guardias con un codigo que NO este marcado `esDescanso`. **No se valida en cada edicion de celda ni en cada intercambio** (seria muy intrusivo) — se valida en un unico punto de control: `CPHorariosService.cambiarEstado` cuando la transicion es `BORRADOR -> ENVIADO`. Si hay incumplimientos, se bloquea la transicion completa y se devuelven **todos** los dias/puestos que fallan (no solo el primero), como un mensaje de error con una linea por incumplimiento (el frontend lo muestra con `white-space: pre-line`).

## Intercambio de turno
`POST /contratacion-publica/horarios/:id/intercambiar-turno` — intercambia el `codigoTurno` entre dos guardias del **mismo puesto** (el DTO exige `puestoId` explicito, para que nunca pueda cruzar celdas de puestos distintos) en una fecha puntual. Solo funciona en BORRADOR.

## Exportar PDF y Excel
`CPHorariosService.getPdfData` arma una estructura comun (`HorarioPdfData`: puestos -> guardias -> `porFecha`, mas `fechas` del rango real y `colorPorCodigo`), consumida por:
- `CPHorariosPdfService` (PDFKit, A4 apaisado) — `GET /horarios/:id/pdf`
- `CPHorariosExcelService` (ExcelJS, coloreando cada celda con el color del codigo de turno, igual que la UI) — `GET /horarios/:id/excel`

## Frontend
| Pagina/Componente | Ubicacion | Notas |
|---|---|---|
| `HorarioMensualList` | `pages/contratacion-publica/horarios/` | Crear horario pidiendo fecha inicio/fin (no mes calendario) |
| `HorarioMensualEditor` | idem | Grilla por fecha real, boton "Generar patron" por puesto, "Exportar PDF"/"Exportar Excel", intercambio de turno (con selector de puesto) |
| `GeneradorPatronModal` | idem | Editor de tramos y orden de guardias, preview en vivo, confirmacion de sobrescritura |
| `PuestoFormModal` | `pages/contratacion-publica/puestos/` | Campo "Guardias simultaneos requeridos" |
| `CodigosTurnoConfig` | `pages/contratacion-publica/config/` | Checkbox "Es descanso/libre" |

## Casos de uso de verificacion
### Validos
- 3 guardias/cobertura 1/patron 2D-2N-2L -> tabla exacta de arriba, envio (BORRADOR->ENVIADO) pasa.
- 6 guardias/cobertura 2/mismo patron -> cobertura doble por turno, envio pasa.
- Horario con rango 30 jul.-29 ago. (cruza mes calendario) se crea sin error.
- Puesto 24H con `guardiasSimultaneosRequeridos=2` llenado 100% a mano con 2 personas todos los dias -> envio pasa.
- Exportar el mismo horario a Excel y PDF -> mismo rango de fechas, codigos y colores.
- Abrir el generador para el mismo puesto en el periodo siguiente -> precarga el patron guardado.

### Invalidos (deben bloquear con mensaje especifico)
- Cobertura=2 con 5 guardias -> "La cantidad de guardias (5) debe ser multiplo de la cobertura simultanea (2)."
- Un tramo de 5 dias con 2 grupos de guardias (ciclo no divisible) -> error de desfase no entero (evita que un dia quede con cobertura despareja).
- Segundo horario del mismo contrato con rango que se solapa con uno existente -> rechazado, nombrando el horario en conflicto.
- Puesto 24H con `guardiasSimultaneosRequeridos=2` con un dia con solo 1 guardia trabajando -> bloquea el envio, listando el dia y puesto exactos.
- Generar patron, editar celdas o intercambiar turno sobre un horario que no esta en BORRADOR -> rechazado.
- Intercambiar turno con cedulas que no pertenecen al `puestoId` indicado -> rechazado.

## Plantilla del informe mensual: descarga real (2026-09-30)
Hasta esta fecha "Guardar" en Textos Institucionales solo guardaba el enlace; `docxPath` nunca se llenaba y "Generar PDF" del informe fallaba siempre con "La plantilla del informe mensual no está configurada". Ahora `upsertPlantilla` descarga el `.docx` al guardar (vía `common/utils/drive-docx.util.ts`, que prueba export de Google Docs y descarga directa) y, si el enlace no es público o no es un Word, rechaza el guardado con el motivo. Como el disco de Cloud Run se pierde al reciclarse la instancia, `generarPdf` vuelve a bajar la plantilla del enlace si el archivo ya no está. El enlace debe estar compartido como "Cualquier persona con el enlace".

## Submódulos ocultos (2026-10-01)
Desde esta fecha **solo "Entidades Públicas" está visible** en el menú. Contratos, Horarios, Informes, Códigos de Turno y Textos Institucionales siguen en el código y en la base, pero ocultos (decisión explícita del usuario: no se borran, se muestran más adelante; los informes pasarán a vivir dentro de la entidad).
- **Frontend**: la bandera `CP_MOSTRAR_SUBMODULOS_OCULTOS` de `App.tsx` (hoy `false`) apaga las rutas `/contratacion-publica/contratos*`, `/horarios*`, `/informes*` y `/config/*`; cualquier `/contratacion-publica/...` que no exista redirige a `/contratacion-publica/entidades`. `Sidebar.tsx` (`contratacionPublicaItems`) deja solo "Entidades Públicas".
- **Backend**: no se tocó nada de esos submódulos (endpoints, tablas, datos). Solo dejan de ser alcanzables desde la interfaz.
- **Agente Gemeseg**: el bloque `CONTRATACION_PUBLICA` de `backend/src/modules/ai/system-guide.util.ts` se reescribió para describir solo Entidades Públicas y las entregas; `system-guide.util.spec.ts` verifica que no mencione lo oculto. La guía completa anterior se recupera del historial de git (commit previo a este cambio).
- **Para reactivar**: bandera en `true`, devolver los ítems en `Sidebar.tsx`, restaurar la guía del agente y volver a apuntar el botón "Volver" de `EntidadesPublicasList.tsx`.
- Las secciones de arriba (patrón de rotación, cobertura mínima, intercambio, exportes, plantilla del informe) describen código que existe pero hoy no se usa desde la interfaz.

## Entregas de documentos de otras áreas (2026-10-01)
Para el informe mensual a cada entidad hacen falta documentos que producen otras áreas (RRHH, Financiero, Operaciones, Legal). Antes se pedían y se esperaban sin saber qué faltaba ni de quién. Este submódulo pide y sigue esas entregas **dentro de la entidad** (`/contratacion-publica/entidades/:id`). Alcance actual: solicitar y seguir; armar el paquete y enviarlo a la entidad quedan para después (ver "Backlog").

**Decisiones del usuario** (no re-proponer lo contrario):
- Los documentos se asocian a la **entidad**, no al contrato (una entidad puede pedir varios documentos, no solo contratos).
- **Cada mes es una solicitud independiente** (`CPSolicitudMensual`, única por entidad+año+mes): lo que se pide, las fechas (una por documento) y las personas cambian cada mes y se editan siempre, también ya enviada. No hay plantilla fija; "Copiar la solicitud anterior" duplica documentos, fechas (mismo día del mes, o el último si es más corto) y personas (solo las activas).
- Cada documento tiene **uno o más responsables** y su propia fecha límite. Contratación Pública **aprueba o rechaza** (el rechazo exige motivo).
- Entrega por **archivo o enlace**. Los archivos van a **Google Drive** (`<carpeta raíz>/<Entidad>/<AAAA-MM>/`), no al disco de Cloud Run (se borra al reciclar) ni a la base (costo y tamaño de `db-f1-micro`).
- Avisos por notificación **y** correo. Acceso por sección: las personas de otras áreas reciben **"ver"** en Contratación Pública (un usuario nuevo nace sin ningún permiso, hay que darle "ver" a mano); con solo "ver" únicamente ven y entregan lo que les asignaron.

**Modelos**: `CPSolicitudMensual` (BORRADOR/ENVIADA), `CPEntregaDocumento` (estado PENDIENTE/ENTREGADO/APROBADO/RECHAZADO, `fechaLimite` `@db.Date`, `origen` ARCHIVO/ENLACE, instantáneas de quién entregó/revisó sin FK, `ultimoRecordatorioAt`), `CPEntregaResponsable`. Migración idempotente `20261001_cp_entregas_documentos`.

**Reglas**:
- BORRADOR: nadie recibe avisos ni lo ve si solo tiene "ver". "Enviar" exige al menos un documento y responsable en todos; manda **un aviso por persona** con todos sus documentos.
- Con la solicitud ENVIADA: agregar a alguien -> aviso "Nuevo documento"; cambiar la fecha -> aviso a quienes se quedan y se reinicia el recordatorio; quitar a alguien -> pierde el acceso (sin aviso).
- Entregar: lo hace el responsable o el personal de CP; no se puede en BORRADOR ni sobre un APROBADO. Re-entregar limpia motivo y revisión. Aprobar solo desde ENTREGADO; rechazar desde ENTREGADO o APROBADO (así se reabre).
- Todos los avisos (`EntregasService.avisar`) son a prueba de fallos: un error al notificar o al mandar el correo se registra y no interrumpe la acción. Sin `NotificationConfig.senderEmail` solo hay aviso dentro del sistema.
- Fechas en zona horaria de Ecuador (`entregas.util.ts`).

**Recordatorios**: `POST /contratacion-publica/entregas-cron/recordatorios` con header `x-cron-secret` = variable `CRON_SECRET` (sin esa variable el endpoint responde 404; secreto mal -> 401). Lo llama **Cloud Scheduler** una vez al día: el servidor se apaga (`min-instances=0`), así que un `@Cron` interno no es confiable y el repo no usa ninguno. Recuerda PENDIENTE/RECHAZADO a 3 días del límite y el mismo día, una vez por día por documento.
- **Falta, a propósito, `CRON_SECRET` en `cloudbuild.yaml`**: si se agrega a `--set-secrets` sin que el secreto exista en Secret Manager, falla el despliegue del backend completo. Pasos: crear el secreto `CRON_SECRET`, darle acceso a la cuenta de servicio de Cloud Run, agregarlo a `--set-secrets`, y crear el trabajo de Cloud Scheduler (POST diario, ej. 07:00 `America/Guayaquil`, header `x-cron-secret`) contra `/api/contratacion-publica/entregas-cron/recordatorios`.

**Carpeta de Drive**: `FolderConfig` tipo `CP_ENTREGAS` (configurable, no fijada en código), editable desde el detalle de la entidad (`PUT .../entregas/carpeta`, usa `DriveService.saveConfig` que valida leyendo la carpeta). Debe estar compartida con la cuenta de servicio. Sin carpeta solo se pueden entregar enlaces.

**Endpoints** (`/contratacion-publica/entregas`): `GET|PUT carpeta`; `GET|POST entidades/:entidadId/solicitudes`; `GET|DELETE solicitudes/:id`; `POST solicitudes/:id/enviar`; `POST solicitudes/:id/documentos`; `PATCH|DELETE documentos/:id`; `POST documentos/:id/archivo` (sube a Drive, devuelve `{ url }`), `POST documentos/:id/entregar`, `.../aprobar`, `.../rechazar`. Escribir (armar, enviar, aprobar, rechazar, carpeta) = sección en `write`; listar, abrir, subir y entregar = `view` + comprobación en el servicio de que sea responsable (o tenga `write`).

**Frontend**: `pages/contratacion-publica/entidades/EntidadDetail.tsx` (lista de meses con avance + tabla de documentos con aprobar/rechazar/entregar/editar, copiar mes anterior, banner de la carpeta de Drive); `EntidadesPublicasList.tsx` abre el detalle al hacer clic en la fila. Reutiliza `FileOrLinkInput`, `PromptDialog`, `ConfirmDialog`, `RowActionsMenu`, `useResizableColumns`, `useSortableTable`. Los avisos enlazan a `/contratacion-publica/entidades/:id?solicitud=:sid`.

**Verificación local (2026-10-01)**: recorrido completo por API y por interfaz con un usuario de CP y otro de otra área con solo "ver" (nueva solicitud, duplicada, copia, agregar, enviar, entregar, rechazar, re-entregar, aprobar, cambio de personas y fechas, recordatorios sin repetir el mismo día, rutas ocultas redirigen). No se envió ningún correo real. Los specs (`entregas.util.spec.ts`, `entregas.service.spec.ts`) están escritos pero **no se han ejecutado todavía**.

### Backlog (anotado, no construido)
- Armar el paquete del mes (ZIP o PDF unido) y enviarlo a la entidad por correo desde el sistema.
- Abrir las solicitudes solas el día 1 de cada mes.
- Reactivar los submódulos ocultos (ver arriba).
- Los usuarios antiguos sin filas de `UserPermission` tienen "escribir" por defecto en toda sección (comportamiento del guard); para que una persona de otra área quede solo en "ver" hay que guardarle sus permisos.
