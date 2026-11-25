export interface MarketingCampaniaResumen {
  id: number;
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
}

export interface MarketingEnvio {
  id: number;
  campaignId: number;
  pieceId: number;
  canal: string;
  estado: string;
  motivo: string | null;
  pieza: string | null;
  campania: string | null;
  createdAt: string;
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
}

export interface MarketingCampaniaDetalle {
  id: number;
  idea: string;
  objetivo: string | null;
  estado: string;
  createdAt: string;
  plan: MarketingPlan | null;
  piezas: MarketingPieza[];
}

export interface MarketingConfiguracion {
  companyId: number;
  tono: string | null;
  servicios: string | null;
  canalesPermitidos: string | null;
  aprobadorRol: string | null;
  consentimiento: string | null;
}
