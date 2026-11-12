// Agentes "trabajadores": no conversan en el chat, hacen una tarea sobre algo que
// se les entrega (hoy, leer la foto de una bitácora). Viven en el mismo catálogo
// que los agentes de chat (Sistemas → Agentes) para que Sistemas vea qué hacen,
// los apague o ajuste su texto, pero NO aparecen en el selector del chat.
//
// `Agent.instructions` guarda solo lo que la empresa puede ajustar (cómo es SU
// hoja). Las reglas que evitan que el lector invente o "arregle" nombres van en
// código (bitacora-prompt.util.ts) y aquí abajo, documentadas para Sistemas.

export const SCOPE_BITACORAS = 'BITACORAS';

/** Scopes de agentes que no conversan: el chat no los ofrece ni los acepta. */
export const SCOPE_ENTREGAS = 'ENTREGAS';

export const SCOPE_BITACORA_RESUMEN = 'BITACORA_RESUMEN';

export const SCOPES_SIN_CHAT: readonly string[] = [
  SCOPE_BITACORAS,
  SCOPE_ENTREGAS,
  SCOPE_BITACORA_RESUMEN,
];

export const esAgenteSinChat = (scope: string | null | undefined): boolean =>
  !!scope && SCOPES_SIN_CHAT.includes(scope);

export const NOMBRE_AGENTE_BITACORAS = 'Agente Revisor de Bitácoras';

export const INSTRUCCIONES_BITACORAS_POR_DEFECTO = [
  'Describe aquí cómo es la hoja de bitácora de tu empresa, para que el lector la entienda mejor. Ejemplos:',
  '- Las columnas son: fecha, hora, novedad y firma del guardia.',
  '- El nombre del guardia que recibe el turno va arriba de la hoja.',
  '- «S/N» significa «sin novedad».',
  '',
  '(Mientras no cambies este texto, el lector usa solo sus reglas fijas.)',
].join('\n');

export const NOMBRE_AGENTE_ENTREGAS = 'Agente Revisor de Entregas';

export const INSTRUCCIONES_ENTREGAS_POR_DEFECTO = [
  'Describe aquí qué documentos recibe tu empresa y cómo son, para que el lector los entienda mejor. Ejemplos:',
  '- Las planillas del IESS llevan sello digital, no firma manuscrita.',
  '- Los certificados de antecedentes penales valen 90 días desde su emisión.',
  '- Los oficios de la entidad siempre llevan la firma del administrador del contrato.',
  '',
  '(Mientras no cambies este texto, el lector usa solo sus reglas fijas.)',
].join('\n');

export const NOMBRE_AGENTE_BITACORA_RESUMEN = 'Agente Redactor del Resumen del Día';

export const INSTRUCCIONES_BITACORA_RESUMEN_POR_DEFECTO = [
  'Describe aquí cómo quieres que se redacte el resumen del día de la Bitácora. Ejemplos:',
  '- Escribe en tercera persona («Trabajó en…»).',
  '- Nombra primero lo que se hizo en Ventas y CRM.',
  '- «Contratación Pública» se escribe siempre completo.',
  '',
  '(Mientras no cambies este texto, el redactor usa solo sus reglas fijas.)',
].join('\n');

export interface DocumentacionAgente {
  scope: string;
  nombre: string;
  resumen: string;
  dondeSeUsa: string;
  recibe: string[];
  hace: string[];
  noHace: string[];
  decide: string[];
  datos: string[];
  limites: string[];
}

export const DOCUMENTACION_AGENTES: DocumentacionAgente[] = [
  {
    scope: SCOPE_BITACORAS,
    nombre: NOMBRE_AGENTE_BITACORAS,
    resumen:
      'Lee la foto de una bitácora de guardianía y la compara con el horario del puesto para avisar cuando quien aparece en la hoja no es quien debía estar.',
    dondeSeUsa:
      'Contratación Pública → Bitácoras. Lo ve y lo usa quien tenga Contratación Pública con permiso de escribir.',
    recibe: [
      'Una foto (JPG, PNG, WebP o HEIC) o un PDF de la hoja de bitácora, de hasta 15 MB.',
      'El puesto al que pertenece, elegido por quien la sube (entidad → contrato → puesto).',
      'El texto de «Instrucciones» de este agente (cómo es la hoja de la empresa) y la fecha de hoy, para completar el año de las fechas.',
    ],
    hace: [
      'Transcribe la hoja: el día, cada guardia con su hora de entrada y de salida, y cada novedad con su hora.',
      'Clasifica cada novedad en una categoría fija (ingreso de personas, vehículos, rondas, cambio de turno, equipos, incidente, sin novedad u otra).',
      'Marca como poco legible lo que no puede leer, en vez de adivinarlo.',
    ],
    decide: [
      'NO decide si algo está bien o mal. La comparación la hace el sistema con reglas fijas (no el modelo), igual cada vez:',
      'El guardia de la hoja se empareja por nombre con los guardias asignados al puesto (sin importar el orden «Nombre Apellido» o «Apellidos Nombres» ni una letra mal leída).',
      'Se compara con el horario que cubre ese día: quién debía trabajar, quién estaba libre y en qué turno.',
      'Hallazgos: otro guardia en lugar del programado, guardia ausente, guardia que estaba libre, nombre que no es del puesto, horas distintas a las del turno (tolera 30 minutos), nombre dudoso o ambiguo, día sin horario, horario sin aprobar, fecha fuera del contrato, puesto distinto, hoja repetida.',
      'La gravedad de una novedad sale de su categoría (un incidente es ALTA, un equipo dañado MEDIA, lo demás BAJA).',
    ],
    noHace: [
      'No conoce el horario mientras lee: así no «corrige» un nombre equivocado por el que esperaba ver.',
      'No modifica horarios, guardias ni contratos.',
      'No envía avisos ni correos a nadie.',
      'No guarda nada fuera de Contratación Pública y de este registro de actividad.',
    ],
    datos: [
      'La foto se guarda en la base de datos de la aplicación (tabla de archivos), no en Google Drive.',
      'La foto se envía a Google Vertex AI (Gemini) solo para leerla; no se envía el horario ni nombres de guardias.',
      'Cada lectura queda en el registro de actividad con quién la pidió, cuánto tardó, el modelo y los tokens usados.',
    ],
    limites: [
      'La letra a mano difícil o una foto movida se lee mal: por eso toda lectura se puede corregir en pantalla y la comparación se repite al guardar.',
      'Una hoja con varios días se separa por fecha; si no se lee la fecha, la línea se descarta y se avisa en observaciones.',
      'Sin horas configuradas en el código del turno (Contratación Pública → Horarios de los turnos) solo se compara la persona, no la hora.',
      'Si el agente se desactiva o la IA no está configurada, la foto se guarda sin leer y se puede transcribir a mano.',
    ],
  },
  {
    scope: SCOPE_ENTREGAS,
    nombre: NOMBRE_AGENTE_ENTREGAS,
    resumen:
      'Mira cada documento que otra área entrega y deja una nota para quien aprueba: «Parece correcto» o «Revisar» con el motivo (sin firma o sello, vencido, ilegible, de otro periodo).',
    dondeSeUsa:
      'Contratación Pública → Por aprobar (lista y panel de revisión). Solo lo ve quien tenga Contratación Pública con permiso de escribir.',
    recibe: [
      'El archivo entregado: PDF, imagen (JPG, PNG, WebP), Word o Excel (estos dos se convierten antes a PDF), de hasta 15 MB.',
      'El texto de «Instrucciones» de este agente (cómo son los documentos de la empresa) y la fecha de hoy.',
    ],
    hace: [
      'Describe lo que ve: si el documento se lee bien, qué parece ser, si un documento de ese tipo lleva firma o sello y si lo tiene, la fecha de vencimiento si el propio documento la escribe y el periodo que dice cubrir (por ejemplo «del 24 de agosto al 23 de septiembre»). No recibe el mes de la solicitud: lo compara el sistema.',
      'Deja la nota en «Por aprobar»: una etiqueta en la lista y un cuadro en el panel de revisión, con el motivo y una propuesta de texto para rechazar.',
    ],
    decide: [
      'NO aprueba ni rechaza: lo hace una persona. El agente solo sugiere.',
      'El veredicto sale de reglas fijas del sistema, iguales cada vez: «Revisar» si no se lee, si debería llevar firma o sello y no se ve (o no está claro), si la fecha de vencimiento que escribe el documento ya pasó, o si el periodo que dice cubrir no toca el mes de la solicitud (un periodo que cruza de mes vale para los dos). Si no, «Parece correcto».',
    ],
    noHace: [
      'No comprueba que sea el documento que se pidió, ni que sea del mes correcto: no conoce el nombre pedido, la entidad ni el mes.',
      'No lee documentos entregados como enlace externo, ni ZIP.',
      'No aprueba, rechaza, avisa ni envía correos a nadie.',
      'No modifica ni borra el archivo.',
    ],
    datos: [
      'El archivo se envía a Google Vertex AI (Gemini) solo para leerlo; se descarga de la carpeta de Drive de la entidad y no se guarda copia.',
      'Cada revisión queda en el registro de actividad con quién la disparó, cuánto tardó, el modelo y los tokens usados; el resultado se guarda junto al documento y se rehace si se vuelve a entregar.',
    ],
    limites: [
      'Que el agente diga «Parece correcto» no es garantía: solo cubre firma o sello, vigencia, periodo y que se lea. Quien aprueba sigue mirando el documento.',
      'Si el documento no escribe fecha de vencimiento, no se puede saber si está vigente; si no dice qué periodo cubre, no se compara el mes. Un documento que se pide de un mes distinto al de la solicitud (por ejemplo una planilla del mes anterior) saldrá como «Revisar»: es solo una sugerencia.',
      'Una firma pequeña en una foto de baja calidad puede salir como «no está claro»: por eso es una sugerencia.',
      'Lo dispara el navegador de quien entrega justo después de entregar; si esa persona cierra la pestaña antes, quien aprueba puede pedir la revisión desde el panel.',
    ],
  },
  {
    scope: SCOPE_BITACORA_RESUMEN,
    nombre: NOMBRE_AGENTE_BITACORA_RESUMEN,
    resumen:
      'Redacta el «resumen del día» de la Bitácora del equipo: un párrafo corto y unas viñetas con lo que una persona hizo ese día, usando solo las cifras que calcula el sistema.',
    dondeSeUsa:
      'Bitácora → Mi hoja del día (botón «Generar resumen») y Bitácora → Actividad del día. Lo genera la propia persona o quien tenga permiso de ver la bitácora del equipo.',
    recibe: [
      'Las cifras del día ya calculadas por el sistema: primera y última actividad, acciones por módulo con ejemplos, sitios web con su título y minutos, eventos de Google, silencios y tiempo extra.',
      'Lo que la persona anotó a mano ese día («Lo que anoté yo»), marcado aparte.',
      'El texto de «Instrucciones» de este agente (cómo quiere la empresa que se redacte).',
    ],
    hace: [
      'Escribe un párrafo de máximo 3 frases y entre 3 y 6 viñetas, en español, con esas cifras.',
      'Presenta lo anotado por la persona como «según anotó la persona», separado de lo registrado automáticamente.',
    ],
    decide: [
      'NO calcula ni decide nada: las cifras salen de código. Si el modelo no responde o no devuelve el formato esperado, el sistema guarda un resumen calculado con una plantilla fija, igual de exacto.',
    ],
    noHace: [
      'No evalúa ni juzga la productividad de nadie.',
      'No inventa cifras, tareas ni nombres.',
      'No envía avisos ni correos; no modifica la hoja ni las anotaciones.',
    ],
    datos: [
      'Se envían a Google Vertex AI (Gemini, Estados Unidos) las cifras del día, los títulos de las páginas visitadas (nunca el enlace completo) y el texto que la persona anotó.',
      'Cada resumen queda en el registro de actividad con quién lo pidió, cuánto tardó, el modelo y los tokens usados; el resultado se guarda en la Bitácora y se reutiliza mientras no haya datos nuevos.',
    ],
    limites: [
      'Solo resume lo que la Bitácora ve: app.gemeseg, Google y el navegador con la extensión. Poca actividad registrada no significa poco trabajo.',
      'Se puede regenerar hasta 10 veces por persona y día; sin datos nuevos se devuelve el ya guardado.',
      'Si el agente se desactiva o la IA no está configurada, el resumen sale con la plantilla calculada.',
    ],
  },
];

export const documentacionDeAgente = (scope: string | null | undefined) =>
  DOCUMENTACION_AGENTES.find((d) => d.scope === scope) ?? null;
