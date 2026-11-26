/**
 * Catálogo de canales que Marketing sabe trabajar. Es de producto (igual para toda empresa):
 * lo que cada empresa usa se decide por campaña y su estado de conexión vive en MarketingConexion.
 * El mismo catálogo está en frontend/src/components/marketing/marketingCanales.ts: cambiar los dos.
 *
 * `conexion`:
 *  - API: hay API oficial para publicar o crear la campaña desde la app (necesita conectar la cuenta).
 *  - MANUAL: la app deja la pieza lista y la persona la publica con un clic en la plataforma.
 *  - INTERNA: lo hace la propia app (p. ej. la página de aterrizaje).
 */
export interface CanalMarketing {
  key: string;
  nombre: string;
  descripcion: string;
  pagado: boolean;
  conexion: 'API' | 'MANUAL' | 'INTERNA';
  administrador: string | null;
  patron: RegExp;
}

export const CANALES_MARKETING: CanalMarketing[] = [
  {
    key: 'META',
    nombre: 'Facebook e Instagram',
    descripcion: 'Publicaciones, historias y anuncios pagados en Meta.',
    pagado: true,
    conexion: 'API',
    administrador: 'https://adsmanager.facebook.com/',
    patron: /meta|facebook|instagram|\bfb\b|\big\b|reel|histori/i,
  },
  {
    key: 'GOOGLE_ADS',
    nombre: 'Google Ads (búsqueda)',
    descripcion: 'Anuncios que salen cuando alguien busca el servicio en Google.',
    pagado: true,
    conexion: 'API',
    administrador: 'https://ads.google.com/',
    patron: /google ads|adwords|b[uú]squeda|search|sem\b|performance max|pmax/i,
  },
  {
    key: 'GOOGLE_PERFIL',
    nombre: 'Perfil de Google (Maps)',
    descripcion: 'Publicaciones y reseñas en la ficha del negocio en Google Maps.',
    pagado: false,
    conexion: 'API',
    administrador: 'https://business.google.com/',
    patron: /perfil de google|google business|google maps|\bmaps\b|ficha|rese[ñn]a/i,
  },
  {
    key: 'WHATSAPP',
    nombre: 'WhatsApp',
    descripcion: 'Mensajes a contactos y clientes que aceptaron recibirlos.',
    pagado: false,
    conexion: 'API',
    administrador: 'https://business.facebook.com/wa/manage/',
    patron: /whats/i,
  },
  {
    key: 'CORREO',
    nombre: 'Correo',
    descripcion: 'Correos a clientes y contactos del CRM.',
    pagado: false,
    conexion: 'API',
    administrador: null,
    patron: /correo|e-?mail|mail|newsletter|bolet[ií]n/i,
  },
  {
    key: 'LINKEDIN',
    nombre: 'LinkedIn',
    descripcion: 'Publicaciones para gerentes y tomadores de decisión.',
    pagado: false,
    conexion: 'MANUAL',
    administrador: 'https://www.linkedin.com/',
    patron: /linked/i,
  },
  {
    key: 'TIKTOK',
    nombre: 'TikTok',
    descripcion: 'Videos cortos para llegar a público nuevo.',
    pagado: false,
    conexion: 'MANUAL',
    administrador: 'https://www.tiktok.com/',
    patron: /tik ?tok/i,
  },
  {
    key: 'LANDING',
    nombre: 'Página de aterrizaje',
    descripcion: 'Página propia de la campaña con formulario que llega a Ventas.',
    pagado: false,
    conexion: 'INTERNA',
    administrador: null,
    patron: /landing|aterrizaje|p[aá]gina web|sitio web|\bweb\b/i,
  },
];

export const CLAVES_CANALES = CANALES_MARKETING.map((c) => c.key);

export function canalPorClave(key: string | null | undefined): CanalMarketing | undefined {
  return CANALES_MARKETING.find((c) => c.key === key);
}

/** Las piezas guardan el canal como texto libre: se traduce a la clave del catálogo (o null si es otro). */
export function claveDeCanal(texto: string | null | undefined): string | null {
  const t = (texto || '').trim();
  if (!t) return null;
  const exacto = CANALES_MARKETING.find((c) => c.key === t.toUpperCase() || c.nombre.toLowerCase() === t.toLowerCase());
  if (exacto) return exacto.key;
  return CANALES_MARKETING.find((c) => c.patron.test(t))?.key ?? null;
}
