// Catálogo de canales de Marketing. Es copia de backend/src/modules/marketing/marketing-canales.const.ts:
// si cambias uno, cambia el otro. Las piezas guardan el canal como texto libre; `claveDeCanal` lo traduce.

export interface CanalMarketing {
  key: string;
  nombre: string;
  corto: string;
  descripcion: string;
  queHaceLaIa: string;
  pagado: boolean;
  conexion: 'API' | 'MANUAL' | 'INTERNA';
  icono: string;
  color: string;
  patron: RegExp;
}

export const CANALES_MARKETING: CanalMarketing[] = [
  {
    key: 'META',
    nombre: 'Facebook e Instagram',
    corto: 'Meta',
    descripcion: 'Publicaciones, historias y anuncios pagados en Meta.',
    queHaceLaIa: 'Escribe el texto, crea la imagen, arma el público y deja el anuncio creado en pausa.',
    pagado: true,
    conexion: 'API',
    icono: '📸',
    color: '#1877f2',
    patron: /meta|facebook|instagram|\bfb\b|\big\b|reel|histori/i,
  },
  {
    key: 'GOOGLE_ADS',
    nombre: 'Google Ads (búsqueda)',
    corto: 'Google Ads',
    descripcion: 'Anuncios que salen cuando alguien busca el servicio en Google.',
    queHaceLaIa: 'Propone palabras clave por ciudad y servicio, títulos y descripciones listos para subir.',
    pagado: true,
    conexion: 'API',
    icono: '🔎',
    color: '#ea4335',
    patron: /google ads|adwords|b[uú]squeda|search|sem\b|performance max|pmax/i,
  },
  {
    key: 'GOOGLE_PERFIL',
    nombre: 'Perfil de Google (Maps)',
    corto: 'Perfil de Google',
    descripcion: 'Publicaciones y reseñas en la ficha del negocio en Google Maps.',
    queHaceLaIa: 'Redacta publicaciones semanales y respuestas a reseñas.',
    pagado: false,
    conexion: 'API',
    icono: '📍',
    color: '#34a853',
    patron: /perfil de google|google business|google maps|\bmaps\b|ficha|rese[ñn]a/i,
  },
  {
    key: 'WHATSAPP',
    nombre: 'WhatsApp',
    corto: 'WhatsApp',
    descripcion: 'Mensajes a contactos y clientes que aceptaron recibirlos.',
    queHaceLaIa: 'Escribe mensajes cortos y personales, y el seguimiento si no responden.',
    pagado: false,
    conexion: 'API',
    icono: '💬',
    color: '#25d366',
    patron: /whats/i,
  },
  {
    key: 'CORREO',
    nombre: 'Correo',
    corto: 'Correo',
    descripcion: 'Correos a clientes y contactos del CRM.',
    queHaceLaIa: 'Redacta el asunto y el correo, y elige a quién enviarlo según el CRM.',
    pagado: false,
    conexion: 'API',
    icono: '✉️',
    color: '#64748b',
    patron: /correo|e-?mail|mail|newsletter|bolet[ií]n/i,
  },
  {
    key: 'LINKEDIN',
    nombre: 'LinkedIn',
    corto: 'LinkedIn',
    descripcion: 'Publicaciones para gerentes y tomadores de decisión.',
    queHaceLaIa: 'Escribe publicaciones profesionales con su imagen.',
    pagado: false,
    conexion: 'MANUAL',
    icono: '💼',
    color: '#0a66c2',
    patron: /linked/i,
  },
  {
    key: 'TIKTOK',
    nombre: 'TikTok',
    corto: 'TikTok',
    descripcion: 'Videos cortos para llegar a público nuevo.',
    queHaceLaIa: 'Escribe el guion y genera el video corto.',
    pagado: false,
    conexion: 'MANUAL',
    icono: '🎬',
    color: '#111827',
    patron: /tik ?tok/i,
  },
  {
    key: 'LANDING',
    nombre: 'Página de aterrizaje',
    corto: 'Landing',
    descripcion: 'Página propia de la campaña con formulario que llega a Ventas.',
    queHaceLaIa: 'Escribe los textos de la página; cada contacto entra solo a Ventas.',
    pagado: false,
    conexion: 'INTERNA',
    icono: '🌐',
    color: '#7c3aed',
    patron: /landing|aterrizaje|p[aá]gina web|sitio web|\bweb\b/i,
  },
];

export function canalPorClave(key: string | null | undefined): CanalMarketing | undefined {
  return CANALES_MARKETING.find((c) => c.key === key);
}

export function claveDeCanal(texto: string | null | undefined): string | null {
  const t = (texto || '').trim();
  if (!t) return null;
  const exacto = CANALES_MARKETING.find((c) => c.key === t.toUpperCase() || c.nombre.toLowerCase() === t.toLowerCase());
  if (exacto) return exacto.key;
  return CANALES_MARKETING.find((c) => c.patron.test(t))?.key ?? null;
}

export const ESTADOS_CONEXION: Record<string, { texto: string; clase: string }> = {
  NO_CONECTADO: { texto: 'Sin conectar', clase: 'borrador' },
  DEMO: { texto: 'Modo demostración', clase: 'demo' },
  SOLICITADO: { texto: 'Conexión solicitada', clase: 'pendiente' },
  CONECTADO: { texto: 'Conectado', clase: 'aprobada' },
};

/** Fechas comerciales de referencia para el calendario (mes 1-12, día). Las variables se calculan. */
export function fechasClave(anio: number): Array<{ fecha: string; nombre: string }> {
  const f = (m: number, d: number) => `${anio}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const nDomingo = (mes: number, n: number) => {
    const d = new Date(Date.UTC(anio, mes - 1, 1));
    const primero = (7 - d.getUTCDay()) % 7 + 1;
    return f(mes, primero + (n - 1) * 7);
  };
  const viernesNegro = (() => {
    const d = new Date(Date.UTC(anio, 10, 1));
    const primerJueves = ((4 - d.getUTCDay() + 7) % 7) + 1;
    return f(11, primerJueves + 21 + 1);
  })();
  return [
    { fecha: f(1, 1), nombre: 'Año Nuevo' },
    { fecha: f(2, 14), nombre: 'San Valentín' },
    { fecha: f(3, 8), nombre: 'Día de la Mujer' },
    { fecha: nDomingo(5, 2), nombre: 'Día de la Madre' },
    { fecha: nDomingo(6, 3), nombre: 'Día del Padre' },
    { fecha: f(8, 10), nombre: 'Primer Grito de Independencia' },
    { fecha: f(10, 31), nombre: 'Halloween' },
    { fecha: viernesNegro, nombre: 'Black Friday' },
    { fecha: f(12, 24), nombre: 'Nochebuena' },
    { fecha: f(12, 31), nombre: 'Fin de año' },
  ];
}
