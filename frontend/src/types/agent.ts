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
