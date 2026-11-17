import { api } from './auth.service';

export type EstadoConversacion = 'BOT' | 'NECESITA_PERSONA' | 'PERSONA' | 'CERRADA';

export interface ConversacionResumen {
  id: number;
  phone: string;
  contactName: string | null;
  leadId: number | null;
  estado: EstadoConversacion;
  motivoEscalado: string | null;
  asignadoA: number | null;
  sinLeer: number;
  ultimoMensajeEn: string | null;
  ultimoTexto: string | null;
  hayPropuesta: boolean;
}

export interface MensajeWa {
  id: number;
  direccion: 'ENTRANTE' | 'SALIENTE';
  autor: 'CLIENTE' | 'BOT' | 'PERSONA';
  estado: 'RECIBIDO' | 'PROPUESTO' | 'ENVIADO' | 'DESCARTADO' | 'FALLIDO';
  texto: string;
  textoOriginalBot: string | null;
  respondeAId: number | null;
  creadoPor: number | null;
  simulado: boolean;
  error: string | null;
  createdAt: string;
  enviadoEn: string | null;
  // Cotización que calculó el sistema para esta respuesta (solo la ve el equipo).
  cotizacion?: any | null;
}

export interface DetalleConversacion {
  conversacion: ConversacionResumen & { ultimoEntranteEn: string | null };
  mensajes: MensajeWa[];
  ventanaAbierta: boolean;
}

export interface HorarioBot {
  inicio: string;
  fin: string;
  dias: number[];
}

export interface PilarBot {
  id: string;
  nombre: string;
  descripcion: string;
  // Qué cotiza el bot en esta área; vacío = la cotiza un asesor.
  cotiza: ('CATALOGO' | 'CUSTODIA')[];
  preguntas: string[];
  activo: boolean;
}

export interface GuionBot {
  preguntaInicial: string;
  pilares: PilarBot[];
  privacidad: string;
  // Mínimo de mensajes del cliente antes de que el bot lo pase a un asesor por «ya entendí».
  minimoRespuestas: number;
  // Ciudades donde la empresa tiene sede; un servicio fuera de ellas lo confirma un asesor.
  sedes: string[];
}

export interface PlantillaBot {
  nombre: string;
  idioma: string;
  conNombre: boolean;
}

export interface CotizacionBotAjustes {
  margenCustodiaPct: number;
  margenProductosPct: number | null;
}

export interface AjustesBot {
  phoneNumberId: string;
  activo: boolean;
  modo: 'COPILOTO' | 'AUTO';
  conocimiento: string;
  horario: HorarioBot;
  guion: GuionBot;
  plantilla: PlantillaBot;
  cotizacion: CotizacionBotAjustes;
  // El servidor ya tiene el token de Meta (variables de entorno).
  conectado: boolean;
}

export async function getConversaciones(filtro?: 'necesita' | 'sinleer'): Promise<ConversacionResumen[]> {
  const r = await api.get('/ventas/conversaciones', { params: filtro ? { filtro } : {} });
  return r.data;
}

export async function getConversacion(id: number): Promise<DetalleConversacion> {
  const r = await api.get(`/ventas/conversaciones/${id}`);
  return r.data;
}

export const tomarConversacion = (id: number) => api.post(`/ventas/conversaciones/${id}/tomar`).then((r) => r.data);
export const devolverConversacion = (id: number) => api.post(`/ventas/conversaciones/${id}/devolver`).then((r) => r.data);

export const escribirEnConversacion = (id: number, texto: string): Promise<{ success: boolean; error?: string; simulado?: boolean }> =>
  api.post(`/ventas/conversaciones/${id}/escribir`, { texto }).then((r) => r.data);

export const aprobarRespuesta = (
  id: number,
  mensajeId: number,
  texto?: string,
): Promise<{ success: boolean; error?: string; simulado?: boolean }> =>
  api.post(`/ventas/conversaciones/${id}/mensajes/${mensajeId}/aprobar`, { texto }).then((r) => r.data);

export const descartarRespuesta = (id: number, mensajeId: number) =>
  api.post(`/ventas/conversaciones/${id}/mensajes/${mensajeId}/descartar`).then((r) => r.data);

export async function getAjustesBot(): Promise<AjustesBot> {
  const r = await api.get('/ventas/conversaciones/ajustes');
  return r.data;
}

export async function guardarAjustesBot(cambios: Partial<Omit<AjustesBot, 'conectado'>>): Promise<AjustesBot> {
  const r = await api.put('/ventas/conversaciones/ajustes', cambios);
  return r.data;
}

// Solo para probar en local (el servidor lo rechaza en producción).
export const simularMensajeCliente = (telefono: string, texto: string, nombre?: string) =>
  api.post('/ventas/conversaciones/simular', { telefono, texto, nombre }).then((r) => r.data);
