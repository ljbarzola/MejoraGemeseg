# Pendientes: Custodias dentro de Operaciones y Contabilidad (2026-11-16)

Estado: todo lo de esta lista está **solo en local / en la rama remota, sin desplegar**. Lo hecho está descrito en `AGENTS.md` («Contabilidad»), `.agents/modules/custodias.md` y `.agents/RECOMENDACIONES_UX_UI.md` (§26). Aquí solo van las decisiones abiertas y lo que falta.

## 1. Formato del «Rol de pago y matriz» (hecho 2026-11-16, falta que Leidy lo pruebe)

Leidy eligió la opción 3 + 1: la ventana pregunta primero «¿Qué necesitas?» (matriz de todo el personal, rol de una persona, detalle de viajes y, conservada de antes, la matriz cronológica), muestra «Así saldrá» con las columnas y al final pide el archivo (PDF o Excel). El PDF y la primera hoja del Excel de cada contenido traen las mismas columnas. El «Así saldrá» usa un ejemplo fijo, no datos reales.

Pendiente de decidir: si el rol de pago individual debe llevar una línea de **firma de recibido** (hoy no la tiene).

## 2. Operaciones elige o crea al personal del viaje (hecho 2026-11-17, falta que Leidy lo pruebe)

Hecho: en el formulario del viaje, el chofer y los custodios se buscan escribiendo (nombre o cédula) entre los Guardias de RRHH; solo se elige o se crea (ya no se guarda un nombre suelto sin cédula). Al pie de la lista, «¿No existe? Créalo aquí» abre «Crear persona» (nombre y cédula o documento obligatorios; teléfono, correo, dirección y contacto de emergencia opcionales). La persona queda elegida, aparece en RRHH › Guardias con la etiqueta «Sin carpeta» y RRHH recibe una notificación en la app. No escribe nada en Drive y no necesitó migración (`folderId` y `folderUrl` entran vacíos). Detalle en `.agents/modules/custodias.md`, «Personal desde Operaciones».

Decisiones de Leidy (no se reabren):
- **Una sola lista**, sin distinguir guardias de custodios: son guardias, quien es chofer puede ser custodio y al revés (lo repitió el 2026-11-17).
- **Solo elegir o crear**, no escribir nombres sueltos.
- **Cédula o documento libre y OPCIONAL** (cualquier país, 5 a 20 caracteres si se escribe; no solo 10 dígitos). Aplicado en Operaciones y en las fichas de guardias y de personal administrativo. Se decidió opcional el 2026-11-17 tras ver que los 14 guardias de producción no tienen cédula cargada: el selector los ofrece como «Sin cédula» y el viaje guarda cédula vacía y nombre.
- **Mostrar la entidad del custodio en el formulario del viaje:** no es necesario por ahora; anotado para el futuro (el dato existe: `AsignacionGuardia`).

Falta:
- **Documentos reales en producción (revisado el 2026-11-17, solo lectura y solo conteos):** los 14 guardias (`folderType CUSTODIAS`) tienen clave interna `ID-…` («Sin cédula»); hay 1 de personal administrativo; de 2 fichas de guardias, 1 tiene cédula de 10 dígitos y 1 clave interna; y no hay ningún viaje de custodia todavía. Con la cédula opcional el selector ya ofrece a esos 14. Falta que RRHH cargue sus documentos en la ficha (no urge para Operaciones).
- **Otros lugares que todavía exigen 10 dígitos** (no se tocaron a propósito; cambiarlos exige decidir y probar con Drive real): la validación de postulación (`postulacion-validacion.util.ts` y su espejo del frontend, compartida con el portal público de postulación, otro repositorio); la lectura de la cédula desde el nombre de la carpeta y el JSON de Drive (`DriveService`: `parseEmployeeFolderName`, `leerCedulaDeJsonEnCarpeta`, `cedulaConfiable`), que decide qué es una cédula real y qué recibe la clave `ID-…`; la detección de una cédula en las preguntas al Agente de Custodia (`ai-custodias.queries.ts`); y el filtro del Google Ads del CRM (que usa 10 dígitos para otra cosa: el ID de cliente de Google). Una persona con documento no numérico queda sin reconocer en la sincronización de Drive (deja un aviso de «identidad ignorada» en cada sincronización, sin perder datos).
- **Botón «Crear carpeta» en RRHH:** hoy RRHH crea la carpeta a mano en Drive y, al sincronizar, la persona queda duplicada (con y sin carpeta) y se une con «Unir cédulas», porque el nombre de la carpeta no lleva la cédula. Hacerlo desde la app toca el Drive real (crear la carpeta «Apellidos Nombres», escribir su `Datos_Personales` con el documento y guardar `folderId`), así que se construye con cuidado y se prueba con una carpeta de prueba, no desde local contra el Drive de la empresa.
- **Viajes sin cédula:** con la cédula opcional ya no hay nada que exigir en el servidor; lo que sí se comprueba (pantalla y servidor) es que la misma persona no vaya dos veces en un viaje, por cédula o, si falta, por nombre.
- **Pruebas que ya fallaban por otra vía** (no son de esto): `system-guide.util.spec.ts` (texto de «Metas» de Ventas), `agents.service.trabajadores.spec.ts` (falta `BITACORA_RESUMEN` en lo esperado) y `bitacora-extension.service.spec.ts` (Bitácora).

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
