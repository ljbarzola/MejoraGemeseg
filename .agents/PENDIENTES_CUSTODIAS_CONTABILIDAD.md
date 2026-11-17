# Pendientes: Custodias dentro de Operaciones y Contabilidad (2026-11-16)

Estado: todo lo de esta lista está **solo en local / en la rama remota, sin desplegar**. Lo hecho está descrito en `AGENTS.md` («Contabilidad»), `.agents/modules/custodias.md` y `.agents/RECOMENDACIONES_UX_UI.md` (§26). Aquí solo van las decisiones abiertas y lo que falta.

## 1. Formato del «Rol de pago y matriz» (decisión de Leidy pendiente)

**Qué incomoda:** al elegir PDF o Excel en «Rol de pago y matriz» el resultado no se parece. Hay dos cosas distintas mezcladas: el *archivo* (PDF/Excel) y *lo que se exporta* (la matriz de todo el personal o el rol de una persona). Hoy el PDF y el Excel no muestran las mismas columnas ni el mismo orden, y la ventana no explica qué saldrá.

**Opciones propuestas** (la 3 + la 1 es la recomendada):
1. **Vista previa en la ventana:** al elegir «Documento» (todo el personal o una persona), mostrar debajo una tabla de ejemplo con las columnas que saldrán y una frase («Una fila por persona: viajes, subtotal, ajustes y neto»). Cambia al elegir otra opción. Solo explica; no cambia lo que se descarga.
2. **Mismo contenido, dos archivos:** la hoja principal del Excel idéntica a la tabla del PDF (mismas columnas y orden); los extras (detalle de viajes, ajustes) en hojas aparte con nombre claro. Así «cambiar de formato» solo cambia el archivo.
3. **Separar «qué» de «en qué archivo»:** primero «¿Qué necesitas?» (Matriz de todo el personal / Rol de una persona / Detalle de viajes), cada una con su descripción; después «Archivo» (PDF o Excel) como un selector chico. Un botón «Descargar».
4. **Una sola exportación configurable:** quitar la matriz especial y usar «Exportar» de Pagos (elegir columnas, agrupar por persona) para todo, dejando solo el rol individual en PDF con membrete.

Hay que decidir cuál, y si el rol individual debe llevar firma de recibido.

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
