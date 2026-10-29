// Manual de uso del sistema que recibe Agente Gemeseg, escrito desde la
// interfaz (nombres de menú y botones tal como se ven en pantalla).
//
// Por qué vive en código y no solo en la Base de Conocimiento
// (/sistemas/base-conocimiento): hasta 2026-09-30 el "cómo se usa cada
// módulo" dependía de que un admin lo escribiera a mano ahí, y como nadie lo
// había hecho el agente contestaba "No tengo información sobre cómo usar el
// módulo" incluso para módulos a los que el usuario sí tenía acceso. Este
// manual es la base que siempre está; la Base de Conocimiento queda para lo
// propio de cada empresa (políticas, contactos, procesos internos), y se
// suma encima.
//
// Mismo criterio de privacidad que capabilities-prompt.util.ts: cada bloque
// se entrega solo si el usuario puede ver esa sección AHORA. El bloque
// GENERAL lo recibe todo el mundo, así que NO debe nombrar ningún módulo con
// permiso (Cacao, Custodias, Ventas, Contratación Pública, ni el módulo de
// gestión de RRHH) — el spec lo verifica.
//
// Cuando cambie una pantalla, actualizar su bloque acá (y el spec si cambia
// qué bloque ve quién).

const GENERAL = `# Uso general del sistema (lo que ve todo usuario)

## Entrar al sistema
- En la pantalla "Iniciar sesión" se escribe el "Correo electrónico" y la "Contraseña". Al escribir el correo aparecen el logo y los colores de la empresa.
- ¿Olvidaste tu contraseña?: en "¿Olvidaste tu contraseña?" se escribe el correo, llega un "Código de 6 dígitos" al correo, y con ese código se pone la "Nueva contraseña" (mínimo 8 caracteres). Al terminar se cierran las sesiones que hubiera abiertas en otros dispositivos.
- Al entrar, el sistema abre la primera pantalla que la persona tiene habilitada (normalmente "Inicio").
- Si aparece "Tu usuario todavía no tiene ningún módulo habilitado", hay que pedirle al administrador de la empresa que active secciones desde Administración → Permisos de usuario.

## El menú lateral
- Siempre visibles para todos: "Inicio", "Buzón de Quejas y Sugerencias", "Encuestas" y "Proyectos".
- Otras opciones aparecen solo si el administrador le dio acceso a esa persona. Si alguien necesita una opción que no ve, debe pedir el permiso (ver "Pedir ayuda o un permiso").
- Los botones « y » contraen o expanden el menú. En el celular se abre con ☰.
- Abajo está el avatar con el nombre y el cargo; al hacer clic abre "Mi perfil". El botón "Salir" cierra la sesión.

## Botones que están en todas las pantallas
- Campana (Notificaciones): el globo rojo indica cuántas hay sin leer. Al hacer clic en una, se marca como leída y lleva a donde corresponde. "Marcar todas como leídas" limpia el contador. Hoy llegan notificaciones cuando te asignan una encuesta ("Nueva encuesta pendiente") y cuando un cliente que referiste cambia de etapa ("Actualización de tu referido"). También llegan avisos cuando te asignan un documento para entregar y cuando te lo aprueban o rechazan. Las que dicen que tienes algo pendiente llegan también por correo. No hay notificaciones de tareas ni de proyectos.
- Llave inglesa ("Reportar un problema a Sistemas"): abre "Reportar a Sistemas". Se elige el Tipo ("Reportar un error", "Sugerir una mejora", "Pedir un permiso" u "Otro"), se escribe Título y Descripción (obligatorios), y opcionalmente se adjuntan enlaces o archivos (hasta 10 MB) con "+ Agregar". Se envía con "Enviar reporte". Es la forma oficial de reportar fallas y pedir permisos.
- Burbuja 💬 ("Abrir agente"): abre este chat con Agente Gemeseg. "+ Nueva" inicia otra conversación; el 🗑️ la elimina. Arriba (▼) se puede cambiar a otro agente si hay agentes personalizados.

## Mi perfil
- Muestra: nombre, rol (Administrador, Gerente o Empleado), correo corporativo, documento de identidad, cargo, teléfono, departamento, fecha de ingreso, contadores de proyectos y tareas, y "Herramientas asignadas".
- En "Recordatorios de tareas" eliges cómo te avisamos antes de que venza una tarea: "Notificaciones en la app y correo" (por defecto) o "Solo notificaciones en la app" (sin correo); se guarda al elegir. Las notificaciones en la app son las del ícono de campana, arriba a la derecha, y siempre funcionan aunque pidas no recibir correo. Si varias tareas coinciden el mismo día, el correo las reúne todas y nunca llega más de uno al día; el asunto empieza con "[Tareas GEMESEG]" por si quieres crear un filtro en tu correo.
- Desde el perfil solo se edita el teléfono (junto a "Teléfono", botón "Agregar" o "Editar" → escribir el número → "Guardar"; vacío lo borra); el resto de los datos personales (nombre, correo, cargo...) los cambia el administrador. También se cambia la contraseña: al final de la tarjeta, en "Seguridad", el botón "Cambiar contraseña" abre un cuadro con Contraseña actual, Contraseña nueva (mínimo 8 caracteres) y repetirla; cada campo tiene un ojito para ver lo escrito. Al guardar se cierra la sesión en todos los demás dispositivos; en el que se está usando sigue abierta. Las cuentas que entran solo con Google no tienen contraseña: ahí el perfil indica usar "¿Olvidaste tu contraseña?" para crear una.

## Inicio
En este orden:
1. Si tienes encuestas por responder, un aviso azul: "Tienes N encuesta(s) pendiente(s) por responder — click para verla(s)".
2. La tarjeta "¿Conoces a alguien interesado en Gemeseg?" con el botón "Referir un cliente".
3. "Mis tareas", con el botón "+ Nueva tarea".

## Referir un cliente (referidos) — cualquier usuario puede hacerlo
- Dónde: en "Inicio", tarjeta "¿Conoces a alguien interesado en Gemeseg?" → botón "Referir un cliente".
- Se abre "Mis Referidos": la lista de las personas que ya referiste, con la fecha y la etapa en que va cada una (con su color). Si está vacía dice "Todavía no has referido a nadie."
- Para referir: "+ Referir un cliente" → llenar "Nombre completo *" (mínimo 3 letras), "Celular", "Correo", "Servicios que necesita (opcional)" (casillas agrupadas por categoría para marcar uno o varios; son los servicios activos de Ventas → Configuración → Servicios, así que si Ventas desactiva uno deja de aparecer) y "Nota" (cualquier detalle útil: qué necesita, cuándo llamarlo, cómo lo conoces) → "Enviar referido". Aparece "Referido enviado. Ventas se pondrá en contacto."
- Qué pasa después: el equipo comercial recibe al cliente en su lista y alguien lo toma para atenderlo. Cada vez que ese cliente avanza de etapa, te llega una notificación en la campana ("Tu referido X pasó a la etapa Y"), solo dentro de la app (no se manda correo); al abrirla se abre directo "Mis Referidos".
- Consejos: pon al menos celular o correo para que puedan contactarlo; revisa "Mis Referidos" para ver en qué va. Quien refiere no ve montos ni datos comerciales del cliente.

## Mi hoja del día — solo si te la activaron
- Es un registro automático de tu actividad (lo que haces en app.gemeseg y el inicio de sesión y el uso de Drive de tu cuenta de Google), sin que tengas que escribir nada. Por defecto nadie la tiene: un administrador o gerente de la empresa decide a quién se la activa. Cuando te la activan te llega una notificación en la campana ("Se activó tu hoja del día") y en el menú aparece "Bitácora" → "Mi hoja del día"; si te la desactivan te avisa igual y lo registrado antes sigue disponible ahí.
- Ahí se elige el día (flechas, calendario o "Hoy") y se ve tu primera y última actividad, los huecos largos sin actividad y la lista de lo registrado, en hora de Ecuador. Es exactamente lo mismo que puede consultar quien tiene permiso para ver la del equipo. Solo se registra desde el momento en que te la activan, nunca lo anterior.
- No guarda capturas ni lo que escribes: solo qué acción hiciste (por ejemplo "Editó tarea: «Informe»"). Tampoco ve lo que hagas fuera de app.gemeseg y de tu cuenta de Google (Word o Excel en tu computador, otras páginas).
- Si no ves "Bitácora" → "Mi hoja del día" en el menú, es que todavía no te la han activado.

## Buzón de Quejas y Sugerencias — cualquier usuario
- Dónde: menú lateral → "Buzón de Quejas y Sugerencias".
- Cómo: escribir la "Descripción *" (mínimo 5 caracteres) y llenar los campos adicionales que la empresa haya configurado (los que tienen * son obligatorios) → "Enviar". Aparece "Tu queja o sugerencia fue enviada. El equipo de RRHH la revisará."
- Anonimato: si marcas "Enviar de forma anónima", el sistema NO guarda quién la envió, en ningún lado. Nadie puede saber que fuiste tú.
- Seguimiento: por diseño (para proteger el anonimato) no existe una lista de "mis quejas", y el sistema no envía notificaciones ni respuestas al empleado. Si necesitas saber en qué quedó, hay que consultarlo directamente con el equipo de RRHH (o enviarla con tu nombre para que puedan contactarte).
- Si aparece "Esta empresa no tiene configurada una etapa inicial para las quejas. Contacta a RRHH.", es un tema de configuración: avisa a RRHH.

## Encuestas — cualquier usuario
- Cómo te enteras: aviso azul en "Inicio", notificación en la campana ("Nueva encuesta pendiente") y un correo.
- Dónde: menú lateral → "Encuestas" → sección "Pendientes por responder" → botón "Responder".
- Responder: contestar las preguntas (las que tienen * son obligatorias). Pueden ser de texto, de opción única, de opción múltiple o de calificación del 1 al 5. Luego "Enviar respuesta". Aparece "¡Gracias! Tu respuesta fue registrada."
- Reglas: cada encuesta se responde una sola vez y la respuesta queda con tu nombre (las encuestas de la app no son anónimas). Solo ves las encuestas en las que te eligieron como destinatario. Si dice "No tienes encuestas pendientes." es que no hay ninguna por responder.
- Algunas encuestas se responden por un enlace público (sin cuenta), por ejemplo para personal sin usuario o proveedores; se abren directo en el navegador del celular o la computadora.

## Proyectos y Tareas
### Ver proyectos
- Menú → "Proyectos". Filtros por estado: Todos, Activo, En pausa, Completado, Cancelado. Cada tarjeta muestra número de tareas, miembros, "Vence" y "Creado por". Se pagina con "Anterior"/"Siguiente".
- Quién ve qué: el Administrador ve todos los proyectos de la empresa; cualquier otra persona (Gerente o Empleado) ve solo los que creó o en los que es miembro. Si no ves un proyecto, pide a su Propietario que te agregue como miembro.

### Crear un proyecto
- "Proyectos" → "+ Nuevo proyecto" → "Nombre del proyecto *", Descripción, Fecha de inicio y Fecha de fin (la de fin no puede ser anterior a la de inicio) → "Crear proyecto".
- Cualquier usuario puede crear proyectos; quien lo crea queda como Propietario.

### Dentro de un proyecto
- "Editar" (Propietario, Miembro o Administrador): nombre, descripción, fechas y estado (Activo, En pausa, Completado, Cancelado) → "Guardar cambios".
- "Eliminar proyecto": solo el Propietario o un Administrador.
- "Miembros (N)" → "+ Agregar miembro" (Propietario o Administrador): elegir el Usuario (activo y de la misma empresa) y el "Rol en el proyecto":
  - Propietario: control total del proyecto (editar, eliminar, gestionar miembros).
  - Miembro: puede editar el proyecto y crear/editar tareas.
  - Observador: solo mira; no puede crear ni modificar tareas.
  Se quita un miembro con la ✕. No se puede quitar al último Propietario. Cambiar el rol de alguien ya agregado lo puede hacer solo un Administrador.
- "Tareas (N)": tabla con #, Título, Estado, Prioridad, Asignado, Fecha inicio y Fecha fin. Botones "Columnas" (elige qué columnas ver), "Ver tablero Kanban" y "+ Nueva tarea". Un clic en el encabezado de una columna ordena la tabla (la flechita ⇅ indica que se puede; otro clic invierte el orden) y arrastrando el borde entre dos encabezados se cambia el ancho.

### Crear una tarea
- Desde "Inicio" ("+ Nueva tarea"), desde el proyecto ("+ Nueva tarea") o desde su tablero Kanban. Se abre como una ventana encima de la pantalla.
- Campos: "Proyecto *", "Título *", Descripción, Prioridad (Baja, Media, Alta, Urgente), Horas estimadas, Fecha inicio, Fecha fin, "Asignar a" (se pueden elegir varios miembros del proyecto) y Estado inicial → "Crear tarea".
- Solo se puede asignar a personas que sean miembros del proyecto: si no aparece alguien, primero hay que agregarlo en "Miembros".

### Estados de una tarea y cómo moverla
- Por hacer → En progreso → En revisión → Completado.
- En el tablero Kanban ("Ver tablero Kanban") hay 4 columnas; el botón ▶ de cada tarjeta la pasa a la columna siguiente (no se arrastra).
- Sin abrir la tarea: en las listas (Inicio y la tabla "Tareas (N)" del proyecto) el Estado es un botón; haces clic, eliges el nuevo estado (Por hacer, En progreso, En revisión o Completado) y se guarda al instante. Si no se puede guardar, vuelve al estado anterior y avisa. Los Observadores del proyecto no pueden cambiarlo.
- Abriendo la tarea (clic en ella desde Inicio, el proyecto o el tablero): se abre una ventana "Tarea #N" encima de la pantalla donde estabas, no una página nueva. Ahí se editan todos los campos, incluido el Estado (4 botones) → "Guardar", que cierra la ventana y refresca la lista. "Eliminar tarea" la borra y "Cancelar" cierra (los Observadores ven "Cerrar"). Si cierras con cambios sin guardar, el sistema pregunta si guardar o descartar.
- Las tareas no tienen comentarios; para dejar notas se usa la Descripción. La fecha que se muestra como vencimiento es la "Fecha fin".

### "Mis tareas" en Inicio
- Botones de estado: Todos, Por hacer, En progreso (filtro por defecto), En revisión, Completado. Casilla "Asignadas a mí" y selector "Todos los proyectos" (lista todos tus proyectos). El sistema recuerda tus filtros; si el proyecto que tenías elegido ya no está en tu lista, ese filtro se quita solo.
- "Asignadas a mí" es un botón que se enciende y se apaga. Junto a los filtros está el botón "Columnas" (elige qué columnas ver: Estado, Prioridad, Proyecto, Asignados, Inicio, Fin, Horas est.; por defecto salen Estado, Prioridad, Proyecto, Asignados y Fin). La fecha de la columna "Fin" se pone roja con "Vencida" si ya pasó y naranja con "Vence hoy" o "Vence mañana" en las tareas abiertas.
- Sin "Asignadas a mí" se listan las tareas de todos los proyectos donde eres miembro. Se ordena con clic en los encabezados y se cambia el ancho arrastrando el borde de una columna. Clic en la fila abre la tarea en una ventana; clic en el estado de la fila lo cambia sin abrirla; clic en el proyecto abre el proyecto.
- Si "no ves tus tareas": pasa a "Todos" (el estado que viene por defecto es "En progreso", que oculta las de "Por hacer"), apaga "Asignadas a mí", deja "Todos los proyectos" y comprueba que seas miembro del proyecto.

### Quién puede qué en Proyectos
- Administrador: todo en todos los proyectos de la empresa.
- Gerente y Empleado: exactamente lo mismo entre sí; dependen del rol que tengan dentro de cada proyecto (Propietario, Miembro u Observador).

## Pedir ayuda o un permiso
- Para un permiso o acceso a una opción que no ves: llave inglesa → Tipo "Pedir un permiso", o directamente con el administrador de tu empresa.
- Para un error: llave inglesa → "Reportar un error", explicando qué hiciste, qué esperabas y qué pasó; si puedes, adjunta una captura.

## Preguntas frecuentes de quien recién empieza
- "¿Por dónde empiezo?": revisa "Inicio" (encuestas pendientes y tus tareas), luego "Proyectos" para ver en qué participas.
- "¿Cómo creo una tarea para un compañero?": el compañero debe ser miembro del proyecto; luego "+ Nueva tarea" y en "Asignar a" lo eliges.
- "¿Por qué no puedo crear tareas en un proyecto?": probablemente eres Observador; pide al Propietario que te cambie a Miembro (el cambio de rol lo hace un Administrador).
- "¿Mi queja anónima es de verdad anónima?": sí, con la casilla marcada no se guarda el autor.
- "¿Cómo sé en qué va mi referido?": Inicio → "Referir un cliente" abre "Mis Referidos" con la etapa actual; además te llega notificación en cada cambio.
- "¿Dónde cambio mi contraseña?": con la sesión iniciada, en el Perfil (abajo, en "Seguridad", botón "Cambiar contraseña"). Si no la recuerdas, en la pantalla de inicio de sesión, "¿Olvidaste tu contraseña?". En ambos casos se cierran las sesiones abiertas en otros dispositivos.
- "No veo una opción que usa mi compañero": es un tema de permisos; pídelo por la llave inglesa ("Pedir un permiso") o al administrador.`;

const RRHH = `# Recursos Humanos (gestión) — guía detallada

## Acceso
- Menú → grupo "Recursos Humanos": "Dashboard", "Reclutamiento", "Personal Administrativo", "Capacitaciones", "Gestión de Quejas y Sugerencias", "Gestión de Encuestas", y el subgrupo "Guardias": "Listado de Guardias", "Contratos", "Entidades y Requisitos", "Cumplimiento", "Historial".
- Permiso "ver" muestra los listados; los botones de acción (sincronizar, configurar, editar, contratar, analizar con IA, nueva capacitación, etc.) aparecen solo con permiso de escritura. "Gestión de Quejas" y "Gestión de Encuestas" quedan en blanco sin escritura. "Fusionar cédulas duplicadas" es solo para rol Administrador.
- El ícono (?) "Cómo funciona Recursos Humanos" en el Dashboard abre la guía de pasos.

## Cómo se relacionan las pantallas (flujo completo de un guardia)
1. Reclutamiento: se crea la vacante (Guardia o Administrativo); el postulante sube sus documentos a su carpeta de Drive; se pulsa "Sincronizar"; se revisa el expediente (aprobar/rechazar, con ayuda de IA) y se pulsa "Marcar como Contratado".
2. Automático al contratar: la carpeta pasa a Guardias → "Sin Asignar" (o a Personal Administrativo) y se crea un caso de ENTRADA en Historial.
3. Listado de Guardias: se asigna la entidad donde trabajará ("Asignar a una entidad") y se completa su "Ficha personal" (correo de contacto, horario, salario).
4. Entidades y Requisitos define qué documentos exige cada entidad; Cumplimiento compara lo que tiene cada guardia contra eso, se aprueban/rechazan documentos y se envían recordatorios.
5. Contratos genera documentos (contratos, actas) en PDF con los datos de la ficha y la entidad.
6. Capacitaciones registra el plan de capacitación general (no por guardia).
7. Salida: "Registrar salida" → en Historial se marcan los sistemas (IESS, SUT, etc.) → el caso se completa solo → "Archivar carpeta" → el guardia queda "Fuera" → opcional "Quitar de la lista".
Quejas y Encuestas son independientes de lo anterior (trabajan con usuarios con cuenta, o con enlace público en encuestas).
Los guardias de este padrón son los mismos que se eligen como personal en otros módulos operativos de la empresa.

## Dashboard de Personal
- "Requiere tu atención" (tarjetas en color si hay algo; clic lleva a la pantalla): "Guardias sin asignación", "Documentos vencidos o por vencer", "Movimientos en proceso", "Capacitaciones vencidas", "Capacitaciones por vencer" (próximos 30 días).
- "Resumen general": "Vacantes Abiertas", "Documentos Pendientes". "Accesos Directos" a las pantallas principales.
- Si Guardias o Personal Administrativo llevan 7 días o más sin sincronizar con Drive aparece un aviso para abrir ese listado y pulsar Sincronizar.

## Reclutamiento ("Reclutamiento y Vacantes")
- Cabecera: "Sincronizar" (trae postulantes desde la carpeta de Drive de Reclutamiento), "Ver carpeta", "Última sincronización". La lista queda guardada entre recargas.
- Vacantes ("Vacantes Creadas"): "+ Nueva Vacante"; "Mostrar cerradas / Ocultar cerradas". En cada tarjeta: estado "● Abierta/● Cerrada" (clic para cambiar), etiqueta "Administrativo" si aplica, íconos Editar / Duplicar / Eliminar (eliminar manda la carpeta a la papelera de Drive, recuperable), "Formulario (n)", "Archivos Requeridos (n)", "Sincronizado con Drive JSON" o "⚠ No sincronizado con Drive". Para dejar de recibir postulantes se marca "Cerrada" (no hace falta borrarla).
- Crear/editar vacante: "Nombre del puesto *", "Descripción"; "Al contratar, esta persona entra como *": Guardia o Personal administrativo (define a qué carpeta irá). "Datos que debe llenar": Apellidos y Nombres fijos (con ellos se nombra la carpeta), más campos con "Tipo de dato" y Obligatorio/Opcional (por defecto Cédula, Celular, Correo electrónico). "Documentos que debe subir": nombre, "Formatos que acepta" (vacío = cualquiera), Obligatorio/Opcional (ej. Hoja de Vida, Antecedentes Penales, Título de Bachiller).
- Candidatos ("Candidatos Postulados"): buscador por nombre, cédula o puesto; columnas Candidato, Cédula, Puesto Aplicado, Documentos, Estado ("n rechazados", "n por revisar" o "Completo") y "Ver".
- "Expediente del Candidato":
  - "Datos del Postulante" con % de completitud; "Editar" corrige datos (se guardan en el candidato.json de Drive).
  - Checklist de documentos: "✔ Aprobar" / "✖ Rechazar" (pide motivo; hay motivos rápidos como "Documento ilegible", "Documento caducado", "Falta firma o sello", "No corresponde al tipo solicitado").
  - "Revisar con IA": indica si cada archivo es realmente el documento pedido (confianza alta, media o baja) y qué parece ser cada archivo adicional. Es una ayuda: la decisión final es de RRHH.
  - "Archivos Adicionales": se puede asignar un archivo a un documento requerido ("Es el documento…" → "Asignar"); en PDFs aparece "Analizar con IA".
  - Si el postulante subió todo en un solo PDF ("Entregó todo en un solo archivo"): "Analizar con IA" muestra miniaturas de las páginas y propone qué documento es cada página; RRHH revisa, corrige y confirma, y recién ahí se separa el PDF (el original se conserva). Si la IA falla, se etiqueta a mano.
  - Pie: "Ver Carpeta en Drive" y "Marcar como Contratado" (confirmar "Sí, marcar como contratado").
- Al contratar se bloquea si: la carpeta de destino no está configurada; la cédula ya existe como guardia activo (recontratar a alguien que ya salió sí se permite); en administrativos, si ya existe otra persona con el mismo nombre.
- Las carpetas de cada persona en Drive se llaman "Apellidos Nombres" (sin guion, sin cédula, sin puesto).

## Listado de Guardias
- Cabecera (con escritura): "Sincronizar Drive", "Última sincronización", ícono "Campos de la ficha personal" (campos personalizados en Datos personales o Datos laborales), ícono "Carpeta de Drive" ("Configurar Carpeta de Drive — Guardias").
- Estructura obligatoria de la carpeta en Drive: raíz → "Público" / "Privado" → carpeta de entidad "Provincia - Entidad" → carpeta de cada guardia "Apellidos Nombres"; más la carpeta "Sin Asignar". La raíz debe estar compartida como Editor con drive-sync@agentes-504115.iam.gserviceaccount.com. En el modal: "Enlace de la carpeta raíz en Drive *", "Probar Conexión", "Guardar y Sincronizar", y la "Carpeta de archivo (guardias fuera)" para archivar.
- La sincronización: crea entidades nuevas, abre/cierra asignaciones según en qué carpeta está cada guardia, escribe Datos_Personales.json; nunca borra entidades ni requisitos y nunca renombra carpetas. Al terminar muestra cantidades y avisos ⚠ (tipo distinto al de la carpeta, entidades duplicadas o sin provincia, carpetas no reconocidas o en formato viejo, guardias fuera con carpeta activa, etc.).
- Tarjetas: "Guardias activos (con asignación)", "En entidad pública", "En entidad privada", "Sin asignación activa".
- Filtros: buscar por nombre o cédula, tipo (Pública/Privada), entidad (o "Sin asignación"), escobita para limpiar, "Mostrar fuera / Ocultar fuera". "📤 Exportar" permite elegir y ordenar columnas y el formato.
- Acciones por guardia:
  - "Ficha personal": Datos personales (cédula, apellidos, nombres, correo de contacto, teléfono, dirección, nacimiento, contacto de emergencia…) y Datos laborales (puesto, horario, salario, usados para autocompletar contratos). El correo de contacto es el que usa Cumplimiento para recordatorios. Guardar no renombra la carpeta.
  - "Asignar a una entidad" / "Mover a otra entidad": elegir "Entidad destino *" → "Confirmar"; mueve la carpeta en Drive y actualiza la asignación sin borrar documentos. Si la entidad no tiene carpeta ofrece "Sí, crear y vincular".
  - "Registrar salida" (ícono rojo) → "Sí, registrar salida": crea el caso de SALIDA en Historial.
  - "Quitar de la lista" (solo guardias ya fuera): manda la carpeta a la papelera de Drive y no vuelve a aparecer al sincronizar.
- Los guardias fuera se ocultan por defecto; al mostrarlos salen atenuados con la etiqueta "Fuera".

## Entidades y Requisitos
- Las entidades se crean solas al sincronizar el Listado de Guardias; aquí se corrigen nombre, tipo y requisitos. "+ Nueva Entidad": "Nombre de la Entidad *" y "Tipo *" (Pública/Privada). "Mostrar inactivas". Estado "● Activa/Inactiva" con clic. ⚠ si el nombre no empieza por una provincia.
- "Requisitos Generales" en tres niveles: "Globales" (todas las entidades), "Entidades Públicas" y "Entidades Privadas"; además requisitos específicos por entidad (botón "n requisitos").
- Cada requisito: "Nombre del requisito", "Duración del certificado" (días/semanas/meses/años; vacío = sin vencimiento, nunca vence) y con cuánta anticipación avisar antes de que venza.
- "Fusionar cédulas duplicadas" (solo Administrador): cédula de origen (la que se descarta) y de destino (la real) → "Ver vista previa" → "Confirmar fusión". Es irreversible.

## Cumplimiento
- Semáforo por guardia según los requisitos que le aplican (Globales + los de su tipo de entidad + los específicos de su entidad actual). Tarjetas/filtros: "Al día", "Con algo por vencer", "Con algo vencido", "Con algo faltante". Buscador, filtro por entidad y estado, "Actualizar".
- Ícono "Notificaciones": "Correo de envío" (buzón real del dominio, se valida al guardar), "Nombre del remitente"; WhatsApp está en "Próximamente".
- "Detalle de Cumplimiento" (clic en un guardia): aprobar/rechazar cada documento con motivo (queda historial), "Definir fecha de vencimiento" / "Editar fecha", "Leer con IA" (propone fechas de emisión/vencimiento de un PDF con texto; siempre revisar y guardar; si no puede, ingresar la fecha a mano), asignar archivos no reconocidos a un requisito.
- "Enviar recordatorio a este guardia": correo consolidado con lo faltante, vencido o por vencer. Es manual, guardia por guardia; no hay envíos automáticos ni masivos. Si está al día responde que no hay nada pendiente.

## Historial
- Muestra las asignaciones de puesto y las entradas/salidas de cada guardia. Ícono "Sistemas de ingreso y salida" para configurar el catálogo (IsyPlus, IESS, SUT, SICOSEP: nombre, link del portal, activo). "Mostrar todos".
- Cada guardia: tramos por entidad ("Desde… hasta…", Activa/Cerrada) y casos de Entrada/Salida ("En proceso"/"Completado").
- Detalle de un movimiento: una casilla por sistema con "Notas (opcional)"; cuando todas están marcadas, el caso pasa solo a Completado. Con la SALIDA completada se habilita "Archivar carpeta" (mueve la carpeta, no la borra). "Eliminar" solo mientras está en proceso.
- La ENTRADA solo se crea al "Marcar como Contratado" en Reclutamiento; la SALIDA con "Registrar salida" en el Listado de Guardias.

## Contratos (documentos de guardias)
- Cabecera: "Ver carpeta" (carpeta de Drive de documentos generados), "Generar documento", "Nueva plantilla".
- Plantilla ("Configurar"): "Nombre", "Tipo de documento" (o "+ Agregar nuevo tipo..."), "Documento Word (.docx)" con dos opciones: "Enlace de Drive" (link compartido como "Cualquier persona con el link" → "Descargar") o "Subir archivo" (se elige el .docx desde el computador, máximo 10 MB, y se sube al elegirlo); "Detectar variables del documento" (formato [VARIABLE]); en "Variables detectadas" se define la etiqueta, "Autocompletar con" un dato del guardia o "Manual (se llena al generar)", y si es requerida → "Guardar plantilla". "⚠ Falta cargar el documento" indica que falta descargar o subir el Word.
- "Generar Documento": paso 1 "Para quién y tipo de documento": "Elegir un guardia registrado" (autocompleta cédula, entidad, horario, salario… editables) o "Llenar a mano" ("A nombre de *"); "Tipo de documento *". Paso 2 "Datos del documento" → "Generar PDF". Si es de un guardia pregunta dónde guardarlo: carpeta general o carpeta del guardia en Drive.
- "Documentos Generados": Guardia, Cédula, Plantilla, Fecha, Estado, "Ver PDF" y un ícono de papelera para eliminar el documento (también lo borra de Google Drive; no se puede deshacer). Una plantilla solo se puede eliminar si ya no tiene documentos generados. Al configurar una plantilla el sistema sugiere el "Autocompletar con" según el parecido del nombre de cada variable (hay que revisarlo), y al generar conviene revisar los datos porque salen tal cual están en el formulario. La firma es física (se imprime y se firma a mano). Por ahora aplica solo a Guardias.

## Personal Administrativo
- Independiente de Guardias, con su propia carpeta de Drive (subcarpetas "Apellidos Nombres"). "Sincronizar"; ícono "Datos, campos y documentos requeridos" (pestañas Datos generales, Datos laborales, Documentos requeridos); ícono "Carpeta de Drive" (enlace raíz, "Probar Conexión", "Guardar Configuración").
- Columnas: Nombre, Puesto, Departamento, Fecha de ingreso, Estado, Cumplimiento. "Ver detalle": datos generales, laborales y "Cumplimiento documental" (aprobar/rechazar). "Eliminar de la lista".
- No tiene salidas, historial, entidades ni generación de contratos (eso es solo de Guardias).

## Capacitaciones
- "+ Nueva capacitación": "Nombre *", "Tipo *" (Inducción, Seguridad física, Primeros auxilios, Uso de armas, Manejo defensivo, Legal u Otro), casilla Plan anual, "Fecha límite", "Descripción", "Documentos del plan" (archivos o enlaces). "Ver carpeta".
- Cada capacitación crea su carpeta en Drive: las del plan anual en "Anual/<Nombre>", las puntuales en "<Nombre>". Si ya existe, pregunta "Agregar a esa carpeta" o "Cambiar nombre". Sin carpeta de Drive configurada solo se pueden pegar enlaces.
- "Registrar cumplimiento": adjuntar "Evidencia de cumplimiento" → "Confirmar cumplimiento". "Revertir cumplimiento" la vuelve a Pendiente sin perder la evidencia. El cumplimiento es general (una marca para todo el grupo), no por guardia.
- Alertas: vencidas o por vencer en 30 días, visibles en el Dashboard.

## Gestión de Quejas y Sugerencias
- Tablero Kanban: una columna por etapa con su contador; cada tarjeta muestra "Anónima" o el autor, fecha y descripción. Etapas por defecto: Recibida, En sensibilización, En comunicación, En solución, Cerrada.
- Ícono "Etapas del tablero": cambiar color y nombre, estrella de etapa inicial (solo una), casilla "Final", reordenar, eliminar, "Agregar etapa nueva". La inicial no puede ser final ni ir después de una final; no se borra la inicial si hay otras etapas; no se borra una etapa que tenga quejas (muestra cuáles).
- Ícono "Campos del formulario": agregar campos al formulario del empleado (Texto, Número o Fecha, ej. "Departamento"), marcarlos obligatorios o quitarlos.
- Mover una queja: arrastrar la tarjeta, o abrirla ("Detalle de la queja o sugerencia") → "Mover a otra etapa" + "Nota al mover (opcional)" → "Mover", o el botón directo "Avanzar a <siguiente etapa>".
- "Respuesta" + "Guardar respuesta": queda en el historial interno de la queja; NO se envía al empleado (el sistema no notifica al autor). Si hay que responderle, se hace por fuera (y solo si no es anónima).
- El "Historial" de la queja registra la entrada, cada movimiento con su nota y cada respuesta. "Eliminar" borra la queja y su historial.

## Gestión de Encuestas
- "+ Nueva encuesta": "Título *", "Descripción", preguntas (Texto corto, Texto largo, Opción única, Opción múltiple, Escala 1-5; casilla "Obligatoria"; en las de opción al menos 2 opciones), "¿Por dónde se responde?": "Generar enlace público" y/o "Destinatarios en la app" (usuarios activos). Botones "Guardar como borrador" (no envía nada) o "Crear y enviar" (publica y notifica por campana y correo a cada destinatario; exige destinatarios o enlace).
- Los guardias sin usuario responden por el enlace público. Si se quiere saber quién respondió por enlace, se agrega una pregunta de nombre o cédula.
- Filtros: búsqueda, estado (Publicadas, Cerradas, Borrador), medio (enlace o app). Columnas: Encuesta, Llega por (App/Enlace), Estado (Borrador/Activa/Cerrada), Respuestas (respondidas/destinatarios).
- Acciones: "Resultados"; menú ⋯: "Publicar encuesta" (borrador), "Copiar enlace público", "Activar/Desactivar enlace público" (desactivar conserva la URL), "Cerrar encuesta" (deja de aceptar respuestas), "Volver a abrir", "Eliminar encuesta" (solo sin respuestas; si tiene, se cierra). Un borrador no se edita: se publica o se elimina y se crea de nuevo.
- "Resultados": tasa de respuesta; pestaña "Resumen" (barras por opción, promedio de escala, textos libres) y "Por persona" (respuestas por enlace, sin identificar, y por app, con nombre, correo y fecha).

## Preguntas frecuentes de RRHH
- "¿Cómo contrato a un postulante?": Reclutamiento → "Ver" en el candidato → revisar/aprobar documentos → "Marcar como Contratado". Luego en Listado de Guardias asignarle entidad.
- "Un postulante no aparece": revisar que haya subido a la carpeta correcta y pulsar "Sincronizar"; que la vacante esté sincronizada con Drive.
- "¿Cómo muevo a un guardia de entidad?": Listado de Guardias → flechas "Mover a otra entidad" → elegir destino → "Confirmar".
- "¿Cómo sé qué documentos le faltan a un guardia?": Cumplimiento → clic en el guardia; y "Enviar recordatorio a este guardia" para avisarle por correo.
- "¿Cómo doy de baja a un guardia?": Listado de Guardias → "Registrar salida" → Historial → marcar los sistemas → "Archivar carpeta".
- "¿Por qué un documento sale vencido?": su requisito tiene duración y la fecha de vencimiento ya pasó; se actualiza subiendo el nuevo documento y definiendo la nueva fecha.
- "¿Cómo envío una encuesta a los guardias?": Gestión de Encuestas → "+ Nueva encuesta" → marcar "Generar enlace público" → "Crear y enviar" → "Copiar enlace público" y compartirlo (WhatsApp, correo).
- "¿Cómo respondo una queja?": abrirla en Gestión de Quejas y moverla de etapa con nota; la "Respuesta" es interna, al empleado no le llega.`;

const VENTAS = `# Ventas y CRM — guía detallada

## Acceso y pantallas
- Menú → "Ventas y CRM": "Dashboard", "Posibles clientes" (antes "Leads"), "Oportunidades", "Planificación y Campo", "Cotizador", "Contratos", "Documentación", "Directorio" (antes "Clientes") y "Configuración" (en ese orden en el menú: un contacto entra como posible cliente, pasa a oportunidad y, cuando acepta, su estado en el Directorio pasa a ser Cliente). Dashboard, Posibles clientes y Oportunidades tienen un botón "Cómo funciona" que explica ese recorrido, qué etapa equivale a qué fase de Google Ads (Cotizó = Lead cualificado, Contrató = Lead convertido) y qué significan Fuente, Campaña, Landing, Tipo de contacto y Motivo de cierre.
- Permiso "ver": listar y consultar. "Escribir": crear, editar, borrar, cambiar etapa, asignarse, registrar actividades, configurar y generar/enviar documentos, pasar posibles clientes a oportunidad o descartarlos, crear oportunidades y crear, editar, renovar, cancelar o eliminar contratos. Los montos (valor mensual de los contratos y monto cotizado de las oportunidades) los ve todo el que tenga permiso de ver Ventas; "Mis referidos" nunca muestra montos.

## Si vienes de Zoho CRM (o de otro CRM)
- Equivalencias con Zoho: "Posibles clientes" = "Posibles clientes"; "Tratos" = "Oportunidades"; "Cuentas" y "Contactos" = "Directorio" (cada empresa o persona tiene su teléfono y correo PRINCIPALES en la pestaña "Datos" de su ficha, y la pestaña "Contactos" guarda a las otras personas de esa empresa, cada una con sus propios teléfonos y correos); "Tareas, Reuniones y Llamadas" = el "Historial" de la cuenta (notas, llamadas y reuniones) y el "Siguiente paso" con la pestaña "Para hoy"; "Productos y Presupuestos" = el "Cotizador" (catálogo de productos y cotizaciones con líneas; todavía no está vinculado a las oportunidades), los "Servicios" de los contratos y el monto cotizado de la oportunidad; "Campañas" = la "Fuente" y la campaña de cada posible cliente; "Informes y Análisis" = "Dashboard"; "Documentos" = "Documentación". No existen en esta app: Facturas, Órdenes de venta ni de compra (el equivalente es "Contratos"), Proveedores, Casos ni Previsiones.
- Diferencia principal: en Zoho, al convertir un Posible cliente se crean a la vez Contacto, Cuenta y Trato. Aquí "Pasar a oportunidad" lo agrega al Directorio como prospecto y abre la oportunidad; aparece de una vez en el Directorio (estado "Prospecto") y pasa a "Cliente" cuando acepta.
- Si quien pregunta dice "trato", "posible cliente", "lead", "cuenta", "contacto" o "ex-cliente" (hoy se llama "Inactivo"), entiéndelo con esas equivalencias y responde con el nombre que tiene en esta app, diciendo en qué pantalla está. En Google Ads a un posible cliente se le llama "lead".

## Dashboard
- Menú → "Ventas y CRM" → "Dashboard": cómo van las ventas, en cinco pestañas: "Resumen", "Cartera y contratos", "Embudo de ventas", "Motivos de pérdida" y "Equipo". Arriba, un selector "Mis clientes y prospectos" / "Toda la empresa" (ADMIN y MANAGER también pueden elegir a cualquier persona con acceso a Ventas y CRM, tenga o no oportunidades; los demás eligen entre «Mis clientes y prospectos» y «Toda la empresa»; si no llevas oportunidades a tu nombre, el dashboard te lo dice y te ofrece ver toda la empresa). En las pestañas nuevas, ADMIN y MANAGER ven por defecto a toda la empresa.
- "Resumen": el "Periodo" (Esta semana, Este mes, Mes pasado, Últimos 90 días) solo afecta a "Nuevos clientes y prospectos" y "Referidos"; todo lo demás es cómo están las cosas hoy. Una barra de filtros con nombre: "Cifras de" (mis clientes y prospectos, toda la empresa o un vendedor) y "Periodo". Primera fila: "Qué atender" (barra con "Seguimientos vencidos", "Para hoy" y "Sin siguiente paso"; los tres abren Oportunidades en la pestaña "Para hoy"), "Aceptación" (medidor; los botones "aceptadas" y "perdidas" abren Oportunidades filtrada por esa etapa) y "Nuevos clientes y prospectos" (gráfica por semana). Segunda fila: "Oportunidades por etapa" (un embudo: el número es cuántas hay ahora en la etapa y el ancho cuántas han llegado hasta ahí o más lejos; cada etapa abre Oportunidades filtrada y las que no tienen etapa salen aparte) y "Estancados" (más de 7 días en la misma etapa; al pulsar uno se abre su ficha a la derecha, sin salir del dashboard). Tercera fila: el mapa "Dónde se está cotizando", "Documentos de estos clientes" (los de Documentación) y "Referidos" (el botón "Ver" abre Oportunidades de origen "Referido"). Al final "Oportunidades por responsable" (abiertas, con seguimiento vencido y ganadas de cada responsable; las que no tienen responsable van en la primera fila). Todos los botones llevan a Oportunidades con el mismo alcance que el de "Cifras de": si se miran "mis clientes", llegan filtrados por quien tiene la sesión. También tiene el mapa "Dónde se está cotizando": un mapa de Ecuador donde cada burbuja es una ciudad (más grande = más oportunidades), un selector (Todas las oportunidades, Cotizadas, Abiertas, Aceptadas, Perdidas) y, al lado, el ranking "Por provincia" con las provincias que todavía no tienen oportunidades. Tiene tres vistas: "Burbujas" (una por ciudad), "Mapa de calor" (las zonas más rojas concentran más) y "Puntos" (una oportunidad por punto, con el color de su estado), y se puede medir "Por cantidad" o "Por monto cotizado". Solo cuenta las oportunidades que tienen "Ubicación" (es opcional): el pie dice cuántas tienen y cuántas no; no cuenta renovaciones ni clientes que ya venían del sistema anterior; y con «Mis clientes» solo cuenta las que llevas tú.
- "Cartera y contratos": cuántos hay por estado (Solo datos, Prospecto, Cliente, En riesgo, Inactivo, Perdido, en una dona; cada relación abre el Directorio filtrado con el alcance de "Cifras de"), contratos vigentes, por vencer, vencidos sin renovar y cancelados, el valor mensual de los contratos en curso, las renovaciones próximas (30, 60 y 90 días), los vencidos sin renovar (dentro o pasada la gracia, y si tienen motivo), los servicios más contratados y la venta cruzada (clientes con uno o con varios servicios), las bajas del mes, los contratos que renovaron con menos, y la retención (de clientes y en dinero, bruta y neta) con un selector de periodo.
- "Embudo de ventas" empieza con "De posible cliente a venta": un embudo con los posibles clientes que llenaron un formulario → a cuántos se les cotizó → cuántos contrataron, y una tabla "Ver por" Canal (por dónde llegó: Google Ads, Meta, el sitio web, un referido…), Campaña (el anuncio o promoción concreta) o Landing (la página web donde llenó el formulario), con el porcentaje entre pasos (las visitas a la página solo las ve Google Ads). Después "Qué tan rápido trabajamos" (tiempo de respuesta, de cotización y duración del ciclo) y: cuántas oportunidades llegaron a cada etapa y cuántas pasaron a la siguiente, el tiempo en cada etapa, el tiempo de respuesta (de llegar a la etapa "En evaluación"), el de cotización y la duración del ciclo hasta aceptar, y la aceptación por fuente, servicio, responsable y referidor. Cada cifra dice en cuántas oportunidades se midió ("pocas muestras" si son menos de 5), y los tiempos solo se miden desde el 30/09/2026, cuando empezó el historial de etapas.
- "Motivos de pérdida": tres donas, una por cada tipo de pérdida — "Posibles clientes descartados" (contactos que no pasaron a oportunidad), "Oportunidades perdidas" (negociaciones cerradas sin venta) y "Contratos que se pierden" (cancelados o vencidos sin renovar; aparte dice cuántos se renovaron con menos servicios o menor valor) —. Cada una explica qué contiene, muestra sus motivos y dice cuánto es "sin información" y cuánto es solo la suposición del vendedor. Al pulsar un motivo se abre la lista de esos casos (Posibles clientes descartados, Oportunidades perdidas o Contratos) filtrada por ese motivo y por el alcance de "Cifras de".
- "Equipo": cuántas notas, llamadas, reuniones y cambios de etapa registró cada persona, por semana.

## Relación entre los sub-módulos Posibles clientes, Oportunidades, Directorio y Contratos
- El recorrido de una persona es: Posible cliente (entró un contacto; en Google Ads se llama lead) → Oportunidad (se negocia un servicio, con etapas) → al ACEPTAR pasa a ser Cliente → Contrato → Documento firmado. La etapa de la negociación vive solo en Oportunidades. El "Directorio" es la lista de empresas y personas registradas (desde que pasan a oportunidad) y "Cliente" es el estado de quien ya aceptó o contrata.
- Posibles clientes es la bandeja de contactos que llegan sin procesar (formulario de la página web, Google Ads, LinkedIn Ads, correo o a mano): pueden ser prospectos de servicio, postulantes a empleo, proveedores o spam. Solo un posible cliente de servicio pasa a una oportunidad. Quien ya está en el Directorio nunca vuelve a ser posible cliente: si pide otro servicio, entra como posible cliente nuevo y al pasarlo a oportunidad se le suma a su misma ficha.
- Oportunidades es cada negociación de un servicio de una persona, con su propio avance por las etapas (Nueva, En evaluación, Cotizada, En negociación y, al cierre, Aceptada o Perdida), su monto cotizado y su motivo de pérdida. Es donde se trabajan los prospectos y donde se cambia la etapa. Una persona puede tener varias (por ejemplo, ya contrata un servicio y pide otro).
- El Directorio es la lista de todas las empresas y personas registradas (solo sus datos y su historial; el responsable y el seguimiento son de cada oportunidad) y su relación (ciclo de vida), que se calcula sola: Cliente (aceptó una oportunidad o tiene contrato vigente; si aceptó y aún no tiene contrato aparece "Por contratar"), En riesgo (contrato por vencer, sin actividad por más de 60 días, seguimiento vencido o vencido dentro de sus días de gracia), Inactivo (tuvo contratos y ya no tiene ninguno vigente) y también Prospecto (tiene una oportunidad en negociación, aún sin aceptar), Solo datos (está registrado en el Directorio pero no tiene oportunidades ni contratos: nadie lo está atendiendo) y Perdido (nunca contrató y perdió todas sus oportunidades). Su "Servicio requerido" es solo el interés con el que llegó; lo que de verdad contrata se registra en Contratos.
- Fases como las ve quien maneja Google Ads: Sin procesar (llenó el formulario; si nadie lo pasa a evaluación, no avanza), Cualificado (la oportunidad llegó a En evaluación o más adelante: Cotizada, En negociación) y Convertido (contrató: la oportunidad fue Aceptada). Las visitas a la página (interacciones) solo las ve Google Ads. El Dashboard tiene un "Embudo de marketing" con esos pasos por canal, campaña o landing.
- Contratos es el acuerdo comercial de un cliente: qué servicios contrató, desde cuándo hasta cuándo y si renueva a otro. Un cliente puede tener varios contratos (por ejemplo, las renovaciones) y cada contrato puede incluir varios servicios.
- Documentación genera los documentos a partir de Plantillas (un Word con variables) y los envía a firma electrónica (SignWell). Cada documento es de un cliente (es obligatorio elegirlo) y puede colgar de uno de sus contratos.
- En "Nuevo documento" → "Datos de envío" se elige el cliente y se autocompletan "Nombre para el envío" y "Email para el envío". Si el cliente ya tiene contratos, aparece "Contrato del cliente (opcional)" para colgar el documento de uno.
- Los datos de la ficha del cliente alimentan las variables del documento: en la plantilla, cada variable se puede "Mapear a campo de Cliente" (por ejemplo [Cliente.RUC] → campo "Cédula / RUC"). Al crear el documento, el botón "Autocompletar campos de cliente: [nombre]" (en el grupo "Campos de (Cliente)") llena esas variables. Por eso conviene que la ficha del cliente esté completa antes de hacer su documento, y que los campos de la ficha coincidan con lo que piden las plantillas.
- Los referidos que hace cualquier empleado entran directo como una oportunidad nueva (Fuente = Referido) y siguen el mismo recorrido; aparecen en Oportunidades hasta que aceptan.
- Borrar a alguien del Directorio no borra sus documentos, pero si tiene contratos no se deja borrar: primero hay que eliminar sus contratos.

## Directorio
- Menú → "Ventas y CRM" → "Directorio" (antes "Clientes"): los DATOS de cada empresa o persona. Abre con todos, sin filtros. Aquí no hay etapa, responsable ni seguimiento: eso es de cada oportunidad (en Oportunidades) y los acuerdos son de Contratos. Barra: "Cómo funciona", "Campos" (ficha), búsqueda ("Buscar por nombre, RUC, teléfono, correo o dirección..."), filtro "Relación" ("Todas las relaciones", Cliente, En riesgo, Inactivo, Prospecto, Perdido, Solo datos), "Columnas", limpiar filtros y "+ Nueva empresa o persona".
- La "Relación" se calcula sola (ver arriba): sirve para mirar o filtrar, no se teclea.
- Tabla: Nombre / Razón social, RUC, Email, Teléfono y Relación; con "Columnas" se agregan Dirección, Fuente, Servicio requerido, Observaciones, Fecha de ingreso y los campos personalizados (columnas ordenables y redimensionables). Acciones (botón "⋯"): "Ver ficha", "Editar ficha" y "Eliminar" (si tiene contratos no se puede: primero se eliminan; los documentos ya generados no se borran).
- "+ Nueva empresa o persona": solo guarda los datos y basta con el Nombre / Razón social (obligatorio) y la Fecha de ingreso (por defecto hoy; se puede poner una pasada, nunca futura); la Fuente se ofrece a la vista y el resto (correo, teléfono, cédula / RUC, dirección, observaciones y los campos personalizados) está en "Más datos (opcional)". NO tiene "Servicio requerido": el servicio es de la oportunidad, no del Directorio (en Oportunidades, si una oportunidad antigua no tiene servicios propios, la columna "Servicios" muestra en gris cursiva el que quedó guardado en la ficha). NO abre ninguna oportunidad: la negociación se abre desde Posibles clientes ("Pasar a oportunidad") o con "+ Nueva oportunidad" en Oportunidades. Quien ya contrata queda como Cliente cuando se crea su contrato.
- Ficha ("⋯" → "Ver ficha", o clic en el nombre en Oportunidades): panel a la derecha con un botón "Editar" (abre el formulario para cambiar o borrar cualquier dato) y tres pestañas. "Datos": relación, "Teléfono principal", "Correo principal", RUC / cédula, dirección, observaciones, y dos accesos: "Oportunidades (n)" con "Ver" y "Nueva oportunidad", y "Contratos (n)" con "Ver" y "Nuevo contrato". "Contactos": las personas de contacto ADICIONALES de una empresa (nombre, cargo, varios teléfonos y correos etiquetados como WhatsApp, Casa, Trabajo u Otro, y notas) con "Agregar", editar y borrar; el sistema reconoce por su teléfono o correo a quien ya está aquí cuando escribe un posible cliente. "Historial": "Agregar a la línea de tiempo" (Tipo: Nota, Llamada, Reunión, Correo, Cotización enviada, Queja u Otro, que pide "¿Cuál?", más el texto → "Agregar"; los incidentes del servicio y la conversación de salida NO se anotan aquí sino dentro de cada contrato, aunque los registros viejos se siguen viendo; "Correo" es solo un registro a mano: no envía ni lee correos) y la línea de tiempo con un botón de flecha para verla del más nuevo al más antiguo o al revés. La línea de tiempo muestra el registro (con el servicio por el que llegó y la fuente), cada oportunidad nueva, cada cambio de etapa diciendo de qué oportunidad y servicio es, los contratos (creado, renovado, cancelado), los documentos (creado, enviado a firma, firmado) y las notas. Cada nota se puede editar o borrar solo por quien la escribió o por un administrador.
- Dónde quedó lo que antes estaba en el Directorio: el RESPONSABLE, la etapa y el SIGUIENTE PASO son de cada oportunidad (en Oportunidades: menú "⋯" → "Asignarme" / "Quitarme" / "Siguiente paso", y la pestaña "Para hoy"); "Por contratar" se ve en el Dashboard y en Contratos.
- "Campos" ("Configurar campos de la ficha"): renombrar campos, en listas "Opciones" (agregar/quitar, "Permitir Otro con texto libre"), "Agregar campo nuevo" (Texto, Número, Fecha, Sí/No, Lista de opciones) → "Añadir campo". Los campos base no se borran; los personalizados sí. "Columnas": mostrar/ocultar/ordenar columnas (preferencia personal). Estos campos son los que se mapean a variables de documentos.

## Posibles clientes
- Menú → "Ventas y CRM" → "Posibles clientes" (antes "Leads"; en Google Ads se llaman "leads"): la bandeja de contactos entrantes. Botones: "Cómo funciona" y "+ Nuevo posible cliente" (para ingresar a mano un referido, una llamada, un WhatsApp, un correo o uno de Meta). En "Nuevo posible cliente" hay además una "Dirección (opcional)" que pasa a la ficha al convertirlo. La "Fuente: cómo llegó" es obligatoria y, según la que elijas, pide sus propios datos (campaña y gclid en Google Ads, quién lo refirió en Referido). Arriba hay una tarjeta por fuente con cuántos posibles clientes trae; al tocarla filtra la tabla. Filtros: Pendientes / Todos / Pasaron a oportunidad / Descartados, tipo de contacto, fuente y búsqueda.
- Estados: "Sin procesar" (nadie lo tomó), "Contactado" (alguien lo tomó), "Pasó a oportunidad" y "Descartado". Un posible cliente sin atender hace 2 días o más muestra "Sin atender hace N días"; nunca se descarta solo.
- Cada fila muestra el contacto, lo que escribió, la fuente (Formulario web, Google Ads, Meta Ads, LinkedIn Ads, Referido, WhatsApp, Llamada, Correo o Ingreso manual; con el botón "Columnas" se agregan la campaña, el gclid, la landing, quién lo refirió y el consentimiento de datos), la landing y el servicio que pidió si vienen de una landing, el "Tipo de contacto" (Servicio, Empleo, Proveedor, Otro, Spam o "Sin clasificar"), el estado y quién lo tiene. Si el sistema sospecha el motivo, lo sugiere ("Parece de Empleo · aceptar"), pero nunca lo aplica solo. Si el contacto se parece a alguien que ya está en el Directorio (mismo correo o teléfono) avisa "Ya está en el directorio: X".
- Los posibles clientes llegan sin asignar a nadie y se avisa en las notificaciones (ícono de campana) a quienes pueden escribir en Ventas. Quien lo ve primero lo toma con "Tomar este posible cliente" (cada quien se asigna a sí mismo; "Soltar este posible cliente" lo libera).
- "Pasar a oportunidad" (solo para los de servicio o sin clasificar; el botón del modal también se llama "Pasar a oportunidad") lo convierte en una negociación: si se parece a alguien del Directorio, hay que elegir entre "Sumar la oportunidad a X" (lo normal cuando ya es cliente y pide otro servicio) o "Es otra persona o empresa: crear una nueva"; si su teléfono o correo coincide con una persona de contacto de una empresa del Directorio, se puede elegir a esa persona o crear una nueva persona de contacto en esa empresa; también se eligen los servicios que pidió (si vino de una landing, los que pidió ahí aparecen ya marcados como sugerencia; se pueden cambiar). La dirección que trajo el posible cliente (o la que corrijas en el cuadro) pasa a la ficha de la empresa; los servicios elegidos quedan SOLO en la oportunidad (el Directorio no tiene "Servicio requerido"); si se suma a una empresa que ya existe, solo se le completa la dirección cuando no tenía, nunca se pisa. Queda como Prospecto en el Directorio (y la negociación en Oportunidades) hasta que acepte; lo que escribió queda en su historial. En ese cuadro también se puede poner la "Ubicación del servicio" (opcional, con mapa): va a la oportunidad, no a la ficha de la empresa. La oportunidad empieza el día en que llegó el posible cliente, para medir el tiempo de respuesta de verdad.
- "Descartar" (menú "⋯"): pide el motivo (No contestó, Postulante a empleo, Proveedor, Spam, Servicio que no cubrimos…). El posible cliente no se borra: queda en "Descartados".
- Las conexiones (claves, Google Ads, landings del formulario web) no se abren desde esta pantalla: se configuran en Configuración → pestaña "Cómo llegan los posibles clientes" (ver "Configuración"). Meta Ads y LinkedIn Ads no tienen conexión directa con sus formularios: sus posibles clientes entran por la misma puerta que el Formulario web.

## Oportunidades
- Menú → "Ventas y CRM" → "Oportunidades": cada negociación de un servicio. Botones: "Cómo funciona", "Etapas", "+ Nueva oportunidad" (para alguien del Directorio que pide otro servicio o, con "Es nueva en el directorio", para registrar a alguien). Debajo del título dice «en Zoho: Tratos». Pestañas "Todas" y "Para hoy". Filtros: etapa, responsable, servicio y búsqueda (ya no hay filtro de estado: la etapa dice si está abierta, Aceptada o Perdida).
- Columnas: Empresa o persona (clic abre su ficha), Servicios, Etapa (se cambia ahí mismo con el desplegable: es el ÚNICO lugar donde se cambia la etapa), Monto cotizado, Responsable, Origen (Posible cliente, Ingreso manual, Referido, Nuevo servicio de un cliente, Sistema anterior, Ya era cliente, Renovación) y fecha en que llegó. El menú "⋯": "Ver ficha", "Editar", "Siguiente paso" (si está abierta), "Asignarme" (si no tiene responsable) o "Quitarme" (si eres tú), y "Eliminar". El responsable y el siguiente paso son de cada oportunidad.
- Etapas por defecto: Nueva (inicial) → En evaluación → Cotizada → En negociación → Aceptada (final, ganada) / Perdida (final). Se pueden renombrar, reordenar y agregar con el botón "Etapas" (la inicial no puede ser final ni ir después de una final; no se borra una etapa con oportunidades).
- Cambiar de etapa: "Cotizada" pide el monto cotizado y la fecha (opcionales; sin fecha se toma hoy); "Perdida" pide el motivo de pérdida; "Aceptada" cierra la oportunidad como ganada y es el ÚNICO momento en que el sistema pregunta qué aceptó la empresa: "Un servicio" (recurrente: guardias, monitoreo…) o "Una venta única" (un producto, una instalación o un servicio de una sola vez, como una custodia puntual). Si es un servicio y la empresa NO tiene contratos de servicio vigentes, se crea solo un contrato nuevo desde hoy, sin fecha de fin (las fechas se completan después en Contratos). Si ya tiene contratos vigentes, el mensaje nombra la empresa y cada contrato con sus servicios y fechas, y se elige entre "es adicional a ESTE contrato" (se suman los servicios a ese contrato; si hay varios vigentes se elige a cuál) o "No, es un contrato nuevo". Si es una venta única se registra desde hoy, por el monto cotizado, y se pregunta si tiene garantía (No, o Sí por tantos meses, de 1 a 120). La oportunidad debe tener al menos un servicio antes de aceptarla. Así la empresa pasa a ser Cliente con su contrato ya creado. Las oportunidades de RENOVACIÓN (Origen "Renovación") no preguntan eso: al pasarlas a Aceptada se abre el formulario del contrato nuevo ya lleno con los datos del anterior (empieza el día siguiente a su fin y dura lo mismo) para revisar fechas, servicios y valor mensual, y el contrato anterior queda "Renovado"; al pasarlas a Perdida piden "¿Por qué no se renovó?" una sola vez, y ese motivo queda también en el contrato. Se puede volver a abrir una oportunidad cerrada pasándola a otra etapa.
- Ubicación del servicio (OPCIONAL): al crear o editar una oportunidad (y al "Pasar a oportunidad" un posible cliente) hay un campo "Ubicación del servicio (opcional)" con el botón "📍 Elegir en el mapa" (después "Cambiar" y "Quitar"). Abre un mapa de OpenStreetMap (gratis): se escribe una calle, barrio, centro comercial o ciudad y se pulsa "Buscar" (o Enter), se elige un resultado y se arrastra el pin hasta el local, o se hace clic directo en el mapa; el "Nombre del lugar" se escribe a mano porque el mapa conoce calles, barrios y centros comerciales pero no todos los locales (por ejemplo, un café). Solo vale dentro de Ecuador. Es de la OPORTUNIDAD, no de la persona o empresa (una empresa puede cotizar varias sedes), nadie está obligado a ponerla y se puede agregar o quitar después. Sirve para el mapa del Dashboard.
- Pestaña "Para hoy": a quién dar seguimiento hoy entre las empresas o personas con una negociación abierta a tu nombre (o con un siguiente paso guardado antes en su ficha): vencido, para hoy y sin fecha; con "Hecho" para registrar lo que se hizo y fijar el siguiente paso. Admin y gerente pueden ver "Todas las negociaciones" o las de otro vendedor.
- Si el cliente fue referido por un empleado, ese empleado recibe el aviso en cada cambio de etapa de la primera oportunidad (sin dinero).

## Contratos
- Menú → "Ventas y CRM" → "Contratos": el acuerdo comercial de cada cliente. Botón "+ Nuevo contrato" (el catálogo de servicios y los motivos de cierre se configuran solo en Configuración; esta pantalla ya no tiene botones para eso). Se pueden registrar también contratos anteriores a la app: se ponen sus fechas reales aunque ya hayan pasado y se dice por qué terminaron. Columna "Valor mensual". Buscar por cliente, título o servicio; filtros por estado ("Vigente", "Por vencer", "Vencido", "Por iniciar", "Renovado", "Cancelado") y por servicio. Clic en una fila abre el detalle; el menú "⋯" tiene "Ver detalle", "Editar", "Renovar", "Cancelar contrato" y "Eliminar".
- Tipos de contrato: "Servicio recurrente" (se repite en el tiempo: tiene vigencia, valor mensual y se puede renovar) y "Venta única" (un producto, una instalación o un servicio que se hace una sola vez, como una custodia puntual: valor total, sin fecha de fin ni renovación, se sigue como "Por entregar" y "Entregado" y puede tener garantía). El tipo se elige al crear el contrato y se puede corregir con "Editar".
- Estados: "Vigente", "Por vencer" (faltan 30 días o menos para la fecha de fin), "Vencido" y "Por iniciar" se calculan solos con las fechas; no hay que marcarlos. "Renovado" y "Cancelado" sí se fijan a mano o con la renovación. Un contrato sin fecha de fin está siempre vigente. No hay avisos por correo de vencimiento: hay que mirar la lista.
- "+ Nuevo contrato": Cliente *, Título (opcional), Inicio * , Fin (vacío si no vence), Valor mensual (opcional), Días de gracia al vencer * (se sugieren según la duración: 30 si dura 6 meses o más, 15 si menos; se pueden cambiar), Servicios contratados * (casillas, al menos uno) y Notas. También se llega desde la ficha de un cliente con "Nuevo contrato" y el cliente ya viene elegido. Los días de gracia son los que, después del fin, el cliente sigue "En riesgo" antes de pasar a "Inactivo".
- Servicios: el catálogo de la empresa (Agentes de Seguridad, Monitoreo de Cámaras, Cableado Estructurado…; se pueden agregar, renombrar y reordenar) se edita en Configuración → pestaña "Servicios". Un servicio que ya está en algún contrato no se elimina: se desactiva (deja de ofrecerse en los nuevos pero se conserva en los que ya lo tienen).
- "Renovar": crea un contrato nuevo del mismo cliente que empieza el día siguiente al fin del anterior, con los mismos servicios, valor y días de gracia (editables); el anterior queda "Renovado". No se renueva uno Cancelado ni uno ya Renovado. Si la renovación quita servicios o baja el valor mensual frente al anterior, el sistema avisa y pide el motivo. Las renovaciones también se gestionan como oportunidad: cada día el sistema revisa los contratos de servicio con fecha de fin y, a los que faltan 30 días o menos para terminar (o ya vencieron pero siguen dentro de sus días de gracia), les abre solo una oportunidad "Renovación – nombre del contrato" en Oportunidades, sin responsable (quien la tome usa "Asignarme"), y avisa a Ventas por la campana. Las ventas únicas, los contratos sin fecha de fin y los cancelados no generan renovación. Si renuevas a mano con "Renovar", esa oportunidad se cierra sola como Aceptada; si cancelas el contrato, como Perdida; y si lo eliminas, se borra.
- "Cancelar contrato" (botón del detalle o menú "⋯"): pide el motivo y deja el contrato cancelado desde hoy; "Reactivar" lo vuelve a activar. Un contrato vencido sin renovar muestra un aviso "Registrar el motivo" para anotar por qué no se renovó.
- Motivos: la lista de motivos se edita en Configuración → pestaña "Motivos de cierre", donde se ven tres listas lado a lado porque son tres momentos distintos del embudo: "Posibles clientes descartados" (spam, busca empleo…), "Oportunidades perdidas" (ya se cotizó y no se dio, por ejemplo muy caro) y "Contratos terminados" (los marcados con candado los usa el sistema). Siempre se elige un motivo, se marca quién lo dijo (el cliente, o es una suposición del vendedor) y se puede escribir un comentario; "Sin información" existe para no inventar un motivo cuando no se sabe, y "Otro" exige comentario.
- Detalle del contrato: datos, servicios, a qué contrato renueva o por cuál fue renovado, y "Documentos" y "Incidentes y conversación de salida". Arriba, "Editar" y "Renovar"; en el menú "⋯" están "Cancelar contrato", "Reactivar" y "Eliminar contrato". "Generar documento" abre Documentación con el cliente y el contrato ya elegidos (si el contrato todavía no empieza, avisa su fecha de inicio, "Renovar" queda deshabilitado hasta que empiece y, si ya tiene un documento, pregunta antes de generar otro); "Asociar un documento existente de este cliente" (solo aparece si hay alguno) cuelga uno que ya exista; el icono de desvincular lo quita del contrato sin borrarlo. "Subir documento" sube un archivo que ya existe (contrato firmado, adenda, garantía, acta de entrega, orden de compra u otro) y obliga a elegir su tipo; también queda en Documentación, con su tipo y el contrato al que pertenece. "Enviar a firma por correo" aparece como "Próximamente" en esta pantalla mientras se prueba. "Incidentes y conversación de salida" (botón "Registrar"): aquí se anotan, con fecha, los incidentes del servicio durante la vigencia de ESE contrato (una falla, un guardia ausente, un reclamo) y, cuando termina, lo que dijo el cliente al irse (conversación de salida). Se pueden borrar.
- Eliminar un contrato no borra sus documentos: siguen en Documentación.

## Documentación
- Menú → "Ventas y CRM" → "Documentación" (antes se llamaba "Contratos"): aquí se generan y firman los documentos desde plantillas.
- Los documentos pueden generarse desde una plantilla o subirse ya hechos (la generación automática desde el contrato y el envío a firma dependen de la clave de SignWell, que aún no está registrada, y la pantalla lo anuncia como "Próximamente"). Cada documento tiene un Tipo (Contrato, Adenda, Garantía, Acta de entrega, Orden de compra u Otro) y el contrato al que pertenece, con enlace de ida y vuelta, y se puede filtrar por tipo.
- Lista: "Cómo funciona" (la ayuda de Documentación), carpeta de Drive (si está configurada), "Plantillas" y "+ Nuevo documento ▾", un solo botón con dos opciones: "Generar desde una plantilla" y "Subir uno ya hecho" (por ejemplo, un contrato firmado en PDF). Buscar por número, cliente, email o plantilla; filtros por estado y tipo. Solo cuando existen documentos sin cliente aparecen el filtro "Sin cliente asignado" y el botón "Vincular clientes", que enlaza solo los documentos viejos sin cliente cuando su correo (o su nombre exacto) coincide con un único cliente; los demás quedan en "Sin cliente asignado" para revisarlos a mano. Clic en la fila abre el detalle.
- Estados: Borrador (al crearlo) → Generando (mientras se arma el PDF) → Listo (PDF generado) → Enviado (en SignWell) → Firmado.

### Plantillas (paso previo, una sola vez por tipo de documento)
- "Plantillas" → "+ Nueva plantilla" → asistente "1. Fuente del documento" → "2. Detectar variables" → "3. Configurar campos".
  1. Nombre, Descripción y el Word: pestaña "Link de Google Drive" (compartido como "Cualquier persona con el enlace", Lector) + "Descargar", o pestaña "Subir documento" (.docx).
  2. "🔍 Detectar variables del documento": busca textos [Variable] o <<Variable>> en el Word. Las que tienen punto se agrupan: [Cliente.RUC] en "Campos de (Cliente)", [Contrato.X] en "Campos de (Contrato)"; las demás en "Otros".
  3. Pestaña "Campos": por cada variable, Etiqueta, Tipo (Texto, Número, Fecha, Email, Casilla, Selección, Firma, Tabla, "Número de Contrato (automático)"), "Req." (obligatoria) y "Cliente" (la llena o firma el cliente al firmar). Al expandir (▸): "Mapear a campo de Cliente", texto guía para el firmante, columnas y máximo de filas en Tablas, opciones en Selección.
  4. Pestaña "Numeración y correo": prefijo, dígitos y próximo número del contrato (ej. MEGAMONT-00001); asunto y cuerpo del correo de envío → "Guardar plantilla".

### Crear y enviar un documento
1. "+ Nuevo documento" → "Seleccionar plantilla".
2. "Datos de envío": elegir el cliente ("— Seleccionar cliente * —", obligatorio; "Ir al Directorio" abre el alta de uno nuevo); el "Nombre para el envío *" y el "Email para el envío *" se autocompletan y se pueden corregir. Si el cliente tiene contratos, "Contrato del cliente (opcional)" cuelga el documento de uno.
3. Llenar los campos (obligatorios con *). En "Campos de (Cliente)" usar "Autocompletar campos de cliente". Los campos marcados "Cliente" se ven como "El cliente lo completará/firmará al momento de firmar". Si hay número automático: "Se asignará automáticamente".
4. "⚡ Generar documento": guarda el documento en Borrador y abre su ficha (todavía no hace el PDF). Si falta algo: "Falta llenar: X".
5. En la ficha, "⚡ Generar PDF" (luego "🔄 Regenerar PDF"): llena el Word y lo convierte a PDF → estado Listo (si hay carpeta de Drive, también se sube ahí).
6. "✉️ Enviar a Firma Electrónica (SignWell)" (solo en Listo): SignWell manda el correo al cliente → Enviado. El correo va al "Email para el envío" del contrato con el asunto/cuerpo de la plantilla; para cambiar el destinatario se usa "✏️ Editar campos" y se regenera.
7. Pasa a Firmado: automáticamente cuando SignWell avisa, con "🔄 Actualizar" en "Estado de la firma", o subiendo el PDF firmado ("📤 Subir PDF firmado"). El "Historial de documentos" guarda PDF generado, enviado y firmado.
- Tablas que llena el cliente: si la plantilla tiene tablas marcadas "Cliente", la ficha muestra "📋 Copiar link para el cliente"; el cliente abre el enlace (sin cuenta), completa "Completa tu información" y al enviar el sistema genera el PDF y lo lleva directo a firmar. El enlace sirve una sola vez.
- Editar o regenerar un documento ya Enviado muestra una advertencia: no cancela el envío en SignWell (el cliente seguiría viendo la versión anterior). Un documento Firmado ya no se edita.
- Estados de firma en SignWell: Pendiente de firma, Visto por el cliente, Firmado, Rechazado por el cliente, No entregado, Expirado.

## Cotizador
- Menú → "Ventas y CRM" → "Cotizador": arma una cotización eligiendo productos de un catálogo. A la izquierda el catálogo (se busca por código, modelo o descripción y se filtra por categoría); a la derecha la cotización con los datos del cliente (nombre, RUC o cédula, email y teléfono son necesarios para guardar; al escribir el nombre del cliente aparece una lista con los clientes del Directorio de Ventas y, al elegir uno, se rellenan su RUC, teléfono, dirección, contacto y email; si no está en el Directorio, se sigue escribiendo a mano), los productos con su cantidad, las instalaciones, el descuento y las condiciones. Arriba: "Nueva cotización", "Historial", "Plantillas", "Kits" y "Catálogo".
- Precios: cada producto tiene un costo y se le suma la ganancia del proveedor (15 % por defecto; se cambia en los márgenes de la cotización, y la instalación usa 35 %). El descuento (porcentaje o valor) se resta SIEMPRE antes del IVA del 15 %; el total del historial, el de la pantalla y el del PDF son el mismo. El PDF nunca muestra costos, ganancia ni proveedor.
- "Guardar cotización" le asigna el número (formato COT-año-mes-día-secuencia) y la deja en "Historial", donde se cambia su estado (borrador, enviada, vista, aceptada, rechazada, vencida), se abre, se copia o se elimina. "Imprimir / Guardar PDF" abre la hoja para imprimir o guardar como PDF; no se manda por correo desde el sistema. "Guardar como plantilla" guarda la cotización para reutilizarla; "Kits" agrupa productos que se agregan juntos.
- Si un producto cambió de precio desde que se hizo la cotización, al abrirla aparece un aviso con "precio cuando cotizaste" y "precio actual" y el botón "Usar precios actuales"; mientras no se pulse, la cotización conserva su precio original. Un producto "eliminado" del catálogo solo se desactiva: las cotizaciones que ya lo usaban no cambian. Si al abrir una cotización muy antigua sale "Cotización antigua", hay productos que conviene revisar a mano.
- Compartir: el dueño puede "Compartir con" un compañero una cotización (la ve en solo lectura y puede hacer "Crear copia" para editarla por su cuenta) o dar acceso a "Pueden editar mis cotizaciones" (edición total de todas las suyas). El administrador ve todas las cotizaciones de la empresa pero en solo lectura. Eliminar y compartir son solo del dueño.
- El PDF sigue el formato del cotizador original: logo de GEMESEG, teléfono con icono, tabla con la unidad de cada producto (columna Und) y la casilla de instalación (Inst), y un cuadro de totales oscuro. Al guardarlo como PDF el archivo se llama como el número de cotización seguido del cliente.
- El encabezado de la cotización y del PDF lleva el teléfono del asesor que la hizo (el que cada quien guarda en "Mi perfil"); si no tiene uno guardado sale +593 99 897 4909.
- Permiso "ver": consultar; "escribir": guardar cotizaciones y editar el catálogo, los kits y las plantillas.

## Configuración
- Menú → "Ventas y CRM" → "Configuración": aquí se ajusta cómo funciona el CRM para la empresa. El administrador puede cambiar y guardar; el gerente la ve en solo lectura.
- La pantalla tiene cuatro pestañas arriba, con icono: "Cómo llegan los posibles clientes" (abre primero), "Fuentes", "Servicios" y "Motivos de cierre". Todo lo que es del catálogo de la empresa se configura SOLO aquí: los servicios que se eligen en Nueva oportunidad, Contratos, Referir un cliente y las landings salen de la pestaña "Servicios" (si uno se desactiva, deja de ofrecerse en todos lados).
- "Cómo llegan los posibles clientes": una lista de filas, cada una con un punto verde (activa) o gris (desactivada), su estado y cuántos posibles clientes han llegado por ella y cuándo llegó el último: "Google Ads", "Meta Ads", "LinkedIn Ads", "Formulario web" y "Añadir nueva conexión". Cada fila se abre en su lugar (empieza cerrada) y la clave (API key) va dentro de su conexión, con una explicación de qué es. "Formulario web" lleva la clave del formulario y la tabla de landings; "Añadir nueva conexión" pide un nombre y crea una clave propia (activable y desactivable sin borrarla). Meta Ads y LinkedIn Ads son base: todavía no hay conexión directa con sus formularios, así que no hay nada que activar.
- "Servicios": el catálogo de servicios que ofrece la empresa, con una columna por categoría (agregar, renombrar, activar o desactivar con el interruptor, eliminar si no está en ningún contrato). Se eligen luego en oportunidades, contratos, "Referir un cliente" y la tabla de landings; un servicio desactivado no se puede asociar a nada nuevo.
- "Motivos de cierre": tres listas lado a lado ("Posibles clientes descartados", "Oportunidades perdidas" y "Contratos terminados") para agregar, activar o desactivar, editar y eliminar motivos.
- "Fuentes": las fuentes que existen (Google Ads, Meta Ads, LinkedIn Ads, Formulario web, Referido, WhatsApp, Llamada, Correo e Ingreso manual). Es solo informativa.
- "Landings" (dentro de "Formulario web"): una tabla con la dirección de cada landing de la página (la parte final del enlace, por ejemplo monitoreo-alarmas), el servicio que le corresponde y su línea comercial. Con ella el CRM sabe qué servicio pidió cada contacto. Botones: "Agregar landing" y "Guardar landings". Cada empresa tiene su propia tabla; una empresa nueva empieza sin landings. Cualquier persona con permiso de edición en Ventas puede cambiarla.
- "Google Ads" (dentro de "Cómo llegan los posibles clientes", desplegable): el ID de cliente de Google Ads (10 dígitos), el ID de las conversiones "Lead cualificado" (cuando cotiza) y "Lead convertido" (cuando contrata), y de forma opcional el de "Lead válido" (paso intermedio: se avisa cuando alguien clasifica un posible cliente de anuncio como "Servicio" o lo pasa a oportunidad, para que Google distinga contactos reales de formularios de empleo, proveedores o spam; sin ese ID no se avisa nada), "Enviar a Google Ads" (interruptor) y "Solo probar" (Google revisa pero no cuenta). Con el envío activo, cuando un posible cliente que llegó de un anuncio pasa a Cotizada o a Aceptada, el CRM se lo avisa a Google. Muestra cuántos avisos están por enviar, enviados o con error.
- Las etapas se cambian en Oportunidades ("Etapas") y los campos de la ficha en el Directorio ("Campos"); los servicios y los motivos de cierre, aquí en Configuración.

## Planificación y Campo (visitas de campo)
- Menú → "Ventas y CRM" → "Planificación y Campo" (la pantalla se titula "Visitas"; tiene dos pestañas: "Visitas" y "Resultados"). Sirve para agendar las visitas a empresas o personas, registrar la llegada con el check-in y cerrar cada visita con su oferta. Hoy cualquiera con acceso a Ventas ve y maneja todas las visitas de la empresa.
- "Nueva visita": se elige a quién se visita buscando en el Directorio o con "+ Nueva empresa o persona" (basta el nombre); la fecha; la oportunidad que se visita (opcional: se elige una abierta de esa empresa o persona, o se crea con "+ Nueva oportunidad"; sin oportunidad es una visita de prospección); la ubicación en el mapa (opcional) y las notas.
- "Check-in": al llegar se pulsa "Check-in" en la fila. El sistema compara la ubicación del navegador con el lugar de la visita: hasta 500 m queda "En el sitio" (verificado); más lejos o sin ubicación avisa y, si se confirma, queda "Sin verificar".
- "Oferta y cierre" (botón de la fila cuando la visita está en proceso, o "Registrar oferta y cierre" en el menú de los tres puntos): se eligen los productos y servicios ofrecidos del mismo catálogo de "Nueva oportunidad" (agrupados por categoría), el monto cotizado y el resultado (Interesado, Cotizado, Venta cerrada, Requiere seguimiento o No interesado). Si la visita no tiene oportunidad se puede crear ahí mismo. Al completar, si la oportunidad sigue abierta, se le suman los productos y servicios y el monto, y el sistema propone pasarla a la etapa que corresponde al resultado (Cotizado → Cotizada, Venta cerrada → Aceptada, No interesado → Perdida, Interesado → En evaluación) con el mismo cuadro de "Cambiar de etapa" de Oportunidades. Las etapas solo avanzan: si la oportunidad ya está más adelante, solo se guardan los servicios y el monto y su etapa no cambia. Si se cancela ese cuadro, la visita queda completada igual.
- El nombre del cliente en la tabla abre su ficha a la derecha, sin salir de Visitas. La pestaña "Resultados" resume visitas realizadas, check-ins en el sitio y monto cotizado, y exporta el detalle a CSV.

## Agente de Ventas (el asistente que analiza clientes y sugiere qué hacer)
- Es un agente aparte de Agente Gemeseg. Cualquiera con acceso a Ventas lo ve en el selector del chat (botón del chat abajo a la derecha → barra de arriba con el nombre del agente → "Agente de Ventas"); no hay que asignárselo.
- Se abre de tres formas: desde el chat de siempre; con "Preguntar al agente" en la ficha de una empresa o persona (Directorio); y con "Preguntar al agente" en el menú "⋯" de una oportunidad o del detalle de un contrato. De las dos últimas el chat se abre ya hablando de esa empresa y manda solo la primera pregunta: "Analiza el historial de X: ¿qué ha pasado y qué puedo hacer ahora?". Arriba del cuadro de texto dice "Hablando de: X" y se puede quitar.
- Al empezar sin empresa muestra preguntas de un clic: "¿Qué debo atender hoy?" (plan del día: seguimientos vencidos y para hoy, oportunidades nuevas sin tocar, cotizadas sin respuesta, estancadas, renovaciones por atender y posibles clientes sin atender), "¿A quién podemos recuperar de los clientes inactivos?" (empresas que tuvieron contrato y ya no tienen ninguno vigente, ordenadas por valor y por qué tan reciente terminó, con por qué se fueron), "Dame un resumen de mi cartera", "¿Por qué perdimos clientes en los últimos 90 días?" y "¿Qué contratos vencen pronto y qué hago con cada uno?". También se le puede escribir el nombre de una empresa.
- Responde corto (unas pocas líneas) y sin números internos ni enlaces. Al analizar a un cliente da un resumen, "Qué pasó" (viñetas con fecha) y "Qué hacer" (2 o 3 acciones de una oración) y, si ayuda, un borrador de mensaje para copiar. Solo afirma lo que está registrado y dice "no consta" cuando falta un dato que cambia lo que recomienda. Solo ve Ventas; para cómo usar otras partes de la plataforma hay que usar Agente Gemeseg.
- Cada persona tiene hasta 30 mensajes al día con este agente. Las conversaciones quedan guardadas con la primera pregunta como título.

## Preguntas frecuentes de Ventas
- "¿Qué relación hay entre el Directorio y los Contratos?": ver arriba; un cliente tiene varios contratos y cada contrato varios servicios. El documento que se firma (Documentación) toma nombre, email y (si la plantilla lo mapea) otros datos de la ficha del cliente.
- "¿Un contacto que escribió por trabajo es un cliente?": no. Entra a Posibles clientes; se clasifica como Empleo (o Proveedor, Spam…) y se descarta con su motivo. Solo uno de servicio pasa a oportunidad y, cuando acepta, es cliente.
- "Un cliente que ya tengo pide otro servicio, ¿lo creo otra vez?": no. Si llega como posible cliente, "Pasar a oportunidad" → "Sumar la oportunidad" a su ficha; si lo pide directo, Oportunidades → "+ Nueva oportunidad". Así todo queda en su mismo historial.
- "¿Dónde veo mis tratos?" / "¿Dónde están las cuentas y los contactos?": los tratos son las Oportunidades; las cuentas y los contactos están en el Directorio (y ahí se editan los datos de una persona o empresa aunque aún no haya contratado: filtro de estado "Prospecto"); una empresa puede tener varias personas de contacto: la pestaña "Contactos" de su ficha guarda las adicionales, y el teléfono y correo principales están en "Datos".
- "¿Por qué me pide un motivo?": al rechazar una oportunidad, descartar un posible cliente, cancelar un contrato o renovarlo con menos servicios o menor valor, el motivo queda registrado para entender luego qué pasó. Si no se sabe, se elige "Sin información".
- "¿Cómo registro que un cliente renovó o contrató otro servicio?": Contratos → "⋯" → "Renovar" en el contrato que termina (o "+ Nuevo contrato" si es un servicio aparte) y marcar los servicios que incluye. Lo normal es que 30 días antes del fin ya exista su oportunidad "Renovación" en Oportunidades: se lleva a Aceptada y de ahí se crea el contrato nuevo.
- "¿Dónde anoto un incidente del servicio o lo que dijo el cliente al irse?": Contratos → abrir el contrato → "Incidentes y conversación de salida" → "Registrar". Ya no se anotan en el Historial del cliente.
- "Acepté una oportunidad, ¿dónde queda el contrato?": al cambiarla a "Aceptada" el sistema pregunta si fue un servicio o un producto y crea el contrato (o lo suma a uno vigente); lo ves en Contratos.
- "¿Dónde configuro los servicios, los motivos o las claves de conexión?": Ventas y CRM → Configuración, en su pestaña correspondiente.
- "¿Cómo le pido a la IA que analice a un cliente?": en su ficha (Directorio), en el menú "⋯" de su oportunidad o en su contrato, botón "Preguntar al agente". Abre el Agente de Ventas ya hablando de esa empresa.
- "¿Qué contratos están por vencer?": Contratos → filtro de estado "Por vencer".
- "¿Dónde genero el documento para firmar?": Contratos → abrir el contrato → "Generar documento", o Documentación → "+ Nuevo documento".
- "¿Cómo atiendo un referido?": Oportunidades → filtro "Sin responsable" → "⋯" → "Asignarme" → ir cambiando la Etapa (el empleado que lo refirió recibe aviso en cada cambio).
- "¿A quién tengo que atender hoy?": Oportunidades → pestaña "Para hoy". Al terminar con uno, "Hecho" y dejar su siguiente paso.
- "¿Dónde veo lo que se ha hecho con un cliente?": Directorio → "⋯" → "Ver ficha" → "Historial".
- "¿Qué clientes se están quedando atrás?": Dashboard → "Seguimientos vencidos" y "Clientes y prospectos estancados".
- "¿Cómo agrego un dato nuevo al cliente, por ejemplo Representante legal?": Directorio → "Campos" → "Agregar campo nuevo"; luego en la plantilla mapear la variable a ese campo.
- "El PDF no se genera / sale 'Falta llenar'": completar los campos obligatorios; si la plantilla dice que falta el documento, volver a "Descargar" o subir el Word.
- "El cliente no recibió el correo de firma": revisar el "Email para el envío" y el "Estado de la firma" ("No entregado" = rebotó); corregir con "Editar campos", regenerar y volver a enviar.`;

// Contratación Pública: desde 2026-10-01 solo estaba visible "Entidades Públicas" con el
// seguimiento de entregas. Desde 2026-10-18 también las Operaciones (Contratos, Horarios,
// Códigos de turno y Bitácoras). Informes y Textos Institucionales siguen ocultos, así que este
// manual NO los menciona (el agente no debe explicar pantallas que la persona no puede abrir).
// Ver "Submódulos ocultos" y "Bitácoras" en .agents/modules/contratacion-publica.md.
const CONTRATACION_PUBLICA = `# Contratación Pública — guía detallada

## Para qué sirve
Sirve para pedir y seguir, mes a mes, los documentos que otras áreas (RRHH, Financiero, Operaciones, Legal) deben entregar para el informe que se envía a cada entidad pública: qué se pidió, a quién, para cuándo y en qué estado está cada documento. También reúne las operaciones de guardianía de los contratos: contratos con sus puestos, horarios de los guardias y la revisión de las bitácoras que llenan los guardias.

## Acceso y pantallas
- Menú → "Contratación Pública" tiene estas pantallas: "Entidades Públicas", "Por aprobar" (solo el personal de Contratación Pública), "Por entregar", "Contratos", "Horarios", "Códigos de turno" y "Bitácoras".
- Con permiso "ver" una persona entra y entrega solo los documentos que le asignaron. Con "escribir" (el personal de Contratación Pública) arma las solicitudes, las envía, y aprueba o rechaza lo entregado.

## Entidades Públicas
- Buscar por nombre o RUC. "+ Nueva Entidad": Nombre * (ej. "Municipio de Guayaquil"), RUC, Dirección y los "Datos adicionales" que la empresa haya configurado (por defecto: Tipo de entidad, Contacto, Teléfono de contacto y Correo de contacto). Al hacer clic en una entidad se abre su detalle. El nombre no se puede repetir.
- "Campos de la entidad" (botón de arriba, solo personal de Contratación Pública): se crean, renombran, reordenan, marcan como obligatorios o desactivan los datos extra de cada entidad. Los tipos son Texto, Lista de opciones (una opción por línea), Número y Fecha. Un campo no se borra, se desactiva: deja de pedirse pero los datos ya guardados se conservan. Con el botón "Columnas" cada persona elige cuáles ver en la tabla.
- Cada fila tiene botones de icono: abrir la carpeta de la entidad en Drive, editar y archivar (en una entidad archivada es "Reactivar"). Las entidades no se pueden borrar desde el sistema: "Archivar" la oculta pero conserva sus datos, solicitudes y carpeta; se ve marcando "Mostrar archivadas" y se vuelve a mostrar con "Reactivar".
- Hay una sola carpeta de Google Drive para toda Contratación Pública y, dentro, cada entidad tiene su propia subcarpeta. Al crear una entidad se crea su subcarpeta; al cambiarle el nombre se renombra la subcarpeta. Archivar una entidad no toca su carpeta ni sus archivos en Drive.
- "Carpeta de Drive" (botón de arriba, solo personal de Contratación Pública): se pega una vez el enlace de la carpeta general. Debe estar compartida como Editor con la cuenta del sistema (se muestra en esa ventana).
- "Sincronizar": revisa la carpeta de Drive y muestra qué falta en cada lado, sin crear nada solo. También se revisa sola al abrir la pantalla (como mucho una vez cada 2 minutos) y se muestra "Última sincronización con Drive". Si hay una carpeta en Drive sin entidad, el aviso ofrece "Crear entidad". Si una entidad no tiene carpeta, ofrece "Crear carpeta". Cuando hay varias, aparece "Crear todas". Si alguien le cambia el nombre a una carpeta en Drive, sale "Actualizar nombre" (la entidad toma el nombre de Drive) o "Mantener el del sistema" (la carpeta vuelve al nombre del sistema). Si una carpeta desaparece de Drive, el aviso ofrece "Volver a crearla"; la entidad nunca se borra sola. Las entidades archivadas no generan avisos.

## Solicitud mensual de documentos (en el detalle de la entidad)
- Cada mes es una solicitud independiente: lo que se pide, las fechas y las personas pueden cambiar de un mes a otro y se pueden editar en cualquier momento, también después de enviada.
- "+ Nueva solicitud": se elige Año y Mes, y si empieza "En blanco" o "Copiando la solicitud anterior" (trae documentos, fechas y personas del mes anterior para no rehacerlos). Solo puede haber una solicitud por entidad y mes.
- "+ Agregar documento": Nombre *, Descripción, Área, Fecha límite * y una o más personas Responsables *. Cada documento tiene su propia fecha límite.
- "Enviar solicitud": avisa a cada responsable dentro del sistema (campana) y por correo; los correos salen como "Contratación Pública GEMESEG". Todos los documentos deben tener al menos un responsable. Una solicitud nueva queda en **Borrador**: mientras lo sea, los responsables no la ven en "Por entregar" ni reciben ningún aviso (en pantalla se muestra un aviso amarillo que lo recuerda). Solo al pulsar "Enviar solicitud" se les avisa.
- "Recordar al responsable": botón de campana en la fila de un documento pendiente o rechazado de una solicitud ya enviada; pide confirmación y manda un recordatorio por campana y correo a quienes lo deben.
- En la tabla de documentos de cada mes, las acciones de cada fila son botones de icono (pasa el mouse para ver su nombre): Entregar, Recordar, Editar y Quitar; los que no aplican a ese documento dejan su lugar vacío. Con el botón "Columnas" cada persona elige qué columnas ve y en qué orden (el Área viene oculta; se vuelve a mostrar desde ahí).
- Si después se agrega un documento, se cambia una fecha o se asigna a otra persona, esa persona recibe el aviso. A quien se quita ya no le aparece el documento.
- El avance de cada mes se ve en la lista (por ejemplo "3 de 5 aprobados") con los documentos vencidos marcados.

## Entregar un documento (quien es responsable)
- Al abrir el aviso de la campana se llega a la solicitud, donde solo se ven los documentos asignados a esa persona.
- Menú → "Contratación Pública" → "Por entregar": una lista única con todo lo que le asignaron a la persona, de cualquier entidad. Arriba van los rechazados (con su motivo), luego los vencidos y luego los demás por fecha límite. El botón "Entregar" de cada fila abre la ventana de entrega. Si el documento ya tenía un archivo entregado antes (por ejemplo uno rechazado), la ventana pregunta qué hacer con él: "Reemplazar el anterior" (se borra de Drive y queda solo el nuevo) o "Conservar ambos" (el anterior se queda en la carpeta de Drive); hay que elegir una para poder entregar.
- "Entregar": se sube un archivo (PDF, Word, Excel, imagen o ZIP, hasta 15 MB) o se pega un enlace. La ventana abre en "Subir archivo": es lo más fácil, porque quien revisa ve el archivo dentro del sistema sin pedir permisos. Si se pega un enlace (por ejemplo de Google Drive), debe estar compartido para que se pueda abrir. Queda en "Entregado" a la espera de revisión.
- Si fue "Rechazado", en la ventana de entrega se ve el motivo y el historial del documento (qué se entregó antes y por qué se rechazó); se vuelve a entregar. Un documento "Aprobado" ya no se puede cambiar.
- Estados: Pendiente → Entregado → Aprobado, o Rechazado (vuelve a Entregado cuando se entrega de nuevo).

## Revisar (personal de Contratación Pública)
- Menú → "Contratación Pública" → "Por aprobar": todo lo entregado y sin revisar de todas las entidades, lo más antiguo primero. "Revisar uno tras otro" (o el botón "Revisar" de una fila) abre la pantalla de revisión. En el detalle de una entidad, el botón "Revisar" de un documento entregado abre la misma pantalla.
- Pantalla de revisión: a la izquierda se ve el archivo (PDF, imagen, Word o Excel) dentro del sistema. Word tarda unos segundos porque se convierte a PDF para mostrarlo. Un Excel (.xlsx) se ve como una hoja de cálculo, parecida a la de Google Drive: pestañas por hoja abajo, letras de columna y números de fila que no se mueven, zoom con + y −, y al hacer clic en una celda se ve su contenido completo arriba (las flechas del teclado mueven la selección y Ctrl+F busca). Si se prefiere, "Ver como PDF" lo muestra como PDF y "Descargar" baja el archivo original; una hoja muy grande muestra solo las primeras 1000 filas y avisa. A la derecha están los datos del documento, su historial (entregó, rechazó con motivo, volvió a entregar, aprobó) y la decisión. Las flechas "Documento anterior / siguiente" recorren la lista, y al aprobar o rechazar pasa sola al siguiente que falta revisar. Esc cierra la pantalla.
- "Aprobar", o "Rechazar" con el motivo: se puede tocar un motivo rápido (Documento ilegible, Documento caducado, No corresponde al tipo solicitado, Falta firma o sello) y editarlo; el motivo es obligatorio (mínimo 5 letras) y le llega al responsable por la campana y por correo. Un documento ya aprobado se puede rechazar para reabrirlo.
- Los enlaces externos y los archivos ZIP no se pueden mostrar dentro del sistema: aparece "Abrir enlace" o "Descargar", y aprobar o rechazar funcionan igual.
- Cuando alguien entrega un documento, el aviso por la campana le llega a todo el personal de Contratación Pública que revisa (no por correo).
- Los archivos subidos se guardan en la subcarpeta de la entidad en Drive, dentro de una carpeta por mes. Sin la carpeta general de Contratación Pública (ver Entidades Públicas) solo se pueden entregar enlaces.

## Operaciones: Contratos, Horarios y Códigos de turno
- Menú → "Contratación Pública" → "Contratos": "+ Nuevo Contrato" pide Entidad Pública *, Número de contrato / orden de compra *, Objeto del servicio *, Referencia del proceso, Fecha de inicio *, Fecha de fin * y Valor total. Al abrir un contrato hay pestañas: Puestos, Adendas, Adjuntos y Horarios.
- Puestos (pestaña del contrato): cada puesto de servicio lleva Nombre (ej. "Garita norte"), Tipo de turno (8H, 12H o 24H), Cantidad de guardias y Guardias simultáneos requeridos (cuántos deben estar trabajando a la vez cada día). A cada puesto se le asignan sus guardias.
- Menú → "Contratación Pública" → "Códigos de turno": las letras que se usan en el horario (D, N, L…). Cada código tiene Código, Nombre, Color, Activo y "Es descanso/libre" (un descanso no cuenta como guardia trabajando). El horario de cada turno (de qué hora a qué hora) se pone en Bitácoras → "Horario de los turnos".
- Menú → "Contratación Pública" → "Horarios": "Nuevo Horario" pide Fecha inicio y Fecha fin (no tiene que ser un mes calendario, por ejemplo del 30 de julio al 29 de agosto) y no puede cruzarse con otro horario del mismo contrato. Dentro se llena qué código le toca a cada guardia cada día; el horario pasa de Borrador a Enviado y a Aprobado.

## Bitácoras (hojas de los guardias)
- Para qué sirve: los guardias llenan a mano la bitácora de su puesto (quién estuvo, de qué hora a qué hora y las novedades). Alguien la fotografía y la sube; el Agente Revisor de Bitácoras la lee y el sistema la compara con el horario del puesto para avisar si quien aparece en la hoja no es quien debía estar.
- Menú → "Contratación Pública" → "Bitácoras". Tiene dos pestañas: "Resumen" y "Hojas subidas", y filtros por puesto, resultado y fechas (con el botón de escoba para limpiarlos). Con permiso "ver" se mira todo; subir, corregir, resolver hallazgos y eliminar piden permiso de escribir en Contratación Pública.
- "Subir bitácora": se elige el Puesto (de ahí sale el horario contra el que se compara, así que debe ser el de esa hoja) y la foto: "Tomar foto" abre la cámara en el celular y "Elegir archivo" sube una foto (JPG, PNG, WebP o HEIC) o un PDF de hasta 15 MB. "Subir y leer" tarda unos segundos, hasta medio minuto, y abre la bitácora ya leída y comparada. "Cargar sin foto" crea la bitácora vacía para escribir lo que dice la hoja a mano.
- Al abrir una bitácora: a la izquierda la foto; a la derecha "Qué encontró la revisión" (los hallazgos), "Lo que dice la hoja" (lo que el agente leyó: días, guardias con su entrada y salida, y novedades) y "Lo que decía el horario" (quién le tocaba a cada guardia cada día y si aparece en la hoja). El resultado es Conforme (todo cuadra), A revisar (hay cosas por confirmar), Con errores (aparece alguien que no debía estar o falta alguien) o Sin comparar (no hay horario cargado para esos días).
- Hallazgos: otro guardia en lugar del programado (por ejemplo, el horario decía Juan y la hoja trae a Pedro), guardia que no aparece, guardia que estaba libre, nombre que no es de ninguno del puesto, horas distintas a las del turno (se toleran 30 minutos), nombre dudoso o ambiguo, día sin horario, horario sin aprobar, fecha fuera del contrato, puesto distinto al elegido y hoja repetida. Cada uno se marca "Resolver" o "Descartar" con una nota obligatoria que queda en el historial; "Reabrir" lo deja abierto otra vez.
- Si el agente leyó mal algo (la letra a mano a veces es difícil), se corrige en "Lo que dice la hoja" y se pulsa "Guardar y revisar de nuevo": la comparación se hace otra vez. "Volver a leer con el agente" vuelve a leer la foto y reemplaza lo corregido a mano (pide confirmación).
- El agente solo transcribe la hoja: no conoce el horario ni a los guardias mientras lee (así no "corrige" un nombre equivocado), y la comparación la hace el sistema con reglas fijas. Si el agente está desactivado o la lectura con IA no está configurada, la foto se guarda sin leer y se transcribe a mano.
- "Horario de los turnos" (botón de arriba): se escribe de qué hora a qué hora es cada turno, por ejemplo D de 07:00 a 19:00 y N de 19:00 a 07:00 (la noche cruza la medianoche). Sin esto solo se compara quién estuvo, no las horas.
- "Resumen": cuántas bitácoras cuadran con el horario (%), hallazgos abiertos, la novedad que más se repite, el día y el puesto con más novedades, las novedades por tipo (ingreso de personas, vehículos, rondas, cambio de turno, equipos, incidente) y las más graves.

## Recordatorios
- Cada día el sistema recuerda a los responsables los documentos Pendientes o Rechazados cuya fecha límite es dentro de 3 días y los que vencen ese mismo día, dentro del sistema y por correo.

## Preguntas frecuentes
- "No veo Contratación Pública": pedir el permiso a un administrador (Administración → Permisos de usuario) o por "Reportar un problema a Sistemas".
- "No puedo subir un archivo": revisar que sea PDF, Word, Excel, imagen o ZIP de hasta 15 MB; si dice que falta configurar la carpeta de Drive, pegar un enlace o avisar al personal de Contratación Pública.
- "No me deja enviar la solicitud": falta agregar al menos un documento, o algún documento no tiene responsable.
- "Ya no recibo el recordatorio de un documento": solo se recuerdan los Pendientes o Rechazados; uno Entregado o Aprobado ya no genera recordatorios.
- "El agente leyó mal un nombre o una hora": abrir la bitácora, corregirlo en "Lo que dice la hoja" y pulsar "Guardar y revisar de nuevo".
- "Sale «Día sin horario»": falta cargar el horario de ese período del contrato (Contratación Pública → Horarios).
- "No puedo subir una bitácora": hace falta permiso de escribir en Contratación Pública; si el aviso dice que la lectura con IA no está configurada o el agente está desactivado, la foto se guarda igual y se escribe a mano.
- "Un hallazgo no es un error": pulsar "Descartar" y explicar por qué en la nota.`;

const CACAO = `# Cacao — guía

## Acceso
- Menú → "Cacao" abre el Dashboard (no hay submenú: todo se navega desde ahí). "📖 Guía del Sistema" tiene una guía de 8 pasos con botones "Ir →" y un glosario.
- Dashboard: indicadores clicables (Valor Inventario en $ y kg, Exposición Sin Fijar, CxP Pendiente, CxC Pendiente), "Accesos directos" (Recepciones, Lotes, Fijaciones, Liquidaciones, Embarques, CxP, CxC), "Configuración" (Calidades, Proveedores, Clientes) y "Últimos Embarques".

## Flujo del negocio y cómo se relacionan las pantallas
Proveedor → Recepción → Lote (se crea solo) → Liquidación → Cuenta por Pagar (se crea sola). En paralelo, Lote → Fijación de precio. Y Lote → Embarque → descuenta del kárdex y crea la Cuenta por Cobrar.

## Configuración inicial (maestros)
- Proveedores: Nombre *, Contacto, Teléfono, Banco, Condiciones de Pago.
- Clientes / Exportadores: Nombre *, País, Contacto, Email, Teléfono.
- Calidades del Cacao: Nombre *, Descuento Humedad (%), Descuento Impurezas (%), Tipo de precio (Fijo o Provisional) y Precio Fijo ($/kg) si es fijo.

## Pasos
1. Recepción ("+ Nueva Recepción"): Fecha *, Proveedor *, Nro. Guía de Remisión *, Unidad de entrada * (Toneladas, Kilogramos o Sacos; saco = 90 kg por defecto), Peso Bruto, Tara, Humedad %, Impurezas %, Calidad *, Precio Provisional o Fijo ($/kg), Diferencial Pactado ($/T). Muestra peso neto, descuentos y el lote que se asignará. Al guardar convierte todo a kg, crea el lote (LOTE-AAAA-00001, Abierto) y registra la entrada en el kárdex.
2. Lotes: Código, Calidad, Peso Neto, Costo Promedio, Valor, Estado (Abierto/Cerrado). "Ver Kardex" muestra entradas, salidas y saldos en kg; "🖨️ Descargar PDF".
3. Liquidación ("+ Nueva Liquidación"): Fecha *, Proveedor *, Periodo; "+ Agregar Lote" (o "Usar todo"); desglose por lote con descuentos editables; MONTO A PAGAR. Al guardar crea la Cuenta por Pagar (vence a 30 días). Estados: Pendiente, Parcial, Pagada.
4. Fijaciones de Precio: "Tabla de Exposición Abierta" (lotes con precio provisional, fecha límite, "Vence hoy"); Precio ICE Cocoa de referencia editable con clic; "Nueva Fijación": Lote *, Precio Fijado ($/kg) *, Fecha Límite (muestra precio sugerido = referencia + diferencial). Estados Abierta → "Fijar" → Fijada.
5. Embarque ("+ Nuevo Embarque"): Fecha *, Cliente *, Referencia (Contrato) *, Unidad de Venta *, Precio Venta ($/kg) *; "+ Agregar Lote". Muestra peso, costo y margen. Al guardar valida el saldo del lote ("Lote X no tiene suficiente peso"), descuenta y cierra el lote si queda en 0, registra la salida y crea la Cuenta por Cobrar (vence a 60 días).
6. Cuentas por Pagar: "Pagar" → Monto, Método (Efectivo, Cheque, Transferencia), Referencia. Cuentas por Cobrar: "Cobrar". Se aceptan pagos parciales; no se paga más que el saldo.`;

const CUSTODIAS = `# Custodias — guía

## Acceso
- Menú → "Custodias": "Dashboard Operativo", "Lista de Operaciones", "Nueva Custodia", "Nómina y Liquidación", "Consulta por Cédula", "Asistente GEME-BOT".
- Custodias son los viajes de escolta; el personal (chofer y custodios) sale del padrón de guardias.

## Nueva Custodia
- "Tipo de Custodia *": HACIENDA ($20 por persona), PUERTO ($10 por persona) o VIP ($23 por persona); el costo se calcula para 3 personas.
- Datos Generales: Número de Guía *, Cliente, Placa GEMESEG. Ruta y Horarios: direcciones y fecha/hora de salida y llegada.
- Personal Asignado: Chofer, Custodio 1 y Custodio 2 (obligatorios, tres personas distintas); se buscan por nombre o cédula; "+ Manual" si no está en la lista.
- Según el tipo: Hacienda → Nombre Hacienda * y Cantidad Sacos *; Puerto → al menos un contenedor (número, sello, guía, BL opcionales); VIP → nada extra. Observaciones.
- "Registrar Custodia" → pregunta si imprimir la Orden de Custodia ("Imprimir PDF").

## Lista de Operaciones
- Filtros por tipo, estado y fechas ("Filtrar", "Limpiar"). Columnas Guía, Tipo, Cliente, Placa, Horario, Personal, Estado.
- El estado se cambia en la misma fila: LISTO PARA CUSTODIAR → EN CAMINO → LLEGÓ. "Ver Detalle" abre la Orden de Custodia con botón PDF. "Eliminar" pide confirmación.

## Nómina y Liquidación
- Fecha Inicio * y Fecha Fin * → "Calcular Nómina". Solo cuentan los viajes en LLEGÓ (si un viaje no aparece, revisar que esté en LLEGÓ).
- Tarjetas de viajes, empleados y total a pagar; tabla por trabajador con viajes y montos por tipo; GRAN TOTAL. "Ver Matriz Cronológica". PDFs: "PDF General (Matriz)", "PDF Masivo (Matriz)" y "Rol de Pago" individual (elegir el empleado).

## Otras
- Consulta por Cédula: Cédula * y Mes opcional → "Buscar Viajes" (total de viajes, ingreso acumulado, detalle).
- Asistente GEME-BOT: chat de consultas rápidas por palabras clave (placa más usada en PUERTO este mes, guardia con más viajes de HACIENDA en 30 días, primer viaje/antigüedad); es distinto de Agente Gemeseg.`;

const ADMIN = `# Administración — guía

- "Administración": indicadores de usuarios y proyectos, salud de proyectos y resumen de tareas.
- Usuarios: buscar por nombre o email, filtros por rol y ubicación. "Nuevo usuario": Nombre completo *, Email *, Contraseña *, Documento de identidad, Cargo, Rol * (Administrador, Gerente o Empleado) y Ubicación ("+ Agregar nueva ubicación..." crea una sede ahí mismo). Editar y activar/desactivar usuarios (requiere rol Administrador).
- "Permisos Usuarios": elegir el usuario y marcar por sección "Ver" y "Escribir" (Escribir requiere Ver) → "Guardar Permisos". Un usuario nuevo Empleado o Gerente arranca sin secciones (solo lo común); un Administrador arranca con todo.
- "Módulos visibles para todos" (ícono de tuerca en permisos): marca secciones que ve todo el personal sin permiso individual.
- "Mi Empresa" (si está habilitada): logo y colores de la empresa, con vista previa.
- Bitácora → "Configuración" (solo si la empresa tiene la bitácora encendida; la ven administradores y gerentes), con dos pestañas. "Hojas del día": tabla de las personas de la empresa con su Estado ("Activa" o "No activa"), "Registrando desde" y "Último cambio por". Por defecto nadie está activo. El botón "Activar" o "Desactivar" de cada fila pide confirmar: al activar se empieza a registrar su actividad desde ese momento y se le avisa a la persona; al desactivar se deja de registrar, lo ya registrado se conserva y también se le avisa. "Google": muestra si la conexión con Google está "Lista" o "Falta configurar" (y qué falta), cuántas personas se leen y el último evento guardado; el botón "Leer Google ahora" trae en ese momento el inicio de sesión y la actividad en Drive de las personas activadas de la empresa (además se lee sola cada hora). Quien tenga el permiso ve el resultado en Bitácora → "Dashboard"; cada persona activada ve el suyo en "Mi hoja del día".
- Gerente: ve "Administración", "Mi Empresa" y "Permisos Usuarios" de su empresa en solo lectura. Si intenta crear, editar, guardar o marcar algo, aparece "No tienes permiso para esto": es solo para administradores y debe contactar a un administrador de su empresa para que lo haga.`;

const SISTEMAS = `# Sistemas — guía

- Dashboard: tickets Abiertos, En revisión, Resueltos y Este mes; una dona "Tickets por tipo" (Errores, Mejoras, Permisos y Otros, con cantidad y porcentaje; al pasar el cursor por un tipo el centro muestra su cantidad); "Tiempo promedio de resolución" general (promedio de lo que tardan en quedar Resueltos los tickets; muestra "—" si aún no hay ninguno resuelto); y "Últimos tickets". Accesos a Soporte Técnico, "Publicar novedad de la app", Herramientas, Agentes y "Base de conocimiento de Agente Gemeseg".
- Novedades: menú Sistemas → Novedades. "Nueva novedad": se escribe Título y "Qué cambió", se marcan los módulos afectados y la pantalla muestra a cuántas personas llegará y la lista de quiénes son (nombre, correo y empresa), más "No la recibirán" con el motivo de cada persona que queda fuera (cuenta inactiva, módulo negado, etc.); "Publicar" pide confirmar. El aviso le sale en las notificaciones (ícono de campana, nunca por correo) solo a quienes tienen acceso a alguno de esos módulos, sin contar a quien publica. No se puede deshacer; la tabla guarda el historial.
- Soporte Técnico: los reportes que llegan por la llave inglesa, en una tabla (Título, Tipo, Estado, Descripción, Reportado por, Empresa, Fecha, Adjuntos; el botón "Columnas" elige cuáles ver y un clic en el encabezado ordena). Arriba hay una búsqueda (título, descripción, quién reportó o empresa), filtros de Estado, Tipo y Empresa, y la escoba para limpiarlos. El estado se cambia directamente en la columna Estado (Abierto, En revisión, Resuelto); un clic en la fila abre el detalle con la descripción completa y los adjuntos. Cuando alguien reporta algo, las notificaciones (ícono de campana) avisan ("Nuevo reporte para Sistemas") solo a quienes tienen Sistemas con "Escribir" marcado en Permisos Usuarios; nunca por correo. Ahí también se configura la carpeta de Drive para capturas ("Probar conexión").
- Herramientas: catálogo (Nombre, Categoría, Versión, Licencia) y asignación a usuarios con auditoría; lo asignado aparece en "Mi perfil". Es parte de Sistemas (no es un módulo aparte en Permisos Usuarios): la ve quien tiene Sistemas.
- Agentes: crear agentes de IA con nombre, instrucciones y alcance, y asignarlos a usuarios. Hay agentes que trabajan solos y no conversan, como el Agente Revisor de Bitácoras (lee las fotos de las bitácoras de Contratación Pública): en su tarjeta, el botón del libro explica qué hace, qué decide el sistema y qué límites tiene, y el botón de actividad muestra cada vez que trabajó (quién lo pidió, sobre qué, cuánto tardó, tokens, si falló y por qué). Abajo, "Actividad de los agentes que trabajan solos" resume los últimos 30 días. Se puede editar su texto de instrucciones (cómo es la hoja de la empresa) y desactivarlo; no se asigna a personas ni se crea a mano.
- Base de conocimiento (menú Sistemas → "Base de Conocimiento"): texto en Markdown que Agente Gemeseg usa además de este manual, para lo propio de la empresa (políticas, contactos, procesos internos). Se divide con encabezados "## CLAVE" exactos en mayúsculas (## GENERAL, ## RRHH, ## VENTAS, ## CACAO, ## CUSTODIAS, ## CONTRATACION_PUBLICA, ## SISTEMAS…). Lo de ## GENERAL o antes del primer encabezado lo recibe cualquier usuario; cada otra sección solo quien tiene acceso a ella. Un encabezado mal escrito no abre sección nueva (se pega a la anterior) y la pantalla avisa al guardar.`;

const BITACORA = `# Bitácora — guía

- Menú "Bitácora" (módulo con submenú). Cada persona ve solo lo que le toca: "Dashboard" y "Actividad del día" (con permiso para ver la bitácora del equipo), "Mi hoja del día" (quien la tiene o la tuvo activada) y "Configuración" (administradores y gerentes).
- "Dashboard": las métricas del equipo. Arriba, "Período" (Últimos 7, 14 o 30 días). Tarjetas: "Hojas activas", "Personas con actividad" (promedio por día), "Hora media de inicio" y "Hora media de fin" (de la primera y la última actividad de cada día) y "Eventos registrados". Gráficos: "Personas con actividad por día", "Eventos por día" (app.gemeseg y Google), "Actividad por hora del día" (hora de Ecuador) y "Dónde se registra la actividad" (eventos por módulo). Son cifras del equipo, no una evaluación de nadie. Si nadie tiene la hoja activada, la pantalla lo dice y, a quien administra, le ofrece ir a Configuración.
- "Actividad del día": el detalle completo de un día. Arriba se elige el día (flechas, calendario o "Hoy"). Tarjetas del día ("Hojas activas", "Con actividad", "Sin actividad", "Eventos registrados") y una persona por fila con "Primera", "Última", "En la app", "En Google" y "Mayor hueco"; un clic en un encabezado ordena. Aparecen las personas a las que se les activó la hoja y, aparte, quienes ya no la tienen pero registraron algo ese día, marcadas "Solo historial".
- Un clic en una persona abre su hoja del día debajo: primera y última actividad, "Huecos sin actividad" (silencios de 1 h o más entre una acción y la siguiente) y una lista con la hora, dónde ("app.gemeseg" con el módulo, o "Google") y qué hizo, con nombres (por ejemplo "Editó tarea: «Informe de custodias»"). Las acciones iguales seguidas se juntan en una fila ("3 veces"). Todas las horas son de Ecuador. Cada consulta de la hoja de una persona queda registrada.
- Qué cuenta: lo que se guarda, crea, edita o elimina en app.gemeseg, el inicio de sesión en app.gemeseg y, de Google, los inicios de sesión y la actividad en Drive. Mirar pantallas, tener una pestaña abierta o trabajar en Word o Excel en el computador no cuenta, así que quien trabaja ahí aparece con poca actividad: la hoja sirve para saber a quién preguntar, no como prueba. No hay metas, alertas ni sanciones automáticas.
- Quién aparece y la conexión con Google se manejan en "Configuración" (pestañas "Hojas del día" y "Google"); por defecto nadie tiene hoja. Cada persona ve su propia hoja en "Mi hoja del día".`;

/** Bloques por clave de ALL_SECTIONS. GENERAL no está acá: va siempre. */
export const SECTION_GUIDES: Record<string, string> = {
  RRHH,
  VENTAS,
  CONTRATACION_PUBLICA,
  CACAO,
  CUSTODIAS,
  ADMIN,
  SISTEMAS,
  BITACORA,
};

export function buildSystemGuide(allowedSectionKeys: string[]): string {
  const allowed = new Set(allowedSectionKeys);
  const blocks = Object.entries(SECTION_GUIDES)
    .filter(([key]) => allowed.has(key))
    .map(([, text]) => text);
  return [GENERAL, ...blocks].join('\n\n');
}
