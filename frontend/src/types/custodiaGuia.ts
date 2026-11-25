// Tipos de la guía digital de la custodia (Fase 1). Es copia del contrato del servidor
// (backend/src/modules/custodias/custodia-guia.types.ts): si uno cambia, cambia el otro.

export type RefCustodio = 'custodio1' | 'custodio2' | 'custodio3' | 'custodio4';
export type ValorCampo = string | number | boolean | null;
export type MomentoFirma = 'SALIDA' | 'LLEGADA' | 'AMBOS';

export interface GuiaContenedor {
  numero: string;
  choferNombre: string;
  choferCedula: string;
  placaCabezal: string;
  guia: string;
  lote: string;
  cabina?: { custodio: RefCustodio | null; placa: string; tipoVehiculo: string } | null;
  /** Campos del bloque CONTENEDOR (incluye los sellos); la clave es el id del campo. */
  campos?: Record<string, ValorCampo>;
}

export interface GuiaFurgon {
  placa: string;
  choferNombre: string;
  choferCedula: string;
}

export interface GuiaHacienda {
  nombre: string;
  guia: string;
  sacos: number | null;
  campos?: Record<string, ValorCampo>;
}

export interface EtiquetaCampo {
  nombre: string;
  tipo: string;
  bloque: string;
  enPdf: boolean;
  esSello: boolean;
  orden: number;
}

export interface GuiaCustodia {
  contactoSitio?: { nombre: string; telefono: string } | null;
  /** Ajuste de este viaje; null = usa el del cliente o el general. */
  firmaMomento?: MomentoFirma | null;
  campos?: Record<string, ValorCampo>;
  contenedores?: GuiaContenedor[];
  furgon?: GuiaFurgon | null;
  haciendas?: GuiaHacienda[];
  /** Foto de los campos usados al guardar: así un viaje viejo se lee igual aunque se renombre u oculte un campo. */
  etiquetas?: Record<string, EtiquetaCampo>;
}

// ---- Configuración de Custodias ----

export type TipoServicioCampo = 'PUERTO' | 'HACIENDA' | 'VIP' | 'TODOS';
export type BloqueCampo = 'GENERAL' | 'CONTENEDOR' | 'HACIENDA';
export type TipoDatoCampo = 'TEXTO' | 'NUMERO' | 'FECHA' | 'LISTA' | 'SI_NO';

export interface CampoGuia {
  id: number;
  tipoServicio: TipoServicioCampo;
  bloque: BloqueCampo;
  nombre: string;
  tipo: TipoDatoCampo;
  opciones: string[];
  obligatorio: boolean;
  llenaQuien: 'OFICINA' | 'CUSTODIO';
  orden: number;
  enPdf: boolean;
  esSello: boolean;
  activo: boolean;
}

export type CampoGuiaForm = Omit<CampoGuia, 'id' | 'orden' | 'esSello' | 'activo'>;

export interface RutaPunto {
  id?: number;
  orden?: number;
  nombre: string;
  minutosDesdeAnterior: number;
}

export interface RutaCustodia {
  id: number;
  nombre: string;
  origen: string;
  destino: string;
  activo: boolean;
  minutosTotal: number;
  puntos: Array<RutaPunto & { id: number; orden: number }>;
}

export interface FirmaPorCliente {
  salesClientId: number;
  cliente: string;
  firmaMomento: MomentoFirma;
}

/** Una foto que se pide al custodio al salir o al llegar. */
export interface FotoPedidaConfig {
  nombre: string;
  obligatoria: boolean;
  varias: boolean;
}

export type TipoServicioFotos = 'PUERTO' | 'HACIENDA' | 'VIP';
export type MomentoFotosPedidas = 'SALIDA' | 'LLEGADA';
export type FotosPedidasConfig = Record<TipoServicioFotos, Record<MomentoFotosPedidas, FotoPedidaConfig[]>>;

export const MAX_FOTOS_PEDIDAS = 8;
export const MAX_NOMBRE_FOTO_PEDIDA = 40;

export interface ConfigCustodias {
  firmaMomento: MomentoFirma;
  firmaObligatoria: boolean;
  correoCopias: string[];
  correoAsunto: string;
  correoTexto: string;
  telefonoOperaciones: string | null;
  /** Fotos que se piden al custodio, por tipo de servicio y momento. */
  fotosPedidas?: FotosPedidasConfig;
  firmasPorCliente: FirmaPorCliente[];
}

export interface ContactoCliente {
  id: number;
  name: string;
  role?: string | null;
  emails: string[];
  phones: string[];
}

export interface ClienteDirectorio {
  id: number;
  name: string;
  ruc?: string | null;
  email?: string | null;
  phone?: string | null;
  contactos: ContactoCliente[];
}

export interface CorreoSugerido {
  nombre: string;
  correo: string;
  origen: 'CLIENTE' | 'CONTACTO';
}

export interface EnvioGuia {
  id: number;
  para: string[];
  copia: string[];
  asunto: string;
  enviadoPor?: number | null;
  enviadoPorNombre?: string | null;
  enviadoEn: string;
  ok: boolean;
  error?: string | null;
}

export interface DatosEnvio {
  sugeridos: CorreoSugerido[];
  copia: string[];
  asunto: string;
  texto: string;
  envios: EnvioGuia[];
}

export const MOMENTOS_FIRMA: { valor: MomentoFirma; etiqueta: string }[] = [
  { valor: 'SALIDA', etiqueta: 'Al salir' },
  { valor: 'LLEGADA', etiqueta: 'Al llegar' },
  { valor: 'AMBOS', etiqueta: 'En los dos momentos' },
];

export const etiquetaMomento = (m?: string | null): string =>
  MOMENTOS_FIRMA.find((x) => x.valor === m)?.etiqueta ?? '—';

export const MAX_CONTENEDORES = 4;
export const MAX_HACIENDAS = 3;
