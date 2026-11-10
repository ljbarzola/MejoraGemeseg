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
  // Solo dígitos con código de país (593969135744); null si no llegó o no parece un teléfono.
  whatsappNumber: string | null;
}

// Un número de WhatsApp válido tiene entre 8 y 15 dígitos (E.164). Cualquier otra cosa no se guarda.
export function numeroLimpio(valor: unknown): string | null {
  const digitos = (valor ?? '').toString().replace(/\D/g, '');
  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
}

// 593969135744 -> «+593 96 913 5744» (Ecuador); otros países se muestran como +<dígitos>.
export function numeroLegible(numero: string | null | undefined): string {
  const d = (numero || '').replace(/\D/g, '');
  if (!d) return '';
  const ec = /^593(\d{2})(\d{3})(\d{4})$/.exec(d);
  return ec ? `+593 ${ec[1]} ${ec[2]} ${ec[3]}` : `+${d}`;
}

// La ciudad de un número de WhatsApp según la tabla de ciudades (un número solo está en una ciudad). Un número que
// aún no está en ninguna sale como «Sin ciudad (+593 …)» para que se vea cuál falta asignar; sin número, null.
export function ciudadDeNumero(numero: string | null | undefined, ciudadPorNumero: Record<string, string>): string | null {
  const d = (numero || '').replace(/\D/g, '');
  if (!d) return null;
  return ciudadPorNumero[d] || `Sin ciudad (${numeroLegible(d)})`;
}

// Responsable de un contacto o clic: el de su campaña si la campaña tiene uno propio, si no el de su ciudad.
export function responsableDe(
  ciudad: string | null | undefined,
  campana: string | null | undefined,
  r: { porCiudad: Record<string, string>; porCampana: Record<string, string> },
): string | null {
  const c = (campana || '').trim().toLowerCase();
  return (c && r.porCampana[c]) || (ciudad && r.porCiudad[ciudad]) || null;
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
    whatsappNumber: numeroLimpio(body?.whatsapp_number),
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
