# Módulo: Movimientos de Personal (entrada/salida de guardias)

Registro de casos de entrada y salida de guardias con checklist de sistemas externos. Reemplaza al viejo submódulo «Verificación». Contexto RRHH general: [recursos-humanos.md](recursos-humanos.md) (punto 6).

## Estado actual
Activo. Detalle de RRHH en recursos-humanos.md; este archivo tiene el del módulo.

## Disparador de ENTRADA: Reclutamiento
- El flujo real de contratación es «Marcar como Contratado» en Reclutamiento (`DriveService.contratarCandidato()`, ver [reclutamiento.md](reclutamiento.md)). Ahí se llama `movimientoPersonalService.crearEntrada({ cedula, nombreGuardia, companyId, userId, origen: 'RECLUTAMIENTO_CONTRATAR' })` dentro de `try/catch` con `Logger.error`: un fallo nunca debe romper la contratación. Idempotente: si ya hay un `ENTRADA` `EN_PROCESO` para esa cédula, lo reutiliza.
- El Kanban de Candidatos no existe (modelos, servicios, páginas eliminados; ver recursos-humanos.md punto 2). Casos viejos con `origen: 'KANBAN_COLUMNA:<nombre>'` siguen en el historial.
- `contratarCandidato()` solo bloquea una cédula con `EmployeeDriveFolder` si `MovimientoPersonalService.isActivo(companyId, cedula)` es `true`; un guardia que ya salió puede recontratarse (ver reclutamiento.md).

## Integración con Listado de Guardias: guardias «fuera»
- `MovimientoPersonalService.getCedulasFuera(companyId)` (`GET /personal/movimientos/guardias-fuera`): toma el movimiento más reciente por cédula (`createdAt desc`) y devuelve las cédulas cuyo más reciente es `SALIDA` + `COMPLETADO`. Salida `EN_PROCESO` o reingreso posterior (`ENTRADA` más reciente) no cuenta como fuera.
- `GuardiasList.tsx` (`/rrhh/guardias`) excluye esas cédulas de tabla y KPIs por defecto; botón «Mostrar guardias fuera (N)». Al mostrarlas: fila atenuada, etiqueta «Fuera», sin ícono de «Registrar salida».
- `CumplimientoEntidadService.getComplianceOverview` también las excluye de Cumplimiento.

## Cierre de `AsignacionGuardia` y relación con Drive
- `cerrarAsignacionSiSalidaCompletada(companyId, cedula, tipo)`: cuando una `SALIDA` pasa a `COMPLETADO` (en `toggleItem`, o al crearse sin sistemas configurados) cierra con `fechaFin = ahora` cualquier `AsignacionGuardia` activa de esa cédula. Nunca reabre: si el caso vuelve a `EN_PROCESO`, la asignación sigue cerrada (reabrir exige una `ENTRADA` nueva o que el sync la detecte en una carpeta).
- `crearSalida` nace `COMPLETADO` si la empresa no tiene `SistemaVerificacion` activo (si no, quedaría `EN_PROCESO` para siempre sin ítems que marcar).
- `DriveService.syncEntidadesFolder` llama a `getCedulasFuera` antes de reconciliar: una cédula «fuera» NUNCA recibe `AsignacionGuardia.create` nueva (ni al aparecer ni al rotar de entidad), pero sí se cierran sus asignaciones viejas. Se reporta en `SyncEntidadesResult.guardiasFueraConCarpetaActiva` y `GuardiasList.tsx` explica qué hacer (borrar/mover la carpeta, o registrar el reingreso). Movimientos gana sobre Drive: es la señal más deliberada.
- Cubierto por `movimiento-personal.service.spec.ts`, `cumplimiento-entidad.service.spec.ts` y `drive.service.spec.ts`.

## Por qué existe
RRHH registra/da de baja manualmente a cada guardia en 4 sistemas externos (IsyPlus, IESS, SUT, SICOSEP). El scraping automatizado se investigó y descartó (`backend/scraping-poc/README.md`). Es «verificación asistida»: una persona actúa en el portal y el sistema lleva la trazabilidad de qué falta y qué se hizo, por caso.

## Decisión central: es un REGISTRO, no un formulario de alta
No revertir sin volver a preguntar:
- No existe forma manual de crear una entrada: ni botón ni endpoint (`POST /personal/movimientos/entrada` no debe existir). Para dar de alta a un guardia: contratarlo desde Reclutamiento o subir su documentación a la carpeta de Drive de Guardias.
- La única vía de un caso `ENTRADA` es automática (contratar desde Reclutamiento).
- La única vía de un caso `SALIDA` es el ícono de salida en `GuardiasList.tsx` (alternativa real: borrar la carpeta de Drive).
- El catálogo `SistemaVerificacion` no tiene página propia: es el modal `ConfiguracionSistemasModal.tsx` en `/rrhh/movimientos` (botón «⚙ Configurar sistemas»). Nombre visible: «Configuración de Sistemas de Ingreso/Salida»; no usar «Sistemas de Verificación» ni crear una ruta independiente.

## Modelo de datos (Prisma)
- `SistemaVerificacion` (`id, nombre, urlPortal?, activo, orden, companyId`), único por `(companyId, nombre)`. Sembrado para GEMESEG: IsyPlus (sin URL), IESS, SUT, SICOSEP.
- `MovimientoPersonal` (`id, cedula, nombreGuardia, tipo: ENTRADA|SALIDA, estado: EN_PROCESO|COMPLETADO, origen, companyId, createdBy, createdAt, completadoAt?`): un caso por evento. `origen` es texto libre de trazabilidad: `RECLUTAMIENTO_CONTRATAR` (entradas), `MANUAL_GUARDIAS_LIST` (salidas).
- `MovimientoPersonalItem` (`id, movimientoId, sistemaVerificacionId?, nombreSistema, completado, notas?, completadoPor?, completadoAt?`): snapshot del catálogo al crear el caso (`nombreSistema` copiado); cambios posteriores del catálogo no afectan casos existentes.
- Las migraciones de este repo se escriben a mano (idempotentes: `IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object`) y se aplican con `prisma db execute --file`, no `migrate dev`: el historial tiene huecos que rompen el shadow DB.

## Backend
- `services/sistema-verificacion.service.ts`: CRUD del catálogo.
- `services/movimiento-personal.service.ts`: `crearEntrada`/`crearSalida` (idempotentes por cédula y tipo `EN_PROCESO`), `findAll`, `findOne`, `toggleItem` (si quedan todos completos el caso pasa a `COMPLETADO`; si se desmarca uno de un caso completado, vuelve a `EN_PROCESO`).
- `movimiento-personal.controller.ts`, rutas bajo `/personal` con `SectionPermissionGuard` + `@Section('RRHH', 'view'|'write')`: `GET/POST/PATCH/DELETE /sistemas-verificacion`, `GET /movimientos` (+`/:id`), `GET /movimientos/guardias-fuera`, `POST /movimientos/salida`, `PATCH /movimientos/:id/items/:itemId`.
- Gotcha: `/movimientos/guardias-fuera` debe declararse ANTES de `/movimientos/:id` o Nest la toma como `:id`.
- `personal.module.ts` cablea los servicios y el controller.
- `FOLDER_CONFIG_TYPES`/`TestDriveConnectionDto` viven en `dto/drive.dto.ts` (no son de este módulo).

## Frontend
- `frontend/src/services/movimiento-personal.service.ts`: no exportar `registrarEntrada`.
- `pages/personal/movimientos/MovimientosList.tsx` (`/rrhh/movimientos`): filtros tipo/estado/búsqueda, progreso `x/y`, botón de configurar sistemas; clic en fila abre `MovimientoDetalleModal`.
- `components/personal/MovimientoDetalleModal.tsx`: checklist (checkbox + notas por ítem). `ConfiguracionSistemasModal.tsx`: CRUD del catálogo.
- `pages/personal/GuardiasList.tsx`: botón de salida = ícono `LogOut` (lucide-react); abre un `ConfirmDialog` propio (nunca `window.confirm`) y, si se confirma, llama `registrarSalida({cedula, nombreGuardia})` y abre `MovimientoDetalleModal`. No hay modal de formulario.
- `PersonalDashboard.tsx`: un solo acceso «Movimientos de Personal» (`/rrhh/movimientos`). `Sidebar.tsx`: submenú «Guardias» → «Movimientos de Personal».
- `VerificacionPage.tsx`, `SistemasVerificacionConfig.tsx`, `RegistrarMovimientoModal.tsx` y la ruta `/rrhh/verificacion` no existen: cualquier referencia es residuo a limpiar, no a reintroducir.
