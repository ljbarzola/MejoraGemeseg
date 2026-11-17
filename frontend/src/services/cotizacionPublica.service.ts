import { api } from './auth.service';

// Página pública de la cotización (/cotizacion/:token), sin sesión. Lo que llega aquí son SOLO precios de
// venta calculados por el servidor (cotizador-enlaces.util.ts, armarPagina): nunca costos ni márgenes.
// Si en este navegador hay una sesión de la empresa, `api` manda su token y la visita no cuenta como del cliente.

export interface FilaProductoPublica {
  codigo: string;
  nombre: string;
  unidad: string;
  precioUnitario: number;
  cantidad: number;
  /** En un kit: cantidad por kit (la que imprime el PDF). */
  cantidadEnKit: number;
  total: number;
  admiteInstalacion: boolean;
  instalacionIncluida: boolean;
}

export type BloquePublico =
  | { tipo: 'producto'; fila: FilaProductoPublica }
  | { tipo: 'kit'; nombre: string; cantidad: number; filas: FilaProductoPublica[]; total: number };

export interface FilaServicioPublica {
  descripcion: string;
  detalle: string;
  categoria: string;
  subcategoria: string;
  precioUnitario: number;
  cantidad: number;
  total: number;
}

export interface CotizacionPublica {
  empresa: { nombre: string; logoUrl: string | null; colorPrincipal: string; colorAcento: string };
  numero: string;
  fecha: string;
  validaHasta: string;
  vencida: boolean;
  actualizadaEn: string | null;
  cliente: { nombre: string; ruc: string; contacto: string; direccion: string; telefono: string; email: string };
  asesor: { nombre: string; cargo: string; telefono: string; whatsapp: string };
  descuento: { tipo: 'none' | 'percent' | 'fixed'; porcentaje: number | null };
  cotizacion: {
    bloques: BloquePublico[];
    custodias: FilaServicioPublica[];
    instalaciones: FilaServicioPublica[];
    totales: {
      productos: number;
      instalaciones: number;
      custodia: number;
      base: number;
      descuento: number;
      subtotal: number;
      iva: number;
      total: number;
    };
  };
  condiciones: string[];
  notas: string;
}

const base = (token: string) => `/public/cotizaciones/${encodeURIComponent(token)}`;

export const getCotizacionPublica = (token: string): Promise<CotizacionPublica> =>
  api.get(base(token)).then((r) => r.data);

export const abrirVisita = (
  token: string,
  visitante: string,
): Promise<{ visita: number; clave: string; interna: boolean }> =>
  api.post(`${base(token)}/visitas`, { visitante }).then((r) => r.data);

export const latidoVisita = (
  token: string,
  visita: number,
  clave: string,
  opciones: { descarga?: boolean; reanudar?: boolean } = {},
) =>
  api
    .post(`${base(token)}/visitas/${visita}/latido`, {
      clave,
      descarga: !!opciones.descarga,
      reanudar: !!opciones.reanudar,
    })
    .then((r) => r.data);

/**
 * Último aviso al cerrar o esconder la página: `keepalive` deja que salga aunque la pestaña se cierre.
 * Va sin token a propósito (no hace falta: la clave de la visita basta).
 */
export function latidoFinal(token: string, visita: number, clave: string) {
  try {
    void fetch(`${api.defaults.baseURL}${base(token)}/visitas/${visita}/latido`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave, descarga: false }),
      keepalive: true,
    });
  } catch {
    /* si no sale, solo se pierden unos segundos del conteo */
  }
}

export const responderCotizacion = (
  token: string,
  tipo: 'interesa' | 'dudas',
  mensaje: string,
): Promise<{ ok: boolean; prueba: boolean }> =>
  api.post(`${base(token)}/respuesta`, { tipo, mensaje }).then((r) => r.data);
