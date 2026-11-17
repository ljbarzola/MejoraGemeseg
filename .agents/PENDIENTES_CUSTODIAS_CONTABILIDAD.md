# Pendientes: Custodias dentro de Operaciones y Contabilidad (2026-11-16)

Estado: todo lo de esta lista está **solo en local / en la rama remota, sin desplegar**. Lo hecho está descrito en `AGENTS.md` («Contabilidad»), `.agents/modules/custodias.md` y `.agents/RECOMENDACIONES_UX_UI.md` (§26). Aquí solo van las decisiones abiertas y lo que falta.

## 1. Formato del «Rol de pago y matriz» (hecho 2026-11-16, falta que Leidy lo pruebe)

Leidy eligió la opción 3 + 1: la ventana pregunta primero «¿Qué necesitas?» (matriz de todo el personal, rol de una persona, detalle de viajes y, conservada de antes, la matriz cronológica), muestra «Así saldrá» con las columnas y al final pide el archivo (PDF o Excel). El PDF y la primera hoja del Excel de cada contenido traen las mismas columnas. El «Así saldrá» usa un ejemplo fijo, no datos reales.

Pendiente de decidir: si el rol de pago individual debe llevar una línea de **firma de recibido** (hoy no la tiene).

## 2. Operaciones ve la entidad del custodio y puede añadir personas (idea de Leidy, aprobada solo si es sencilla)

Leidy dijo que lo ve bien «mientras sea solo un anuncio y una opción de crear carpeta y no arruina nada más».

- **Ver la entidad:** ya existe el dato (`AsignacionGuardia` por cédula, de Contratación Pública). Operaciones solo lo leería y lo mostraría junto al custodio en el formulario del viaje y en Viajes.
- **Añadir una persona que falta:** hoy `EmployeeDriveFolder.folderId` y `folderUrl` son NOT NULL, así que hace falta un estado «pendiente de carpeta» (cambio aditivo y con columnas que acepten null) y que los listados de RRHH no se rompan con esas fichas.
- **Aviso a RRHH:** una notificación en la app «Custodias creó a esta persona» con un botón «Crear carpeta» que corra el flujo normal de RRHH. Nada más cambia.
- **Cuidar:** quién puede crear personas desde Operaciones; que la cédula no se repita contra la que RRHH cargue después; no tocar fichas existentes.
- **Cómo hacerlo:** sesión aparte, con migración (nuevas columnas + arranque con `ADD COLUMN IF NOT EXISTS`, ver `CLAUDE.md`).

## 3. Permisos: ¿fusionar `CUSTODIAS` con `OPERACIONES`?

Esta vuelta fue solo de menú y pantallas. La sección de permisos `CUSTODIAS` sigue existiendo (y el Agente de Custodia la usa). Decidir si más adelante se fusiona con `OPERACIONES`; implica migrar los permisos por usuario ya guardados y revisar `section.decorator`/`PermissionsService`.

## 4. Antes de desplegar Contabilidad / Custodias

- Comprobar en solo lectura que producción no tiene custodias con datos que dependan del esquema viejo (los viajes ya existentes siguen funcionando; solo cambian el menú y el dinero).
- Un super admin debe encender `CONTABILIDAD` por empresa (cerrada por defecto) y dar permiso a quien corresponda.
- **Ejecutar `npm test` del backend** (las specs de Custodias y Contabilidad están escritas y NO se han corrido; falta también `npm test -- system-guide`).
- Limpiar los datos de prueba locales (viajes `ZZ-PRUEBA-1..3`; el descuento de $50 en ZZ-PRUEBA-2 no lo creé yo, preguntar antes de borrarlo).
- Crear `.agents/modules/contabilidad.md` (hoy el detalle está en `AGENTS.md`).
- Los ajustes sueltos (sin viaje) no entran al «Registrar pagos»: solo cuentan en el rol de pago y en el dashboard. Decidir si deben poder marcarse como pagados.

## 5. No probado en pantalla

- «Registrar pagos (N)» con varias filas a la vez (se probó una).
- «Corregir día o referencia» de un pago registrado (solo se vio el menú).
- Editar y eliminar desde la ventana nueva «Extras y descuentos» (se probó antes en la pantalla vieja).
- Aviso de «Tarifas» al editar una tarifa que ya rige.
- Contenido del Excel del rol de pago (se descargó, pero no se abrió).
- Menú de Operaciones para alguien con `CUSTODIAS` pero sin `OPERACIONES` (por código se ve solo «Resumen» y «Viajes»; no se probó con otro usuario).
