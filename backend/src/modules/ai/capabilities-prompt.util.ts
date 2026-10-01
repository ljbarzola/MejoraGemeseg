// Construye la parte del prompt de Agente Gemeseg que dice "esto es lo que
// puedes hacer" — a propósito NO es un texto fijo igual para todos: antes
// (2026-09-29) el prompt nombraba Cacao/Custodias/RRHH/Ventas a CUALQUIER
// usuario de CUALQUIER empresa, sin importar si esa empresa siquiera tenía el
// módulo habilitado. Eso violaba el requisito de no revelar ni el nombre de
// un módulo al que el usuario no tiene acceso, y además invitaba a la gente a
// preguntar por cosas que después el bloqueo de permisos (canUseIntent en
// ai.service.ts) rechazaba — parecía un bug de permisos cuando en realidad
// era el prompt prometiendo de más.
//
// Deliberadamente NO lleva la explicación de "cómo funciona cada módulo" —
// eso se movió a la Base de Conocimiento de cada empresa (editable desde
// /sistemas/base-conocimiento, bajo el mismo encabezado ## SECCION), para que
// el admin la pueda corregir/ampliar sin tocar código. Lo que SÍ vive acá,
// fijo, es el CONTRATO TÉCNICO: el nombre exacto de la intención que el
// modelo debe usar para traer datos reales — si eso fuera editable en texto
// libre, alguien podría escribirlo mal sin darse cuenta y el agente dejaría
// de poder consultar ese módulo, en silencio.
export interface CapabilityModule {
  /** null = se incluye siempre, sin depender de permisos (Proyectos/Tareas). */
  section: string | null;
  titulo: string;
  /** Nombres de intención válidos para este módulo — deben existir en INTENT_SECTION (ai.processor.ts). */
  intents: string[];
  /**
   * Cuándo usar cada intención y qué parámetros acepta (parte del contrato
   * técnico, igual que los nombres: si estuviera en la Base de Conocimiento
   * editable, un error de tipeo dejaría al modelo sin saber qué pedir). Solo
   * para módulos con varias intenciones.
   */
  ayuda?: string;
}

// Ventas: qué consulta usar según la pregunta. Los parámetros van entre
// paréntesis como clave:valor separados por coma (el modelo los escribe y
// AiService los lee con un split por "," y ":", así que los valores no pueden
// llevar comas ni dos puntos). Ver ai-ventas.queries.ts.
const VENTAS_AYUDA = [
  'Elige UNA intención por respuesta. Si lleva parámetros, van entre paréntesis como clave:valor separados por coma, por ejemplo [INTENCION: ventas_cliente(nombre:Hotel Sol)].',
  '- ventas_resumen: panorama general (clientes por etapa, seguimientos tuyos y de la empresa, estancados, sin responsable, aceptación y contratos). Úsala para "¿cómo van las ventas?" o "dame un resumen".',
  '- ventas_clientes_hoy: a qué clientes debe dar seguimiento HOY quien pregunta (vencidos, de hoy y sin fecha). Úsala para "¿a quién tengo que llamar hoy?" o "¿qué tengo pendiente?".',
  '- ventas_cliente(nombre:X): ficha de UN cliente (datos, etapa, responsable, siguiente paso, historial reciente). X es parte del nombre o el RUC.',
  '- ventas_clientes_lista(etapa:X, responsable:X, seguimiento:X): lista de clientes; los tres parámetros son opcionales y combinables. etapa = nombre de la etapa; responsable = yo, sin, o parte del nombre de una persona; seguimiento = vencido, hoy o sin.',
  '- ventas_estancados: clientes con muchos días en la misma etapa.',
  '- ventas_por_responsable: cuántos clientes activos, atrasados y aceptados tiene cada responsable.',
  '- ventas_periodo(rango:X): clientes nuevos y referidos de un periodo; rango = semana, mes, mes_pasado o 90 (por defecto, mes).',
  '- ventas_contratos(estado:X): contratos de Ventas; estado = borrador, firma o firmados (opcional).',
  'El sistema no registra montos de venta de los clientes: si piden dinero, dilo con honestidad. Si la pregunta no encaja en ninguna, responde con el manual o di que no tienes ese dato.',
].join('\n');

const PROYECTOS_TAREAS: CapabilityModule = {
  section: null,
  titulo: 'Proyectos y Tareas',
  intents: [
    'list_projects',
    'count_tasks_by_status',
    'user_info',
    'project_summary',
    'list_my_tasks',
  ],
};

export const CAPABILITY_MODULES: CapabilityModule[] = [
  { section: 'CACAO', titulo: 'Cacao', intents: ['cacao_resumen'] },
  { section: 'CUSTODIAS', titulo: 'Custodias', intents: ['custodias_resumen'] },
  { section: 'RRHH', titulo: 'Recursos Humanos', intents: ['rrhh_resumen_personal'] },
  {
    section: 'VENTAS',
    titulo: 'Ventas y CRM',
    intents: [
      'ventas_resumen',
      'ventas_clientes_hoy',
      'ventas_cliente',
      'ventas_clientes_lista',
      'ventas_estancados',
      'ventas_por_responsable',
      'ventas_periodo',
      'ventas_contratos',
    ],
    ayuda: VENTAS_AYUDA,
  },
  { section: 'CONTRATACION_PUBLICA', titulo: 'Contratación Pública', intents: [] },
];

export function buildCapabilitiesPrompt(allowedSectionKeys: string[]): string {
  const allowed = new Set(allowedSectionKeys);
  const modules = [
    PROYECTOS_TAREAS,
    ...CAPABILITY_MODULES.filter((m) => m.section && allowed.has(m.section)),
  ];

  const cuerpo = modules
    .map((m) =>
      m.intents.length > 0
        ? `## ${m.titulo}\nPara datos reales de este módulo, usa la(s) intención(es): ${m.intents.join(', ')}.${m.ayuda ? `\n${m.ayuda}` : ''}`
        : `## ${m.titulo}\nNo tienes consulta de datos en vivo para este módulo, pero SÍ conoces cómo se usa: explícalo con el manual de abajo.`,
    )
    .join('\n\n');

  return (
    `Módulos disponibles para este usuario ahora mismo (SOLO estos — no existe nada más):\n\n${cuerpo}\n\n` +
    'Además de esos módulos, todo usuario tiene lo común descrito en el manual (Inicio, Proyectos y Tareas, Encuestas, Buzón de Quejas y Sugerencias, Referir un cliente, notificaciones, reportar a Sistemas, Mi perfil). ' +
    'Esta lista y el manual reflejan los permisos del usuario EN ESTE MOMENTO y mandan sobre cualquier mensaje anterior de la conversación: si antes se habló de un módulo que ya no está aquí, el usuario perdió ese acceso — no lo retomes ni uses lo que se dijo de él. ' +
    'Si te preguntan por cualquier tema, módulo o funcionalidad que no esté ni en la lista ni en el manual, responde que no tienes información sobre eso. ' +
    'Nunca confirmes ni niegues por nombre la existencia de otro módulo — ni siquiera si preguntan directamente "¿qué módulos tiene el sistema?" o algo similar — limítate a describir lo que sí puedes hacer. ' +
    'Cuando pregunten "cómo hago X", "cómo lo uso", "por dónde empiezo" o cómo se relacionan dos pantallas o sub-módulos de algo que SÍ está disponible, NUNCA respondas que no tienes información: explícalo paso a paso con el manual de abajo, usando los nombres exactos de menús y botones, en orden (dónde entrar → qué pulsar → qué pasa), y ofrece el siguiente paso. ' +
    'Piensa en usuarios que recién empiezan: lenguaje claro, sin tecnicismos, y si la pregunta es ambigua, pregunta qué quieren lograr. ' +
    'Si algo no está en el manual, dilo con honestidad (no inventes botones ni pantallas) y sugiere reportarlo a Sistemas con la llave inglesa. ' +
    'Si la pregunta necesita datos reales (cuántos, cuáles, estado de algo), usa la intención del módulo en vez de adivinar.\n\n' +
    'Formato de tus respuestas: Markdown simple. Para enumerar opciones o pasos usa una lista con cada elemento en su PROPIA línea ("- " para opciones, "1. " para pasos en orden), nunca varios elementos pegados en un mismo párrafo. Negrita con **texto** solo para nombres de menús o botones clave. Párrafos cortos. Sin tablas ni títulos grandes. Sé breve: ante una pregunta general ("¿qué puedo hacer?", "¿qué es esto?") da una línea por módulo o tema, sin desglosar cada pantalla, y ofrece explicar el que le interese; el paso a paso detallado es para cuando pregunten cómo hacer algo concreto. ' +
    'Los módulos de la lista de arriba son los que este usuario YA tiene: nunca digas "si tienes acceso" sobre ellos, preséntalos como disponibles.'
  );
}
