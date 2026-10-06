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
- Es solo de consulta: nombre, rol (Administrador, Gerente o Empleado), correo corporativo, documento de identidad, cargo, departamento, fecha de ingreso, contadores de proyectos y tareas, y "Herramientas asignadas".
- Desde el perfil no se editan los datos personales (para cambiarlos se le pide al administrador), pero sí se cambia la contraseña: al final de la tarjeta, en "Seguridad", el botón "Cambiar contraseña" abre un cuadro con Contraseña actual, Contraseña nueva (mínimo 8 caracteres) y repetirla; cada campo tiene un ojito para ver lo escrito. Al guardar se cierra la sesión en todos los demás dispositivos; en el que se está usando sigue abierta. Las cuentas que entran solo con Google no tienen contraseña: ahí el perfil indica usar "¿Olvidaste tu contraseña?" para crear una.

## Inicio
En este orden:
1. Si tienes encuestas por responder, un aviso azul: "Tienes N encuesta(s) pendiente(s) por responder — click para verla(s)".
2. La tarjeta "¿Conoces a alguien interesado en Gemeseg?" con el botón "Referir un cliente".
3. "Mis tareas", con el botón "+ Nueva tarea".

## Referir un cliente (referidos) — cualquier usuario puede hacerlo
- Dónde: en "Inicio", tarjeta "¿Conoces a alguien interesado en Gemeseg?" → botón "Referir un cliente".
- Se abre "Mis Referidos": la lista de las personas que ya referiste, con la fecha y la etapa en que va cada una (con su color). Si está vacía dice "Todavía no has referido a nadie."
- Para referir: "+ Referir un cliente" → llenar "Nombre completo *" (mínimo 3 letras), "Celular", "Correo", "Servicio requerido" (si el servicio tiene sub-servicios aparecen casillas opcionales de "Sub-servicios" para marcar uno o varios) y "Nota" (cualquier detalle útil: qué necesita, cuándo llamarlo, cómo lo conoces) → "Enviar referido". Aparece "Referido enviado. Ventas se pondrá en contacto."
- Qué pasa después: el equipo comercial recibe al cliente en su lista y alguien lo toma para atenderlo. Cada vez que ese cliente avanza de etapa, te llega una notificación en la campana ("Tu referido X pasó a la etapa Y") y un correo; al abrirla se abre directo "Mis Referidos".
- Consejos: pon al menos celular o correo para que puedan contactarlo; revisa "Mis Referidos" para ver en qué va. Quien refiere no ve montos ni datos comerciales del cliente.

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
- "Tareas (N)": tabla con #, Título, Estado, Prioridad, Asignado y fechas. Botones "Ver tablero Kanban" y "+ Nueva tarea".

### Crear una tarea
- Desde "Inicio" ("+ Nueva tarea") o desde el proyecto ("+ Nueva tarea").
- Campos: "Proyecto *", "Título *", Descripción, Prioridad (Baja, Media, Alta, Urgente), Horas estimadas, Fecha inicio, Fecha fin, "Asignar a" (se pueden elegir varios miembros del proyecto) y Estado inicial → "Crear tarea".
- Solo se puede asignar a personas que sean miembros del proyecto: si no aparece alguien, primero hay que agregarlo en "Miembros".

### Estados de una tarea y cómo moverla
- Por hacer → En progreso → En revisión → Completado.
- En el tablero Kanban ("Ver tablero Kanban") hay 4 columnas; el botón ▶ de cada tarjeta la pasa a la columna siguiente (no se arrastra).
- O abriendo la tarea: en "Tarea #N" se editan todos los campos, incluido el Estado (4 botones) → "Guardar y volver". "Eliminar tarea" la borra. Si sales con cambios sin guardar, el sistema pregunta si guardar o descartar.
- Las tareas no tienen comentarios; para dejar notas se usa la Descripción. La fecha que se muestra como vencimiento es la "Fecha fin".

### "Mis tareas" en Inicio
- Botones de estado: Todos, Por hacer, En progreso (filtro por defecto), En revisión, Completado. Casilla "Asignadas a mí" y selector "Todos los proyectos". El sistema recuerda tus filtros.
- Sin "Asignadas a mí" se listan las tareas de todos los proyectos donde eres miembro. Se ordena con clic en los encabezados. Clic en la fila abre la tarea; clic en el proyecto abre el proyecto.
- Si "no ves tus tareas": revisa que el filtro de estado no esté en "En progreso" (es el que viene por defecto) y que seas miembro del proyecto.

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
- "Documentos Generados": Guardia, Cédula, Plantilla, Fecha, Estado, "Ver PDF". La firma es física (se imprime y se firma a mano). Por ahora aplica solo a Guardias.

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
- Menú → "Ventas y CRM": "Dashboard", "Clientes" y "Contratos".
- Permiso "ver": listar y consultar. "Escribir": crear, editar, borrar, cambiar etapa, asignarse, registrar actividades, configurar y generar/enviar contratos.

## Dashboard
- Menú → "Ventas y CRM" → "Dashboard": cómo van los clientes. Arriba, un selector "Mis clientes" / "Toda la empresa" (ADMIN y MANAGER también pueden elegir a un vendedor) y un rango de fechas (Esta semana, Este mes, Mes pasado, Últimos 90 días). El rango solo afecta a "Nuevos clientes" y "Referidos"; todo lo demás es cómo están las cosas hoy.
- Contadores: "Seguimientos vencidos", "Para hoy", "Sin siguiente paso" (los tres abren Clientes ya filtrado) y "Aceptación" (aceptados frente a rechazados).
- Bloques: "Clientes por etapa" (cada barra abre Clientes en esa etapa), "Clientes estancados" (más de 7 días en la misma etapa; el clic abre su ficha), "Nuevos clientes" (por semana), "Referidos", "Contratos de estos clientes" y, al mirar a más de una persona, "Clientes por responsable" (con "Sin responsable" arriba: clientes que nadie atiende).
- No muestra dinero.

## Relación entre los sub-módulos Clientes y Contratos
- Clientes es la ficha de cada cliente (sus datos, su etapa en el pipeline, quién lo atiende y quién lo refirió).
- Contratos genera contratos a partir de Plantillas (un Word con variables) y los envía a firma electrónica (SignWell).
- Un contrato puede (no es obligatorio) enlazarse a un cliente de la ficha: en "Nuevo Contrato" → "Datos de envío" se elige el cliente y se autocompletan "Nombre para el envío" y "Email para el envío".
- Los datos de la ficha del cliente alimentan las variables del contrato: en la plantilla, cada variable se puede "Mapear a campo de Cliente" (por ejemplo [Cliente.RUC] → campo "Cédula / RUC"). Al crear el contrato, el botón "Autocompletar campos de cliente: [nombre]" (en el grupo "Campos de (Cliente)") llena esas variables. Por eso conviene que la ficha del cliente esté completa antes de hacer su contrato, y que los campos de la ficha coincidan con lo que piden las plantillas.
- Los referidos que hace cualquier empleado entran como clientes normales (Fuente = Referido) y siguen el mismo pipeline.
- Borrar un cliente no borra sus contratos.

## Clientes
- Barra: "Etapas" (pipeline) y "Campos" (ficha). Filtros: "Buscar por nombre, email, RUC, teléfono o responsable...", "Todos los responsables", limpiar filtros, "+ Nuevo cliente".
- Dos pestañas: "Todos" y "Hoy (N)". Filtros extra: "Todas las etapas", "Sin responsable" y los que llegan desde el Dashboard (seguimiento vencido/para hoy/sin definir, solo referidos), que aparecen como "Mostrando: … ✕".
- Tabla "Todos": Nombre, Email, Teléfono, Etapa, Siguiente paso, Para cuándo, Responsable, Referido por, Acciones (se pueden mostrar Fecha y otros campos; columnas ordenables y redimensionables).
  - Etapa: desplegable en la misma fila (incluye "— Sin etapa —"). Al elegir otra se abre "Cambiar de etapa": muestra "pasará de [etapa actual] → [etapa nueva]" y pregunta el siguiente paso y para cuándo (se puede dejar vacío); botón "Cambiar de etapa". Si la etapa nueva es final (Aceptado/Rechazado) solo pide "Confirmar cambio" y se borra el siguiente paso. Al terminar: "Etapa actualizada." y, si vino por referido, "Se notificó a quien lo refirió." (campana + correo al empleado que lo refirió).
  - Siguiente paso / Para cuándo: clic para editarlos. La fecha sale en rojo si está vencida ("Vencido · fecha") y en ámbar si es hoy.
  - Responsable: quien atiende al cliente (solo se muestra el nombre o "Sin asignar").
  - Acciones (botón "⋯"): "Ver ficha", "Editar cliente", "Asignarme este cliente" (si no tiene responsable) o "Quitarme este cliente" (si eres tú), y "Eliminar" ("Los contratos ya creados no se borran"). Nadie asigna a otra persona ni quita a otro.
- Pestaña "Hoy": a quién atender hoy. Cada quien ve sus clientes asignados que no están en etapa final, en este orden: seguimiento vencido (el más atrasado primero), para hoy y sin fecha; los de fecha futura no aparecen. Columnas: Siguiente paso, Para cuándo, Etapa, Teléfono. ADMIN y MANAGER tienen un selector "Mis clientes" / "Todos los clientes" / un vendedor. En cada fila, "Hecho": pide "¿Qué hiciste?" (tipo y texto, opcional; queda en el historial del cliente) y el nuevo siguiente paso (vacío = el cliente queda sin siguiente paso); botón "Marcar hecho".
- Ficha del cliente ("⋯" → "Ver ficha"): panel a la derecha con sus datos, su siguiente paso (botón "Editar") y el "Historial", la línea de tiempo: registro del cliente, cambios de etapa, contratos vinculados (creado, enviado a firma, firmado) y las notas. "Agregar a la línea de tiempo": Tipo (Nota, Llamada, Reunión, Correo u Otro, que pide "¿Cuál?") y el texto → "Agregar". "Correo" es solo un registro a mano: no envía ni lee correos. Cada nota se puede editar o borrar solo por quien la escribió o por un administrador. Los cambios de etapa solo aparecen desde que se empezaron a guardar (30/09/2026) y los contratos solo si se vincularon al cliente al crearlos.
- "+ Nuevo cliente": Nombre / Razón social (obligatorio), Fecha de ingreso (por defecto hoy; se puede cambiar a una fecha pasada para registrar prospectos de meses anteriores, nunca futura), Email (opcional), Teléfono, Cédula / RUC, Dirección, Fuente (Referido / Campaña / Otro con texto), Servicio requerido (Monitoreo / Soluciones Tecnológicas / Seguridad Física), Sub-servicios (opcional: casillas que dependen del servicio elegido, p. ej. Seguridad Física → Agentes de Seguridad, Custodia de Mercadería en Movimiento, Seguridad VIP, Seguridad para Eventos), Observaciones, y los campos personalizados → "Guardar".
- Reglas automáticas: todo cliente nuevo entra en la etapa inicial ("Recibido" por defecto); quien lo crea a mano queda como Responsable; los referidos llegan SIN responsable hasta que alguien pulse "Asignarme" (no llega aviso a Ventas de un referido nuevo: hay que revisar la lista, por ejemplo filtrando los que no tienen responsable).
- Tres datos distintos: Responsable (quién lo atiende, autoasignado), Referido por (empleado que lo refirió, fijo, no editable), Creado por (solo registro).
- "Campos" ("Configurar campos de la ficha"): renombrar campos, en listas "Opciones" (agregar/quitar, "Permitir Otro con texto libre"), "Agregar campo nuevo" (Texto, Número, Fecha, Sí/No, Lista de opciones) → "Añadir campo". Los campos base no se borran; los personalizados sí. "Columnas de tu tabla": mostrar/ocultar/ordenar columnas (preferencia personal de ese navegador). Estos campos son los que se mapean a variables de contratos.
- "Etapas" ("Etapas del pipeline de Clientes"): por defecto Recibido (inicial) → Leído → Cotizado → Aceptado (final) / Rechazado (final). Color, nombre, estrella de inicial (solo una), casilla "Final", reordenar, eliminar, "Agregar etapa nueva". La inicial no puede ser final ni ir después de una final; no se borra una etapa con clientes (muestra cuáles).

## Contratos
- Lista: "Ayuda" ("Cómo funciona Contratos"), carpeta de Drive (si está configurada), "Plantillas", "+ Nuevo contrato". Buscar por número, cliente, email o plantilla; filtro por estado. Clic en la fila abre el detalle.
- Estados: Borrador (al crearlo) → Generando (mientras se arma el PDF) → Listo (PDF generado) → Enviado (en SignWell) → Firmado.

### Plantillas (paso previo, una sola vez por tipo de contrato)
- "Plantillas" → "+ Nueva plantilla" → asistente "1. Fuente del documento" → "2. Detectar variables" → "3. Configurar campos".
  1. Nombre, Descripción y el Word: pestaña "Link de Google Drive" (compartido como "Cualquier persona con el enlace", Lector) + "Descargar", o pestaña "Subir documento" (.docx).
  2. "🔍 Detectar variables del documento": busca textos [Variable] o <<Variable>> en el Word. Las que tienen punto se agrupan: [Cliente.RUC] en "Campos de (Cliente)", [Contrato.X] en "Campos de (Contrato)"; las demás en "Otros".
  3. Pestaña "Campos": por cada variable, Etiqueta, Tipo (Texto, Número, Fecha, Email, Casilla, Selección, Firma, Tabla, "Número de Contrato (automático)"), "Req." (obligatoria) y "Cliente" (la llena o firma el cliente al firmar). Al expandir (▸): "Mapear a campo de Cliente", texto guía para el firmante, columnas y máximo de filas en Tablas, opciones en Selección.
  4. Pestaña "Numeración y correo": prefijo, dígitos y próximo número del contrato (ej. MEGAMONT-00001); asunto y cuerpo del correo de envío → "Guardar plantilla".

### Crear y enviar un contrato
1. "+ Nuevo contrato" → "Seleccionar plantilla".
2. "Datos de envío": elegir el cliente ("— Seleccionar cliente —"; "Ir a Clientes" abre el alta de uno nuevo) o escribir "Nombre para el envío *" y "Email para el envío *".
3. Llenar los campos (obligatorios con *). En "Campos de (Cliente)" usar "Autocompletar campos de cliente". Los campos marcados "Cliente" se ven como "El cliente lo completará/firmará al momento de firmar". Si hay número automático: "Se asignará automáticamente".
4. "⚡ Generar Contrato": guarda el contrato en Borrador y abre su ficha (todavía no hace el PDF). Si falta algo: "Falta llenar: X".
5. En la ficha, "⚡ Generar PDF" (luego "🔄 Regenerar PDF"): llena el Word y lo convierte a PDF → estado Listo (si hay carpeta de Drive, también se sube ahí).
6. "✉️ Enviar a Firma Electrónica (SignWell)" (solo en Listo): SignWell manda el correo al cliente → Enviado. El correo va al "Email para el envío" del contrato con el asunto/cuerpo de la plantilla; para cambiar el destinatario se usa "✏️ Editar campos" y se regenera.
7. Pasa a Firmado: automáticamente cuando SignWell avisa, con "🔄 Actualizar" en "Estado de la firma", o subiendo el PDF firmado ("📤 Subir PDF firmado"). El "Historial de documentos" guarda PDF generado, enviado y firmado.
- Tablas que llena el cliente: si la plantilla tiene tablas marcadas "Cliente", la ficha muestra "📋 Copiar link para el cliente"; el cliente abre el enlace (sin cuenta), completa "Completa tu información" y al enviar el sistema genera el PDF y lo lleva directo a firmar. El enlace sirve una sola vez.
- Editar o regenerar un contrato ya Enviado muestra una advertencia: no cancela el envío en SignWell (el cliente seguiría viendo la versión anterior). Un contrato Firmado ya no se edita.
- Estados de firma en SignWell: Pendiente de firma, Visto por el cliente, Firmado, Rechazado por el cliente, No entregado, Expirado.

## Preguntas frecuentes de Ventas
- "¿Qué relación hay entre Clientes y Contratos?": ver arriba; el contrato toma nombre, email y (si la plantilla lo mapea) otros datos de la ficha del cliente.
- "¿Cómo atiendo un referido?": Clientes → filtro "Sin responsable" → "⋯" → "Asignarme este cliente" → ir cambiando la Etapa (el empleado que lo refirió recibe aviso en cada cambio).
- "¿A quién tengo que atender hoy?": Clientes → pestaña "Hoy". Al terminar con uno, "Hecho" y dejar su siguiente paso.
- "¿Dónde veo lo que se ha hecho con un cliente?": Clientes → "⋯" → "Ver ficha" → "Historial".
- "¿Qué clientes se están quedando atrás?": Dashboard → "Seguimientos vencidos" y "Clientes estancados".
- "¿Cómo agrego un dato nuevo al cliente, por ejemplo Representante legal?": Clientes → "Campos" → "Agregar campo nuevo"; luego en la plantilla mapear la variable a ese campo.
- "El PDF no se genera / sale 'Falta llenar'": completar los campos obligatorios; si la plantilla dice que falta el documento, volver a "Descargar" o subir el Word.
- "El cliente no recibió el correo de firma": revisar el "Email para el envío" y el "Estado de la firma" ("No entregado" = rebotó); corregir con "Editar campos", regenerar y volver a enviar.`;

// Contratación Pública: desde 2026-10-01 solo está visible "Entidades Públicas"
// con el seguimiento de entregas de documentos. Contratos, Puestos, Horarios,
// Informes, Códigos de Turno y Textos Institucionales siguen en el código pero
// están ocultos, así que este manual NO los menciona (el agente no debe
// explicar pantallas que la persona no puede abrir). La guía completa anterior
// se recupera del historial de git (commit anterior a este cambio) y vuelve acá
// cuando se reactiven; ver "Submódulos ocultos" en .agents/modules/contratacion-publica.md.
const CONTRATACION_PUBLICA = `# Contratación Pública — guía detallada

## Para qué sirve
Sirve para pedir y seguir, mes a mes, los documentos que otras áreas (RRHH, Financiero, Operaciones, Legal) deben entregar para el informe que se envía a cada entidad pública: qué se pidió, a quién, para cuándo y en qué estado está cada documento.

## Acceso y pantallas
- Menú → "Contratación Pública" tiene tres pantallas: "Entidades Públicas", "Por aprobar" (solo el personal de Contratación Pública) y "Por entregar".
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

## Recordatorios
- Cada día el sistema recuerda a los responsables los documentos Pendientes o Rechazados cuya fecha límite es dentro de 3 días y los que vencen ese mismo día, dentro del sistema y por correo.

## Preguntas frecuentes
- "No veo Contratación Pública": pedir el permiso a un administrador (Administración → Permisos de usuario) o por "Reportar un problema a Sistemas".
- "No puedo subir un archivo": revisar que sea PDF, Word, Excel, imagen o ZIP de hasta 15 MB; si dice que falta configurar la carpeta de Drive, pegar un enlace o avisar al personal de Contratación Pública.
- "No me deja enviar la solicitud": falta agregar al menos un documento, o algún documento no tiene responsable.
- "Ya no recibo el recordatorio de un documento": solo se recuerdan los Pendientes o Rechazados; uno Entregado o Aprobado ya no genera recordatorios.`;

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
- Gerente: ve "Administración", "Mi Empresa" y "Permisos Usuarios" de su empresa en solo lectura. Si intenta crear, editar, guardar o marcar algo, aparece "No tienes permiso para esto": es solo para administradores y debe contactar a un administrador de su empresa para que lo haga.`;

const SISTEMAS = `# Sistemas — guía

- Dashboard: tickets Abiertos, En revisión, Resueltos y Este mes; una dona "Tickets por tipo" (Errores, Mejoras, Permisos y Otros, con cantidad y porcentaje; al pasar el cursor por un tipo el centro muestra su cantidad); "Tiempo promedio de resolución" general (promedio de lo que tardan en quedar Resueltos los tickets; muestra "—" si aún no hay ninguno resuelto); y "Últimos tickets". Accesos a Soporte Técnico, "Publicar novedad de la app", Herramientas, Agentes y "Base de conocimiento de Agente Gemeseg".
- Novedades: menú Sistemas → Novedades. "Nueva novedad": se escribe Título y "Qué cambió", se marcan los módulos afectados y la pantalla muestra a cuántas personas llegará y la lista de quiénes son (nombre, correo y empresa), más "No la recibirán" con el motivo de cada persona que queda fuera (cuenta inactiva, módulo negado, etc.); "Publicar" pide confirmar. El aviso le sale en la campanita (nunca por correo) solo a quienes tienen acceso a alguno de esos módulos, sin contar a quien publica. No se puede deshacer; la tabla guarda el historial.
- Soporte Técnico: los reportes que llegan por la llave inglesa; se cambian de estado (Abierto, En revisión, Resuelto). Cuando alguien reporta algo, la campanita avisa ("Nuevo reporte para Sistemas") solo a quienes tienen Sistemas con "Escribir" marcado en Permisos Usuarios; nunca por correo. Ahí también se configura la carpeta de Drive para capturas ("Probar conexión").
- Herramientas: catálogo (Nombre, Categoría, Versión, Licencia) y asignación a usuarios con auditoría; lo asignado aparece en "Mi perfil". Es parte de Sistemas (no es un módulo aparte en Permisos Usuarios): la ve quien tiene Sistemas.
- Agentes: crear agentes de IA con nombre, instrucciones y alcance, y asignarlos a usuarios.
- Base de conocimiento (menú Sistemas → "Base de Conocimiento"): texto en Markdown que Agente Gemeseg usa además de este manual, para lo propio de la empresa (políticas, contactos, procesos internos). Se divide con encabezados "## CLAVE" exactos en mayúsculas (## GENERAL, ## RRHH, ## VENTAS, ## CACAO, ## CUSTODIAS, ## CONTRATACION_PUBLICA, ## SISTEMAS…). Lo de ## GENERAL o antes del primer encabezado lo recibe cualquier usuario; cada otra sección solo quien tiene acceso a ella. Un encabezado mal escrito no abre sección nueva (se pega a la anterior) y la pantalla avisa al guardar.`;

/** Bloques por clave de ALL_SECTIONS. GENERAL no está acá: va siempre. */
export const SECTION_GUIDES: Record<string, string> = {
  RRHH,
  VENTAS,
  CONTRATACION_PUBLICA,
  CACAO,
  CUSTODIAS,
  ADMIN,
  SISTEMAS,
};

export function buildSystemGuide(allowedSectionKeys: string[]): string {
  const allowed = new Set(allowedSectionKeys);
  const blocks = Object.entries(SECTION_GUIDES)
    .filter(([key]) => allowed.has(key))
    .map(([, text]) => text);
  return [GENERAL, ...blocks].join('\n\n');
}
