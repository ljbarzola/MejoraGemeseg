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
export const SCOPES_SIN_CHAT: readonly string[] = [SCOPE_BITACORAS];

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
];

export const documentacionDeAgente = (scope: string | null | undefined) =>
  DOCUMENTACION_AGENTES.find((d) => d.scope === scope) ?? null;
