// Armado de lo que se le envía a Google Ads (Data Manager API, `events:ingest`).
// Funciones puras, con spec. El envío en sí está en google-ads-conversiones.service.ts.
//
// Qué falta para activarlo (no son secretos, son identificadores de la cuenta de Ads):
//   GOOGLE_ADS_CUSTOMER_ID            ID de cliente de Google Ads (10 dígitos)
//   GOOGLE_ADS_CONVERSION_CUALIFICADO ID de la acción de conversión «Lead cualificado»
//   GOOGLE_ADS_CONVERSION_CONVERTIDO  ID de la acción de conversión «Lead convertido»
// Opcionales:
//   GOOGLE_ADS_CONVERSION_VALIDO      ID de la acción «Lead válido» (paso intermedio, 2026-10-18); sin él
//                                     no se registra ni se envía ese hecho
//   GOOGLE_ADS_SERVICE_ACCOUNT        cuenta que se impersona (por defecto, la dedicada de Ads)
//   GOOGLE_ADS_VALIDATE_ONLY=true     Google solo valida: no cuenta nada ni se marca como enviado
// Sin los tres primeros, el envío no hace nada y los hechos quedan PENDIENTES.

import type { TipoConversion } from './ventas-conversiones.util';

export const CUENTA_ADS_POR_DEFECTO =
  'ads-conversiones@mejora-gemeseg.iam.gserviceaccount.com';
export const ALCANCE_DATA_MANAGER = 'https://www.googleapis.com/auth/datamanager';
export const URL_INGEST = 'https://datamanager.googleapis.com/v1/events:ingest';
// Estado de una solicitud ya enviada (`?requestId=`). Google procesa los eventos DESPUÉS de aceptar la
// solicitud: el 200 de `events:ingest` solo dice «recibido». La guía de Google pide esperar ~30 minutos y
// conserva el estado unos 50 días.
export const URL_ESTADO = 'https://datamanager.googleapis.com/v1/requestStatus:retrieve';
export const ESPERA_VERIFICACION_MIN = 30;
export const RETENCION_ESTADO_DIAS = 45;

// CUALIFICADO y CONVERTIDO son obligatorios para activar el envío; VALIDO es opcional ('' = no se usa).
export type ConversionesGoogleAds = Record<Exclude<TipoConversion, 'VALIDO'>, string> & {
  VALIDO: string;
};

export interface ConfigGoogleAds {
  customerId: string;
  conversiones: ConversionesGoogleAds;
  cuentaDeServicio: string;
  validateOnly: boolean;
}

const soloDigitos = (v: string | undefined): string => (v ?? '').replace(/\D/g, '');

// null = no está configurado (se ignora en silencio: el envío es opcional).
export function leerConfigGoogleAds(
  env: Record<string, string | undefined> = process.env,
): ConfigGoogleAds | null {
  const customerId = soloDigitos(env.GOOGLE_ADS_CUSTOMER_ID);
  const cualificado = soloDigitos(env.GOOGLE_ADS_CONVERSION_CUALIFICADO);
  const convertido = soloDigitos(env.GOOGLE_ADS_CONVERSION_CONVERTIDO);
  if (customerId.length !== 10 || !cualificado || !convertido) return null;
  return {
    customerId,
    conversiones: {
      CUALIFICADO: cualificado,
      CONVERTIDO: convertido,
      VALIDO: soloDigitos(env.GOOGLE_ADS_CONVERSION_VALIDO),
    },
    cuentaDeServicio: (env.GOOGLE_ADS_SERVICE_ACCOUNT ?? '').trim() || CUENTA_ADS_POR_DEFECTO,
    validateOnly: (env.GOOGLE_ADS_VALIDATE_ONLY ?? '').toLowerCase() === 'true',
  };
}

export interface HechoParaEnviar {
  // null en «Lead válido»: ese hecho pasa ANTES de que exista la oportunidad y se identifica por el lead.
  opportunityId: number | null;
  leadId: number;
  kind: TipoConversion;
  gclid: string;
  occurredAt: Date;
  value: number | null;
  currency: string;
}

// El mismo hecho siempre lleva el mismo id (Google no lo cuenta dos veces si se reintenta). Los de siempre
// conservan su formato para no duplicar lo ya enviado; «Lead válido» se identifica por el lead.
export function idTransaccion(h: Pick<HechoParaEnviar, 'opportunityId' | 'leadId' | 'kind'>): string {
  return h.kind === 'VALIDO' || h.opportunityId === null
    ? `crm-lead-${h.leadId}-${h.kind}`
    : `crm-${h.opportunityId}-${h.kind}`;
}

// Cuerpo de `events:ingest`: una destinación por tipo de conversión usado y un
// evento por hecho, identificado por su gclid. `transactionId` hace que Google
// no cuente dos veces el mismo hecho si se reintenta.
export function construirSolicitud(config: ConfigGoogleAds, hechos: HechoParaEnviar[]) {
  const usados = [...new Set(hechos.map((h) => h.kind))];
  return {
    validateOnly: config.validateOnly,
    destinations: usados.map((kind) => ({
      reference: kind,
      operatingAccount: { accountType: 'GOOGLE_ADS', accountId: config.customerId },
      productDestinationId: config.conversiones[kind],
    })),
    events: hechos.map((h) => ({
      destinationReferences: [h.kind],
      eventTimestamp: h.occurredAt.toISOString(),
      transactionId: idTransaccion(h),
      eventSource: 'OTHER',
      adIdentifiers: { gclid: h.gclid },
      ...(h.value !== null && h.value > 0
        ? { conversionValue: h.value, currency: h.currency }
        : {}),
    })),
  };
}

// Texto corto y sin detalles internos para guardar y mostrar (el error real
// va solo al registro del servidor).
export function mensajeDeError(status: number | undefined): string {
  if (status === 401 || status === 403) {
    return 'Google no autorizó el envío: revisa que la cuenta de servicio tenga acceso a la cuenta de Google Ads.';
  }
  if (status === 400 || status === 404) {
    return 'Google rechazó los datos del envío: revisa el ID de cliente y los IDs de las conversiones.';
  }
  if (status === 429 || (status !== undefined && status >= 500)) {
    return 'Google no pudo recibirlo ahora; se reintenta solo.';
  }
  return 'No se pudo enviar a Google; se reintenta solo.';
}

// ---- Qué dijo Google después de procesar (requestStatus:retrieve) ----

export interface DestinoEstadoGoogle {
  requestStatus?: string;
  errorInfo?: { errorCounts?: { reason?: string; recordCount?: string }[] };
  warningInfo?: { warningCounts?: { reason?: string; recordCount?: string }[] };
}

export type EstadoVerificado = 'PROCESANDO' | 'ACEPTADO' | 'PARCIAL' | 'RECHAZADO' | 'REINTENTAR';

export interface VeredictoGoogle {
  estado: EstadoVerificado;
  // Texto corto y accionable para mostrar (sin códigos internos); null si no hay nada que decir.
  nota: string | null;
  // Códigos de Google tal cual: SOLO para el registro del servidor, nunca a la pantalla.
  razones: string[];
}

const limpiarRazon = (r: string | undefined): string =>
  (r ?? '').replace(/^PROCESSING_(ERROR|WARNING)_(REASON_)?/, '');

// Motivos reconocidos (lista de ProcessingErrorReason de la Data Manager API, 2026-10-27).
const MOTIVOS: { si: RegExp; texto: string; reintentar?: boolean; yaEstaba?: boolean }[] = [
  { si: /^DUPLICATE_/, texto: 'Google ya tenía este aviso.', yaEstaba: true },
  {
    si: /^(INVALID_CLICK|CLICK_NOT_FOUND|INVALID_GCLID|USER_ID_NOT_FOUND_FOR_GCLID|INVALID_AD_IDENTIFIERS)$/,
    texto: 'Google no encontró el clic de ese anuncio (puede ser un clic de prueba o que no sea de anuncios).',
  },
  {
    si: /^(INVALID_OPERATING_ACCOUNT_FOR_CLICK|OPERATING_ACCOUNT_MISMATCH_FOR_AD_IDENTIFIER)$/,
    texto: 'El clic es de otra cuenta de Google Ads distinta al ID de cliente guardado.',
  },
  {
    si: /^EXPIRED_CLICK$/,
    texto: 'El clic es más viejo que la ventana de conversión de esa acción en Google Ads.',
  },
  { si: /^EVENT_TOO_OLD$/, texto: 'La conversión es más antigua de lo que Google acepta.' },
  { si: /^CONVERSION_PRECEDES_CLICK$/, texto: 'La fecha del aviso es anterior a la del clic.' },
  {
    si: /CONSENT/,
    texto: 'Google lo rechazó por el consentimiento de datos publicitarios de la cuenta.',
  },
  { si: /^(INVALID_EVENT|INVALID_FORMAT)$/, texto: 'Google no entendió el formato del aviso.' },
  { si: /^TOO_RECENT_CLICK$/, texto: 'El clic es muy reciente para Google; se reintenta solo.', reintentar: true },
  {
    si: /^(DESTINATION_TOO_RECENTLY_CREATED|INTERNAL_ERROR)$/,
    texto: 'Google no pudo procesarlo ahora; se reintenta solo.',
    reintentar: true,
  },
];

const MOTIVO_DESCONOCIDO =
  'Google rechazó el aviso por un motivo que no reconocemos; el detalle quedó en el registro del servidor.';

// Traduce lo que Google contestó para UN destino (un tipo de conversión de la solicitud).
export function veredictoDeDestino(d: DestinoEstadoGoogle | undefined): VeredictoGoogle {
  const estado = d?.requestStatus;
  if (!d || !estado || estado === 'PROCESSING' || estado === 'REQUEST_STATUS_UNKNOWN') {
    return { estado: 'PROCESANDO', nota: null, razones: [] };
  }
  const razones = (d.errorInfo?.errorCounts ?? []).map((e) => limpiarRazon(e.reason)).filter(Boolean);
  const avisos = (d.warningInfo?.warningCounts ?? []).map((w) => limpiarRazon(w.reason)).filter(Boolean);

  if (estado === 'SUCCESS') {
    return {
      estado: 'ACEPTADO',
      nota: avisos.length ? 'Google lo aceptó con avisos; el detalle quedó en el registro del servidor.' : null,
      razones: avisos,
    };
  }
  if (estado === 'FAILED' || estado === 'PARTIAL_SUCCESS') {
    const motivos = razones.map((r) => MOTIVOS.find((m) => m.si.test(r)));
    // Todo lo rechazado era «ya lo tenía»: para el CRM el aviso está recibido.
    if (razones.length > 0 && motivos.every((m) => m?.yaEstaba)) {
      return { estado: 'ACEPTADO', nota: 'Google ya tenía este aviso.', razones };
    }
    const textos = [...new Set(motivos.map((m) => m?.texto ?? MOTIVO_DESCONOCIDO))];
    if (estado === 'FAILED' && motivos.length > 0 && motivos.every((m) => m?.reintentar)) {
      return { estado: 'REINTENTAR', nota: textos.join(' '), razones };
    }
    return {
      estado: estado === 'FAILED' ? 'RECHAZADO' : 'PARCIAL',
      nota: textos.length ? textos.join(' ') : MOTIVO_DESCONOCIDO,
      razones,
    };
  }
  return { estado: 'PROCESANDO', nota: null, razones: [] };
}

// Después de tantos intentos fallidos deja de reintentarse solo.
export const MAX_INTENTOS = 8;
// Un fallo se reintenta como mucho cada tanto (minutos).
export const ESPERA_REINTENTO_MIN = 10;
