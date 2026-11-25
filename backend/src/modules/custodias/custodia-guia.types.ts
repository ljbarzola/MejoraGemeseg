/**
 * Forma del campo `Custodia.guia` (JSONB): la hoja de ruta digital (2026-11-24, Fase 1).
 * La copia del frontend vive en `frontend/src/types/custodiaGuia.ts`: si cambia una, cambia la otra.
 */
export type RefCustodio = 'custodio1' | 'custodio2' | 'custodio3' | 'custodio4';
export type ValorCampo = string | number | boolean | null;

export interface GuiaContenedor {
  numero: string;
  choferNombre: string;
  choferCedula: string;
  placaCabezal: string;
  guia: string;
  lote: string;
  cabina?: {
    custodio: RefCustodio | null;
    placa: string;
    tipoVehiculo: string;
  } | null;
  /** Campos de bloque CONTENEDOR (incluye los 5 sellos). */
  campos?: Record<string, ValorCampo>;
}

export interface GuiaHacienda {
  nombre: string;
  guia: string;
  sacos: number | null;
  campos?: Record<string, ValorCampo>;
}

/** Foto de un campo configurable al guardar, para que un viaje viejo se lea igual aunque se renombre u oculte. */
export interface GuiaEtiqueta {
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
  firmaMomento?: 'SALIDA' | 'LLEGADA' | 'AMBOS' | null;
  /** Campos GENERALES configurables, clave = id del campo (texto). */
  campos?: Record<string, ValorCampo>;
  /** Máximo 4, solo si el tipo es PUERTO. */
  contenedores?: GuiaContenedor[];
  /** Solo HACIENDA. */
  furgon?: { placa: string; choferNombre: string; choferCedula: string } | null;
  /** Máximo 3, solo HACIENDA. */
  haciendas?: GuiaHacienda[];
  etiquetas?: Record<string, GuiaEtiqueta>;
}

export const MAX_CONTENEDORES = 4;
export const MAX_HACIENDAS = 3;
