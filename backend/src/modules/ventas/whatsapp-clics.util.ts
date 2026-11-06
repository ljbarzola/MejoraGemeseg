// Reglas puras de los clics a WhatsApp de las landings (2026-10-30). El navegador
// manda lo que quiera: aquí se limpia, se recorta y se aplican los valores por
// defecto del documento de medición (sin UTM = direct / none / none).

// GMS-WA- y seis caracteres sin 0/O/1/I/L para que el operador no los confunda al copiarlos.
export const PATRON_TRACKING_ID = /^GMS-WA-[A-HJ-KM-NP-Z2-9]{6}$/;

// Orígenes desde donde las landings pueden registrar un clic (CORS de esa ruta).
// WA_CLICK_ORIGINS (separados por coma) agrega otros, p. ej. un preview de Vercel.
export function origenesDeLanding(env: string | undefined = process.env.WA_CLICK_ORIGINS): string[] {
  return [
    'https://gemeseg.com',
    'https://www.gemeseg.com',
    ...(env ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  ];
}

const recortar = (v: unknown, max: number): string | null => {
  const t = (v ?? '').toString().trim();
  return t ? t.slice(0, max) : null;
};

// Servicio y grupo: minúsculas con guion bajo (monitoreo_vehiculos / monitoreo).
const clave = (v: unknown, max: number): string | null => {
  const t = recortar(v, max);
  return t ? t.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || null : null;
};

export interface ClicEntrada {
  trackingId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  landingPage: string | null;
  serviceName: string | null;
  serviceGroup: string | null;
  pageUrl: string | null;
}

// Devuelve null si el código no tiene el formato GMS-WA-XXXXXX (no se guarda nada).
export function limpiarClic(body: Record<string, unknown> | null | undefined): ClicEntrada | null {
  const trackingId = (body?.tracking_id ?? '').toString().trim().toUpperCase();
  if (!PATRON_TRACKING_ID.test(trackingId)) return null;
  return {
    trackingId,
    utmSource: recortar(body?.utm_source, 150) ?? 'direct',
    utmMedium: recortar(body?.utm_medium, 150) ?? 'none',
    utmCampaign: recortar(body?.utm_campaign, 200) ?? 'none',
    utmContent: recortar(body?.utm_content, 200),
    utmTerm: recortar(body?.utm_term, 200),
    gclid: recortar(body?.gclid, 300),
    fbclid: recortar(body?.fbclid, 300),
    landingPage: recortar(body?.landing_page, 200),
    serviceName: clave(body?.service_name, 100),
    serviceGroup: clave(body?.service_group, 100),
    // Solo la dirección sin parámetros: nunca se guardan los UTM dos veces ni datos que viajen en la URL.
    pageUrl: recortar((body?.page_url ?? '').toString().split(/[?#]/)[0], 300),
  };
}

// Límite por IP en memoria (mejor esfuerzo: con varias instancias de Cloud Run cada una cuenta aparte).
export class LimitePorIp {
  private readonly golpes = new Map<string, number[]>();
  constructor(
    private readonly maximo = 30,
    private readonly ventanaMs = 10 * 60_000,
  ) {}

  permitir(ip: string, ahora = Date.now()): boolean {
    const recientes = (this.golpes.get(ip) ?? []).filter((t) => ahora - t < this.ventanaMs);
    if (recientes.length >= this.maximo) {
      this.golpes.set(ip, recientes);
      return false;
    }
    recientes.push(ahora);
    this.golpes.set(ip, recientes);
    // Evita que el mapa crezca sin fin con IPs que no vuelven.
    if (this.golpes.size > 5000) {
      for (const [k, v] of this.golpes) {
        if (v.every((t) => ahora - t >= this.ventanaMs)) this.golpes.delete(k);
      }
    }
    return true;
  }
}
