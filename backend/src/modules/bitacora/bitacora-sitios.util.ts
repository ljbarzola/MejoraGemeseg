/**
 * Ruta y título de las páginas que reporta la extensión (2026-11-11). Lógica pura.
 *
 * Además del dominio, la bitácora guarda la RUTA limpia (sin lo que va después de «?» ni «#»,
 * y con los códigos largos reemplazados por «:id») y el TÍTULO de la pestaña. Estas reglas
 * deben coincidir con `extension-bitacora/src/lib.js`: la extensión limpia primero y el
 * servidor vuelve a limpiar, porque nunca se confía en lo que llega.
 *
 * En los «sitios sensibles» (bancos, correo web, salud, redes...) se guarda SOLO el dominio.
 */

export const RUTA_MAXIMA = 120;
export const TITULO_MAXIMO = 120;

/** Dominios donde solo se guarda el dominio. Cada empresa puede agregar los suyos. */
export const SITIOS_SENSIBLES_DEFECTO: string[] = [
  // Correo web
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'outlook.office365.com',
  'mail.yahoo.com',
  'proton.me',
  // Mensajería personal y redes
  'web.whatsapp.com',
  'web.telegram.org',
  'messenger.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  // Bancos y pagos (además de cualquier dominio que contenga «banco» o «bank»)
  'pichincha.com',
  'produbanco.com',
  'bolivariano.com',
  'paypal.com',
  // Salud y seguridad social
  'iess.gob.ec',
  'doctoralia.com',
  // Cuentas y calendario personal
  'accounts.google.com',
  'myaccount.google.com',
  'login.microsoftonline.com',
  'calendar.google.com',
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Este tramo de la ruta parece un código o dato personal (y no una pantalla)? */
function pareceCodigo(segmento: string): boolean {
  if (UUID_RE.test(segmento)) return true;
  if (/^\d{5,}$/.test(segmento)) return true;
  if (/@|%40/.test(segmento)) return true;
  // Mezcla de letras y números larga (p. ej. un identificador de documento).
  if (segmento.length >= 10 && /\d/.test(segmento) && /[a-z]/i.test(segmento)) {
    return true;
  }
  // Cadena larga sin separadores (un token).
  return segmento.length >= 20 && /^[A-Za-z0-9_-]+$/.test(segmento);
}

/**
 * Deja solo la ruta de una página, sin datos sensibles: «/ventas/oportunidades/12345?x=1#a» →
 * «/ventas/oportunidades/:id». Devuelve null si no hay ruta útil (la raíz del sitio o un valor inválido).
 */
export function rutaLimpia(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  let r = valor.trim();
  if (!r.startsWith('/')) return null;
  r = r.split(/[?#]/)[0];
  const segmentos = r
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => (pareceCodigo(s) ? ':id' : s.toLowerCase()));
  if (segmentos.length === 0) return null;
  let limpia = `/${segmentos.join('/')}`;
  if (limpia.length > RUTA_MAXIMA) limpia = limpia.slice(0, RUTA_MAXIMA);
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x1f]/.test(limpia) ? null : limpia;
}

/**
 * Título de la pestaña, corto y sin lo más delicado: se quitan los contadores del inicio («(3) »),
 * los correos y los números largos, y se recorta. Devuelve null si queda vacío.
 */
export function tituloLimpio(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  let t = valor.replace(/[\x00-\x1f\x7f]/g, ' ');
  t = t.replace(/^\(\d+\)\s*/, '');
  t = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '…');
  t = t.replace(/\d{7,}/g, '…');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > TITULO_MAXIMO ? `${t.slice(0, TITULO_MAXIMO - 1)}…` : t;
}

/** Normaliza lo que escribe un administrador: «https://www.Banco.com/x» → «banco.com». Null si no parece un dominio. */
export function dominioDeLista(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  let d = valor.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/\.$/, '');
  if (d.startsWith('www.')) d = d.slice(4);
  if (d.length < 3 || d.length > 100) return null;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
    d,
  )
    ? d
    : null;
}

/** ¿Este dominio es sensible (el propio de la lista o un subdominio suyo, o un banco)? */
export function esSitioSensible(
  dominio: string,
  extra: string[] = [],
): boolean {
  const d = dominio.toLowerCase();
  if (/(^|[.-])banco|bank/.test(d)) return true;
  return [...SITIOS_SENSIBLES_DEFECTO, ...extra].some(
    (s) => d === s || d.endsWith(`.${s}`),
  );
}
