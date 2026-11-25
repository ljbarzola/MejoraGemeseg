// Tipos de «Custodias en campo · Fase 2» (el celular del custodio). Copia del contrato del servidor:
// si el servidor cambia una forma, cambia aquí también.

import type { CampoGuia, GuiaCustodia, MomentoFirma } from './custodiaGuia';

export type EstadoViaje = 'LISTO_PARA_CUSTODIAR' | 'EN_CAMINO' | 'LLEGO';
export type MomentoFoto = 'SALIDA' | 'PUNTO' | 'LLEGADA' | 'NOVEDAD' | 'LIBRE';
/** De dónde salió una foto: tomada con la cámara en ese momento o elegida de la galería del celular. */
export type OrigenFoto = 'CAMARA' | 'GALERIA';
export type TipoEvento = 'SALIDA' | 'PUNTO' | 'LLEGADA' | 'NOVEDAD' | 'OBSERVACION';
export type TipoNovedad = 'TRAFICO' | 'RETEN' | 'DESVIO' | 'AVERIA' | 'ACCIDENTE' | 'OTRO';
export type RolCustodio = 'chofer' | 'custodio1' | 'custodio2' | 'custodio3' | 'custodio4';

export const NOVEDADES: { valor: TipoNovedad; etiqueta: string }[] = [
  { valor: 'TRAFICO', etiqueta: 'Tráfico' },
  { valor: 'RETEN', etiqueta: 'Retén' },
  { valor: 'DESVIO', etiqueta: 'Desvío' },
  { valor: 'AVERIA', etiqueta: 'Avería' },
  { valor: 'ACCIDENTE', etiqueta: 'Accidente' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

export const etiquetaNovedad = (t?: string | null): string => NOVEDADES.find((n) => n.valor === t)?.etiqueta ?? 'Novedad';

export const ETIQUETA_ESTADO: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: 'Listo para salir',
  EN_CAMINO: 'En camino',
  LLEGO: 'Llegó',
};

export const ETIQUETA_MOMENTO_FOTO: Record<string, string> = {
  SALIDA: 'Salida',
  PUNTO: 'Punto de control',
  LLEGADA: 'Llegada',
  NOVEDAD: 'Novedad',
  LIBRE: 'Otras fotos',
};

// ---- Oficina (JWT) ----

export interface CelularCustodia {
  id: number;
  nombre: string;
  creadoEn: string;
  ultimoUso: string | null;
  revocado: boolean;
  viajeActual: { id: number; numeroGuia: string; estado: string } | null;
}

export interface CodigoCelular {
  codigo: string;
  expiraEn: string;
  /** Solo en «Vincular de nuevo»: el nombre del celular que se reactiva. */
  nombre?: string;
}

/** Numeración automática de las guías: el prefijo de la empresa y el número que tendrá la próxima (solo vista previa). */
export interface NumeracionGuias {
  prefijo: string;
  siguiente: string;
}

export interface PinCustodio {
  cedula: string;
  nombre: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface PinCreado {
  cedula: string;
  nombre: string;
  pin: string;
}

export interface EspacioFotos {
  fotos: number;
  bytes: number;
  desde: string | null;
  hasta: string | null;
  almacenamiento: 'NUBE' | 'BASE_LOCAL';
}

export interface EventoRecorrido {
  id?: number;
  clientUuid?: string;
  tipo: TipoEvento;
  puntoId?: number | null;
  puntoNombre?: string | null;
  novedadTipo?: TipoNovedad | null;
  texto?: string | null;
  ocurridoEn: string;
  lat?: number | null;
  lng?: number | null;
  precisionM?: number | null;
  autorNombre?: string | null;
}

export interface FotoRecorrido {
  id: number;
  momento: MomentoFoto;
  puntoId?: number | null;
  puntoNombre?: string | null;
  etiqueta?: string | null;
  comentario?: string | null;
  tomadaEn: string;
  lat?: number | null;
  lng?: number | null;
  autorNombre?: string | null;
  /** Nulo en las fotos anteriores a la galería: se tomaron con la cámara. */
  origen?: OrigenFoto | null;
  borrada: boolean;
}

export interface FirmaRecorrido {
  id: number;
  momento: 'SALIDA' | 'LLEGADA';
  nombre: string;
  cedula?: string | null;
  firmadaEn: string;
  autorNombre?: string | null;
}

/** Algo de los datos del viaje que el custodio avisó que está mal o distinto (interno: no va al PDF ni al enlace público). */
export interface ObservacionCustodio {
  id: number;
  texto: string | null;
  ocurridoEn: string;
  autorNombre?: string | null;
}

export interface CampoDeViaje {
  eventos: EventoRecorrido[];
  fotos: FotoRecorrido[];
  firmas: FirmaRecorrido[];
  observaciones: ObservacionCustodio[];
}

// ---- Celular (cabeceras propias, sin sesión de la app) ----

export interface EstadoCelular {
  celular: { nombre: string };
  viaje: { id: number; numeroGuia: string; tipo: string; estado: EstadoViaje; cliente: string } | null;
  sesion: { nombre: string; rol: string } | null;
}

export interface SesionCampo {
  sesion: string;
  nombre: string;
  rol: string;
}

export interface PuntoCampo {
  id: number;
  orden: number;
  nombre: string;
  minutosDesdeAnterior: number;
  marcadoEn: string | null;
}

export type CampoDefinicion = CampoGuia;

/** Una foto que se pide al custodio (viene de la configuración, por tipo de servicio y momento). */
export interface FotoPedida {
  nombre: string;
  obligatoria: boolean;
  varias: boolean;
}

export interface ViajeCampo {
  id: number;
  numeroGuia: string;
  tipo: 'PUERTO' | 'HACIENDA' | 'VIP' | string;
  estado: EstadoViaje;
  /** Cuándo se creó el viaje: una foto de la galería no puede ser de antes. */
  creadoEn?: string;
  fechaHoraSalida: string | null;
  fechaHoraLlegada: string | null;
  cliente: { nombre: string } | null;
  contactoSitio?: { nombre: string; telefono: string } | null;
  salida: { ciudad: string | null; direccion: string | null };
  llegada: { ciudad: string | null; direccion: string | null };
  patrulla?: string | null;
  placa?: string | null;
  personal: { rol: string; etiqueta?: string; nombre: string }[];
  ruta: { nombre: string; puntos: PuntoCampo[] } | null;
  guia: GuiaCustodia;
  campos: CampoDefinicion[];
  firmaMomento: MomentoFirma | null;
  firmaObligatoria: boolean;
  telefonoOperaciones: string | null;
  /** Las fotos que se piden en este viaje, al salir y al llegar. */
  fotosPedidas?: { SALIDA: FotoPedida[]; LLEGADA: FotoPedida[] };
  /** Lo que el custodio ya avisó sobre los datos del viaje. */
  observaciones?: { clientUuid: string; texto: string | null; ocurridoEn: string; autorNombre?: string | null }[];
  fotos: { clientUuid: string; momento: MomentoFoto; puntoId?: number | null; etiqueta?: string | null; tomadaEn: string }[];
  firmas: { momento: 'SALIDA' | 'LLEGADA'; nombre: string; firmadaEn: string }[];
  novedades: { clientUuid: string; novedadTipo: TipoNovedad; texto?: string | null; ocurridoEn: string }[];
  soloLectura: boolean;
}

export interface ResultadoEvento {
  clientUuid: string;
  ok: boolean;
  error?: string;
}

export interface CambioGuia {
  bloque: 'GENERAL' | 'CONTENEDOR' | 'HACIENDA';
  indice?: number;
  campoId: string;
  valor: string | number | boolean | null;
}

export interface Ubicacion {
  lat: number;
  lng: number;
  precisionM: number;
}

// ---- Enlace público de fotos ----

export interface FotoPublica {
  id: number;
  momento: MomentoFoto;
  puntoNombre?: string | null;
  etiqueta?: string | null;
  comentario?: string | null;
  tomadaEn: string;
  origen?: OrigenFoto | null;
}

export interface GuiaFotosPublica {
  numeroGuia: string;
  cliente: string | null;
  fechaHoraSalida: string | null;
  fechaHoraLlegada: string | null;
  expiraEn: string;
  fotos: FotoPublica[];
}
