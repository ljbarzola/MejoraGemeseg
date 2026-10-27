export interface Agent {
  id: number;
  name: string;
  instructions: string;
  scope: string;
  isActive: boolean;
  createdBy: number | null;
  createdAt: string;
  assignedUsers?: { id: number; fullName: string; email: string }[];
  _count?: { userLinks: number };
}

export interface UserWithAgent {
  id: number;
  fullName: string;
  email: string;
  role: string;
  agents: Agent[];
}

export interface AgentAssignment {
  id: number;
  agent: { id: number; name: string; scope: string; isActive: boolean };
  user: { id: number; fullName: string; email: string };
  createdAt: string;
}

/** Qué hace un agente que trabaja solo (revisor de bitácoras), escrito para quien lo administra. */
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
  /** Modelo de IA que usa hoy (viene del servidor). */
  modelo?: string | null;
}

/** Una vez que un agente trabajó: quién lo pidió, sobre qué, cuánto tardó y si salió bien. */
export interface EjecucionAgente {
  id: number;
  agentId: number | null;
  agentNombre: string;
  agentScope: string | null;
  userNombre: string | null;
  accion: string;
  resumen: string | null;
  entidadTipo: string | null;
  entidadId: number | null;
  modelo: string | null;
  tokensEntrada: number | null;
  tokensSalida: number | null;
  duracionMs: number | null;
  exito: boolean;
  error: string | null;
  detalle: Record<string, unknown> | null;
  createdAt: string;
}

export interface ResumenActividadAgentes {
  dias: number;
  agentes: {
    agentId: number | null;
    agentNombre: string;
    ejecuciones: number;
    errores: number;
    duracionPromedioMs: number | null;
    tokens: number;
    ultima: string;
  }[];
}

/** Una pregunta que una persona le hizo a un agente de chat, con su respuesta, tiempo y tokens. */
export interface PreguntaAgente {
  id: number;
  conversationId: number;
  agentId: number;
  agentNombre: string;
  agentScope: string | null;
  userId: number;
  userNombre: string;
  /** Pantalla desde la que se preguntó. */
  contexto: string;
  pregunta: string | null;
  respuesta: string;
  createdAt: string;
  duracionMs: number | null;
  tokens: number | null;
  modelo: string | null;
  exito: boolean;
  error: string | null;
  /** Consulta de datos que usó el agente (por ejemplo ventas_expediente), si usó alguna. */
  consulta: string | null;
  detalle: Record<string, unknown> | null;
}

export interface ResumenPreguntasAgentes {
  dias: number;
  agentes: {
    agentId: number;
    agentNombre: string;
    preguntas: number;
    personas: number;
    fallos: number;
    tokens: number;
    tokensPorPregunta: number;
    duracionPromedioMs: number | null;
    ultima: string;
  }[];
  personas: { id: number; nombre: string }[];
}

/** Un bloque del prompt tal como lo recibe el modelo. */
export interface ParteDelPrompt {
  titulo: string;
  texto: string;
  /** Quién lo cambia: el texto del agente, el código, cada persona (permisos) o la base de conocimiento de la empresa. */
  origen: 'agente' | 'codigo' | 'persona' | 'empresa';
}

export interface PromptReal {
  agentId: number;
  nombre: string;
  scope: string;
  modelo: string;
  avisos: string[];
  partes: ParteDelPrompt[];
}
