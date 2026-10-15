// Armado de lo que se le envía a Google Ads (Data Manager API, `events:ingest`).
// Funciones puras, con spec. El envío en sí está en google-ads-conversiones.service.ts.
//
// Qué falta para activarlo (no son secretos, son identificadores de la cuenta de Ads):
//   GOOGLE_ADS_CUSTOMER_ID            ID de cliente de Google Ads (10 dígitos)
//   GOOGLE_ADS_CONVERSION_CUALIFICADO ID de la acción de conversión «Lead cualificado»
//   GOOGLE_ADS_CONVERSION_CONVERTIDO  ID de la acción de conversión «Lead convertido»
// Opcionales:
//   GOOGLE_ADS_SERVICE_ACCOUNT        cuenta que se impersona (por defecto, la dedicada de Ads)
//   GOOGLE_ADS_VALIDATE_ONLY=true     Google solo valida: no cuenta nada ni se marca como enviado
// Sin los tres primeros, el envío no hace nada y los hechos quedan PENDIENTES.

import type { TipoConversion } from './ventas-conversiones.util';

export const CUENTA_ADS_POR_DEFECTO =
  'ads-conversiones@mejora-gemeseg.iam.gserviceaccount.com';
export const ALCANCE_DATA_MANAGER = 'https://www.googleapis.com/auth/datamanager';
export const URL_INGEST = 'https://datamanager.googleapis.com/v1/events:ingest';

export interface ConfigGoogleAds {
  customerId: string;
  conversiones: Record<TipoConversion, string>;
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
    conversiones: { CUALIFICADO: cualificado, CONVERTIDO: convertido },
    cuentaDeServicio: (env.GOOGLE_ADS_SERVICE_ACCOUNT ?? '').trim() || CUENTA_ADS_POR_DEFECTO,
    validateOnly: (env.GOOGLE_ADS_VALIDATE_ONLY ?? '').toLowerCase() === 'true',
  };
}

export interface HechoParaEnviar {
  opportunityId: number;
  kind: TipoConversion;
  gclid: string;
  occurredAt: Date;
  value: number | null;
  currency: string;
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
      transactionId: `crm-${h.opportunityId}-${h.kind}`,
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

// Después de tantos intentos fallidos deja de reintentarse solo.
export const MAX_INTENTOS = 8;
// Un fallo se reintenta como mucho cada tanto (minutos).
export const ESPERA_REINTENTO_MIN = 10;
