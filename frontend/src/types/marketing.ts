export interface MarketingCampaniaResumen {
  id: number;
  nombre?: string | null;
  idea: string;
  objetivo: string | null;
  estado: string;
  createdAt: string;
  piezas: number;
  aprobadas: number;
}

export interface MarketingPieza {
  id: number;
  tipo: string;
  canal: string | null;
  titulo: string | null;
  contenido: string;
  origen: string | null;
  estado: string;
  aprobadoPorId: number | null;
  aprobadoEn: string | null;
  archivoUrl: string | null;
  mimeType: string | null;
  archivoNombre: string | null;
  semana: number | null;
  dia: string | null;
  fuenteDato: string | null;
  estadoArchivo: string | null;
  errorArchivo: string | null;
  canalClave?: string | null;
  fechaPublicacion?: string | null;
  feedbackImagen?: string | null;
}

export interface MarketingCanalSugerido {
  canal: string;
  porque: string;
  prioridad: 'ALTA' | 'MEDIA' | 'BAJA';
  reparto: number;
}

export interface MarketingSugerenciaCanales {
  resumen: string;
  sugeridos: MarketingCanalSugerido[];
  extras: Array<{ nombre: string; porque: string }>;
}

/** Resultado de revisar un canal extra pedido a mano (¿necesita conectarse a una herramienta?). */
export interface MarketingCanalExtra {
  nombre: string;
  requiereIntegracion: boolean;
  motivo: string;
}

export interface MarketingConexion {
  canal: string;
  nombre: string;
  descripcion: string;
  conexion: 'API' | 'MANUAL' | 'INTERNA';
  pagado: boolean;
  administrador: string | null;
  estado: 'NO_CONECTADO' | 'DEMO' | 'SOLICITADO' | 'CONECTADO';
  actualizado: string | null;
}

export interface MarketingRequerimiento {
  id: number;
  tipo: 'CANAL' | 'INTEGRACION' | 'NECESIDAD';
  canal: string | null;
  detalle: string;
  estado: string;
  campaignId: number | null;
  createdAt: string;
  creadoPor: string | null;
}

export interface MarketingPiezaCalendario {
  id: number;
  campaignId: number;
  campania: string;
  estadoCampania: string;
  tipo: string;
  canal: string | null;
  canalClave: string | null;
  titulo: string | null;
  estado: string;
  tieneArchivo: boolean;
  envioEstado: string | null;
  fecha: string;
}

export interface MarketingPropuesta {
  id: number;
  titulo: string;
  idea: string;
  objetivo: string | null;
  porque: string | null;
  senal: string | null;
  canales: string[];
  createdAt: string;
}

export interface MarketingRadarInforme {
  enfoque?: string;
  resumen?: string;
  competidores?: Array<{
    nombre: string;
    queOfrecen?: string;
    comoSeAnuncian?: string;
    canales?: string[];
    fortalezas?: string;
    huecos?: string;
  }>;
  tendencias?: string[];
  oportunidades?: string[];
  ideas?: Array<{ titulo: string; idea: string }>;
}

export interface MarketingRadar {
  competidores: string;
  informe: MarketingRadarInforme | null;
  fuentes: Array<{ titulo: string; url: string }>;
  generadoEn: string | null;
}

export interface MarketingResumen {
  campanias: { total: number; borrador: number; aprobadas: number };
  piezas: { total: number; conArchivo: number };
  publicaciones: { programadas: number; publicadas: number; enPausa: number; listas: number };
  embudo: { leads: number; convertidos: number; contratos: number; porCanal: Array<{ canal: string; leads: number }> };
  propuestas: MarketingPropuesta[];
  proximas: MarketingPiezaCalendario[];
  conexiones: Array<{ canal: string; nombre: string; estado: string }>;
}

export interface MarketingEnvio {
  id: number;
  campaignId: number;
  pieceId: number;
  canal: string;
  estado: string;
  motivo: string | null;
  pieza: string | null;
  tipo?: string | null;
  semana?: number | null;
  dia?: string | null;
  contenido?: string | null;
  campania: string | null;
  createdAt: string;
  programadoPara?: string | null;
  publicadoEn?: string | null;
  modo?: 'DEMO' | 'MANUAL' | 'REAL' | null;
  fechaPublicacion?: string | null;
  archivoUrl?: string | null;
}

export interface MarketingIndicador {
  nombre: string;
  queMide: string;
  comoSeLee: string;
}

export interface MarketingMedicion {
  principal: { nombre: string; porque: string; comoSeLee: string };
  secundarios: MarketingIndicador[];
}

export interface MarketingRespuestaEntrevista {
  pregunta: string;
  respuesta: string;
}

export interface MarketingSiguientePregunta {
  listo: boolean;
  pregunta: string | null;
  opciones: string[];
  numero: number;
  maximo: number;
}

export interface MarketingPlan {
  resumen: string | null;
  publico: string | null;
  mercado: string | null;
  canales: string | null;
  calendario: string | null;
  kpis: string | null;
  presupuesto: string | null;
  advertencias: string | null;
  medicion: MarketingMedicion | null;
}

export interface MarketingCampaniaDetalle {
  id: number;
  nombre?: string | null;
  idea: string;
  objetivo: string | null;
  estado: string;
  createdAt: string;
  entrevista: MarketingRespuestaEntrevista[];
  plan: MarketingPlan | null;
  piezas: MarketingPieza[];
  // Antes los extras eran texto suelto; se tolera por si queda una campaña vieja guardada así.
  canales?: { claves: string[]; extras: Array<MarketingCanalExtra | string> };
  presupuestoMensual?: number | null;
  fechaInicio?: string | null;
  origen?: string | null;
}

export interface MarketingConfiguracion {
  companyId: number;
  tono: string | null;
  servicios: string | null;
  canalesPermitidos: string | null;
  aprobadorRol: string | null;
  consentimiento: string | null;
  aprobadorDistinto?: boolean;
  competidores?: string | null;
  sitioWeb?: string | null;
  /** Una red social por línea. */
  redesSociales?: string | null;
  herramientas?: string | null;
  resumenWeb?: string | null;
  logo?: { origen: 'MARKETING' | 'EMPRESA' | null };
}

export type MarketingRecursoTipo = 'LOGO' | 'FOTO' | 'VIDEO' | 'DOCUMENTO';

export interface MarketingRecurso {
  id: number;
  tipo: MarketingRecursoTipo;
  nombre: string;
  mimeType: string;
  descripcion: string | null;
  archivoUrl: string;
  createdAt: string;
}
