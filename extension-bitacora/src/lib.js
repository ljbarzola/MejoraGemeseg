// Lógica pura de la extensión (sin chrome.*), para poder probarla con `npm test`.
// Debe coincidir con las reglas del servidor (backend/src/modules/bitacora/bitacora-extension.util.ts):
// el servidor vuelve a comprobar todo y descarta lo que no cumpla.

export const IDLE_SEGUNDOS = 180;
export const TRAMO_MAXIMO_MINUTOS = 10;
export const CONFIG_CADUCA_MS = 24 * 3_600_000;
export const MAX_MUESTRAS = 3000;

const MIN = 60_000;

/**
 * Solo el dominio, nunca la dirección completa. Devuelve null si no parece un dominio
 * de internet (direcciones IP, «localhost», páginas internas del navegador...).
 */
export function normalizarDominio(host) {
  if (typeof host !== 'string') return null;
  let d = host.trim().toLowerCase().replace(/\.$/, '');
  if (d.startsWith('www.')) d = d.slice(4);
  if (d.length < 3 || d.length > 100) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null;
  if (/^\d+$/.test(d.slice(d.lastIndexOf('.') + 1))) return null;
  return d;
}

/** Dominio de una dirección http(s); null para cualquier otra cosa (chrome://, file://, about:blank...). */
export function dominioDeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return normalizarDominio(u.hostname);
  } catch {
    return null;
  }
}

export const RUTA_MAXIMA = 120;
export const TITULO_MAXIMO = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Este tramo de la ruta parece un código o un dato personal (y no una pantalla)? Igual que el servidor. */
function pareceCodigo(segmento) {
  if (UUID_RE.test(segmento)) return true;
  if (/^\d{5,}$/.test(segmento)) return true;
  if (/@|%40/.test(segmento)) return true;
  if (segmento.length >= 10 && /\d/.test(segmento) && /[a-z]/i.test(segmento)) return true;
  return segmento.length >= 20 && /^[A-Za-z0-9_-]+$/.test(segmento);
}

/**
 * Solo la ruta de una dirección, sin «?» ni «#» y con los códigos largos cambiados por «:id»:
 * «https://app.com/ventas/oportunidades/12345?x=1» → «/ventas/oportunidades/:id». Null si no hay ruta útil.
 */
export function rutaDeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const segmentos = u.pathname
      .split('/')
      .filter((s) => s.length > 0)
      .map((s) => (pareceCodigo(s) ? ':id' : s.toLowerCase()));
    if (segmentos.length === 0) return null;
    return `/${segmentos.join('/')}`.slice(0, RUTA_MAXIMA);
  } catch {
    return null;
  }
}

/** Título de la pestaña, corto: sin el contador del inicio «(3) », sin correos ni números largos. Null si queda vacío. */
export function tituloLimpio(titulo) {
  if (typeof titulo !== 'string') return null;
  let t = titulo.replace(/[\x00-\x1f\x7f]/g, ' ');
  t = t.replace(/^\(\d+\)\s*/, '');
  t = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '…');
  t = t.replace(/\d{7,}/g, '…');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > TITULO_MAXIMO ? `${t.slice(0, TITULO_MAXIMO - 1)}…` : t;
}

/** ¿Es un sitio donde se guarda SOLO el dominio? `lista` viene del servidor (por defecto + la de la empresa). */
export function esSitioSensible(dominio, lista) {
  const d = String(dominio).toLowerCase();
  if (/(^|[.-])banco|bank/.test(d)) return true;
  return (lista ?? []).some((s) => d === s || d.endsWith(`.${s}`));
}

const DIAS_INGLES ={ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Día de la semana (1 = lunes ... 7 = domingo) y minutos desde las 00:00 en la zona del horario. */
export function reloj(ms, zona) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value ?? '';
  return {
    dia: DIAS_INGLES[valor('weekday')] ?? 0,
    minutos: Number(valor('hour')) * 60 + Number(valor('minute')),
  };
}

function aMinutos(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/** ¿Ese instante cae dentro del horario? El minuto de fin ya no cuenta. */
export function dentroDelHorario(horario, ms) {
  if (!horario) return false;
  const { dia, minutos } = reloj(ms, horario.zona || 'America/Guayaquil');
  return horario.dias.includes(dia) && minutos >= aMinutos(horario.inicio) && minutos < aMinutos(horario.fin);
}

/**
 * Por qué NO se registra ahora, o null si toca registrar. Se revisa en este orden y, ante
 * cualquier duda (sin vincular, sin configuración reciente, hoja apagada, fuera de horario),
 * no se registra. Única excepción fuera del horario: la persona pulsó «Empezar tiempo extra»
 * en app.gemeseg (`config.extra`); el servidor sigue comprobando que el tramo caiga en esa ventana.
 */
export function motivoDePausa({ token, config, ahoraMs }) {
  if (!token) return 'sin-vincular';
  if (!config || ahoraMs - config.obtenidaEn > CONFIG_CADUCA_MS) return 'sin-configuracion';
  if (!config.registrando) return 'hoja-inactiva';
  if (!config.horario) return 'sin-horario';
  if (!dentroDelHorario(config.horario, ahoraMs) && !config.extra) return 'fuera-de-horario';
  return null;
}

/**
 * Junta muestras de un minuto ({ d: dominio, t: minuto en ms }) en tramos
 * { dominio, inicio, minutos }: minutos seguidos en el mismo sitio, de a 10 como máximo.
 */
export function colapsarMuestras(muestras) {
  const orden = [...muestras].sort((a, b) => a.t - b.t);
  const tramos = [];
  let actual = null;
  for (const m of orden) {
    if (actual && actual.dominio === m.d && (actual.ruta ?? null) === (m.r ?? null) && m.t - actual.ultimo <= MIN * 1.5 && actual.minutos < TRAMO_MAXIMO_MINUTOS) {
      if (m.t !== actual.ultimo) {
        actual.minutos++;
        actual.ultimo = m.t;
      }
    } else {
      if (actual) tramos.push(actual);
      actual = { dominio: m.d, ruta: m.r ?? null, titulo: m.ti ?? null, inicioMs: m.t, ultimo: m.t, minutos: 1 };
    }
  }
  if (actual) tramos.push(actual);
  return tramos.map((t) => ({
    dominio: t.dominio,
    inicio: new Date(t.inicioMs).toISOString(),
    minutos: t.minutos,
    // Solo si hay: en sitios sensibles no se envía nada más que el dominio.
    ...(t.ruta ? { ruta: t.ruta } : {}),
    ...(t.titulo ? { titulo: t.titulo } : {}),
  }));
}

const NOMBRE_DIAS = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** «lun a vie, 08:00 a 17:00» o «lun, mié y vie, 08:00 a 17:00». */
export function textoHorario(horario) {
  if (!horario) return 'sin horario';
  const dias = [...horario.dias].sort((a, b) => a - b);
  const seguidos = dias.length > 2 && dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  const nombres = dias.map((d) => NOMBRE_DIAS[d]);
  const texto = seguidos
    ? `${nombres[0]} a ${nombres[nombres.length - 1]}`
    : nombres.length > 1
      ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
      : nombres[0];
  return `${texto}, ${horario.inicio} a ${horario.fin}`;
}

export const MOTIVOS = {
  'sin-vincular': 'Sin vincular',
  'sin-configuracion': 'Sin conexión reciente con app.gemeseg',
  'hoja-inactiva': 'Tu hoja del día no está activa',
  'sin-horario': 'La empresa aún no definió un horario',
  'fuera-de-horario': 'Fuera del horario',
  inactivo: 'Sin actividad en el equipo',
  'navegador-en-segundo-plano': 'El navegador no está al frente',
  privada: 'Ventana privada (no se registra)',
  'sin-dominio': 'Página interna o sin dominio (no se registra)',
};

/** «Edge en Windows», para que la persona reconozca el equipo en «Mi hoja del día». */
export function nombreEquipo(userAgent) {
  const navegador = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : 'Navegador';
  const sistema = /Windows/.test(userAgent) ? 'Windows' : /Mac OS X/.test(userAgent) ? 'Mac' : /Linux/.test(userAgent) ? 'Linux' : '';
  return sistema ? `${navegador} en ${sistema}` : navegador;
}
