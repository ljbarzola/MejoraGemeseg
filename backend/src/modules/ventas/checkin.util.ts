// Check-in de una visita (Planificación y Campo): ¿la persona está de verdad donde tenía que ir?
//
// Antes (hasta 2026-10-20) el servidor marcaba TODO check-in como verificado, sin mirar dónde estaba
// la persona, e incluso cuando el navegador no daba ubicación. Ahora se compara el punto que leyó el
// navegador con el lugar de la visita.
//
// Decisión de la usuaria (2026-10-20): hasta 500 m se considera «en el sitio» (las laptops sacan la
// ubicación por Wi-Fi y fallan por varios cientos de metros; el punto del mapa también puede quedar a
// una cuadra del local). Más lejos se avisa y, si la persona lo confirma, se registra como «fuera del
// sitio», nunca como verificado.

export const DISTANCIA_MAXIMA_CHECKIN_M = 500;

export type ResultadoCheckIn =
  /** Dentro de la distancia permitida: es el único que cuenta como verificado. */
  | 'EN_SITIO'
  /** Más lejos que la distancia permitida. */
  | 'FUERA_DEL_SITIO'
  /** El navegador no dio la ubicación (permiso negado, sin señal o sin soporte). */
  | 'SIN_GPS'
  /** La visita no tiene lugar definido: no hay con qué comparar. */
  | 'SIN_UBICACION';

export interface PuntoGps {
  lat?: number | null;
  lng?: number | null;
}

const RADIO_TIERRA_M = 6371000;

// Un punto sirve si son números reales dentro del rango del mundo. (0, 0) se descarta: es lo que
// devuelven los dispositivos cuando no saben dónde están.
export function puntoValido(p: PuntoGps | null | undefined): p is { lat: number; lng: number } {
  if (!p) return false;
  const { lat, lng } = p;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return !(lat === 0 && lng === 0);
}

// Distancia en metros entre dos puntos (fórmula de haversine).
export function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function evaluarCheckIn(
  gps: PuntoGps | null | undefined,
  destino: PuntoGps | null | undefined,
): { resultado: ResultadoCheckIn; distanciaM: number | null } {
  if (!puntoValido(gps)) return { resultado: 'SIN_GPS', distanciaM: null };
  if (!puntoValido(destino)) return { resultado: 'SIN_UBICACION', distanciaM: null };
  const distanciaM = Math.round(distanciaMetros(gps, destino));
  return {
    resultado: distanciaM <= DISTANCIA_MAXIMA_CHECKIN_M ? 'EN_SITIO' : 'FUERA_DEL_SITIO',
    distanciaM,
  };
}
