// Enlace de la cotización para el cliente (2026-11-17): reglas puras, sin base de datos.
import { randomBytes } from 'crypto';
import type { CotizacionVenta } from './cotizador-precios.util';

/** Días de validez de la oferta (los mismos que imprime el PDF). Es solo informativo: el enlace no vence. */
export const DIAS_VALIDEZ = 15;
/** Teléfono de respaldo del asesor (el mismo del PDF; frontend/src/utils/telefono.ts). */
export const TELEFONO_RESPALDO = '+593 99 897 4909';
/** Cada cuánto avisa la página que sigue a la vista (el servidor nunca suma más que esto entre dos avisos). */
export const LATIDO_SEGUNDOS = 15;
/** Margen para un aviso que llega tarde (red lenta); por encima se cuenta solo esto. */
export const LATIDO_MAX_SEGUNDOS = 30;
/** Tope de tiempo de una sola visita: evita que una pestaña olvidada abierta días infle la cifra. */
export const VISITA_MAX_SEGUNDOS = 4 * 60 * 60;

export type TipoRespuesta = 'interesa' | 'dudas';
export const TIPOS_RESPUESTA: TipoRespuesta[] = ['interesa', 'dudas'];

/** Código del enlace: 32 caracteres al azar (192 bits). No se puede adivinar ni deducir del número de la cotización. */
export function nuevoToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Clave de una visita: solo quien abrió la página puede sumar tiempo a esa visita. */
export function nuevaClave(): string {
  return randomBytes(18).toString('base64url');
}

/** Solo se consulta la base con un código que tenga la forma correcta (cualquier otra cosa es 404 directo). */
export function tokenValido(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t);
}

export function claveValida(c: unknown): c is string {
  return typeof c === 'string' && /^[A-Za-z0-9_-]{24}$/.test(c);
}

/** Identificador al azar que la página guarda en el navegador para contar personas distintas. */
export function visitanteValido(v: unknown): string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : '';
}

export type Dispositivo = 'celular' | 'tablet' | 'computadora';

/** Tipo de equipo a partir del navegador (User-Agent). No se guarda nada más del navegador. */
export function dispositivoDe(
  userAgent: string | undefined | null,
): Dispositivo {
  const ua = (userAgent ?? '').toLowerCase();
  if (/ipad|tablet|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|windows phone/.test(ua)) return 'celular';
  return 'computadora';
}

/**
 * Segundos que se suman en un aviso: lo transcurrido desde el aviso anterior, sin pasar de
 * LATIDO_MAX_SEGUNDOS (si la página estuvo oculta no avisa, y ese hueco no se cuenta) ni del tope de la visita.
 */
export function segundosASumar(
  ultimo: Date,
  ahora: Date,
  acumulado: number,
): number {
  const transcurrido = Math.floor((ahora.getTime() - ultimo.getTime()) / 1000);
  if (!Number.isFinite(transcurrido) || transcurrido <= 0) return 0;
  const tramo = Math.min(transcurrido, LATIDO_MAX_SEGUNDOS);
  return Math.max(0, Math.min(tramo, VISITA_MAX_SEGUNDOS - acumulado));
}

/** Fecha AAAA-MM-DD + n días (sin zonas horarias: es una fecha de calendario). */
export function sumarDias(fechaISO: string, dias: number): string {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const f = new Date(Date.UTC(a, (m || 1) - 1, d || 1));
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

/** Solo dígitos, con el 593 de Ecuador si el número es local (09…). Para el botón de WhatsApp. */
export function telefonoWhatsapp(tel: string | null | undefined): string {
  const digitos = (tel ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.startsWith('593')) return digitos;
  if (digitos.startsWith('0') && digitos.length === 10)
    return '593' + digitos.slice(1);
  return digitos;
}

/** Mensaje del cliente: texto plano, corto y sin caracteres de control. */
export function limpiarMensaje(m: unknown): string {
  if (typeof m !== 'string') return '';
  return (
    m
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, 500)
  );
}

// ---------------------------------------------------------------------------
// Lo que recibe la página pública. LISTA BLANCA: si un dato no está aquí, el cliente no lo ve.
// ---------------------------------------------------------------------------

export interface DatosPagina {
  empresa: {
    nombre: string;
    logoUrl: string | null;
    colorPrincipal: string;
    colorAcento: string;
  };
  numero: string;
  fecha: string;
  validaHasta: string;
  vencida: boolean;
  /** Fecha de la última modificación si fue después de crear el enlace (para «Actualizada el…»). */
  actualizadaEn: string | null;
  cliente: {
    nombre: string;
    ruc: string;
    contacto: string;
    direccion: string;
    telefono: string;
    email: string;
  };
  asesor: { nombre: string; cargo: string; telefono: string; whatsapp: string };
  descuento: { tipo: 'none' | 'percent' | 'fixed'; porcentaje: number | null };
  cotizacion: CotizacionVenta;
  condiciones: string[];
  notas: string;
}

export interface EntradaPagina {
  empresa: {
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
  };
  quote: {
    quoteNumber: string;
    quoteDate: Date;
    updatedAt: Date;
    client: unknown;
    discountType: string;
    discountValue: number;
    conditions: string;
    notes: string;
    vendorName: string;
  };
  enlaceCreadoEn: Date;
  asesor: {
    fullName: string;
    position: string | null;
    phone: string | null;
  } | null;
  cotizacion: CotizacionVenta;
  hoyISO: string;
}

const txt = (v: unknown, max = 300): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
const color = (v: string | null | undefined, def: string): string =>
  v && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : def;

export function armarPagina(e: EntradaPagina): DatosPagina {
  const fecha = e.quote.quoteDate.toISOString().slice(0, 10);
  const validaHasta = sumarDias(fecha, DIAS_VALIDEZ);
  const cli = (e.quote.client ?? {}) as Record<string, unknown>;
  const tipo =
    (['none', 'percent', 'fixed'] as const).find(
      (t) => t === e.quote.discountType,
    ) ?? 'none';
  const telefono = e.asesor?.phone?.trim() || TELEFONO_RESPALDO;
  // Un cambio de unos segundos después de crear el enlace (el mismo guardado) no cuenta como «actualizada».
  const actualizada =
    e.quote.updatedAt.getTime() - e.enlaceCreadoEn.getTime() > 60_000;
  return {
    empresa: {
      nombre: e.empresa.name,
      logoUrl: e.empresa.logoUrl || null,
      colorPrincipal: color(e.empresa.primaryColor, '#100F31'),
      colorAcento: color(e.empresa.accentColor, '#EE3B1B'),
    },
    numero: e.quote.quoteNumber,
    fecha,
    validaHasta,
    vencida: e.hoyISO > validaHasta,
    actualizadaEn: actualizada ? e.quote.updatedAt.toISOString() : null,
    cliente: {
      nombre: txt(cli.name),
      ruc: txt(cli.ruc),
      contacto: txt(cli.contact),
      direccion: txt(cli.address),
      // El PDF de la app los imprime: el PDF del enlace debe ser igual (son los datos del propio cliente).
      telefono: txt(cli.phone),
      email: txt(cli.email),
    },
    asesor: {
      nombre: e.asesor?.fullName || e.quote.vendorName || '',
      cargo: e.asesor?.position ?? '',
      telefono,
      whatsapp: telefonoWhatsapp(telefono),
    },
    descuento: {
      tipo,
      porcentaje:
        tipo === 'percent'
          ? Math.min(100, Math.max(0, e.quote.discountValue))
          : null,
    },
    cotizacion: e.cotizacion,
    condiciones: e.quote.conditions
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 60),
    notas: e.quote.notes.trim().slice(0, 4000),
  };
}
