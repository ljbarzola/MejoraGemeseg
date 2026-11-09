import { atribuirCanal } from './lead-atribucion.util';

// Fases de marketing de un contacto, tal como las usa quien maneja Google Ads
// (panel «Embudo de conversión de clientes potenciales»):
//
//   Interacciones     entraron a la página (solo lo ve Google, no el CRM)
//   Sin procesar      llenaron el formulario; si nadie les contesta o no
//                     cotizan, no pasan a la siguiente fase
//   Cualificado       el equipo lo puso En evaluación (o más adelante)
//   Convertido        contrataron
//
// No se guardan: se calculan con la oportunidad, así nadie las marca a mano y
// siempre coinciden con las etapas. «Cualificado» (desde 2026-10-27, antes era
// «cotizó») incluye lo que sigue después de la evaluación (Cotizada, En
// negociación) y también una oportunidad que se perdió después de evaluarse.
export type FaseMarketing = 'SIN_PROCESAR' | 'CUALIFICADO' | 'CONVERTIDO';

export const ETIQUETA_FASE_MARKETING: Record<FaseMarketing, string> = {
  SIN_PROCESAR: 'Sin procesar',
  CUALIFICADO: 'Cualificado (en evaluación)',
  CONVERTIDO: 'Convertido (contrató)',
};

// Etapas de la oportunidad en las que ya hubo cotización.
export const ETAPAS_COTIZADAS = ['COTIZADO', 'NEGOCIACION'];

// Etapas de fábrica desde las que el contacto cuenta como cualificado: En evaluación y todo lo que sigue.
export const ETAPAS_CUALIFICADAS = ['LEIDO', ...ETAPAS_COTIZADAS];

// Claves que cuentan como cualificado en UNA empresa (2026-10-27). Las empresas crean etapas propias (la de
// Gemeseg tiene «PROPUESTA_ENVIADA») y una clave que el código no conoce no puede quedar fuera del embudo:
// toda etapa intermedia (ni la inicial ni una final) significa que alguien ya trabaja el contacto, y se suma
// a las de fábrica. Las finales no cuentan: Aceptada ya es «convertido» y Perdida no avisa nada por sí sola.
export function clavesCualificadas(
  etapas: { key: string; isInitial: boolean; isFinal: boolean }[],
): string[] {
  return [
    ...new Set([
      ...ETAPAS_CUALIFICADAS,
      ...etapas.filter((e) => !e.isInitial && !e.isFinal).map((e) => e.key),
    ]),
  ];
}

export interface OportunidadParaFase {
  outcome: string | null;
  status: string | null;
  quotedAt: Date | null;
  // Etapas por las que pasó (toStatus de sus cambios de etapa).
  etapasAlcanzadas?: string[];
}

export function faseMarketing(
  o: OportunidadParaFase,
  cualificadas: string[] = ETAPAS_CUALIFICADAS,
): FaseMarketing {
  if (o.outcome === 'GANADA') return 'CONVERTIDO';
  const cualifico =
    o.quotedAt !== null ||
    (o.status !== null && cualificadas.includes(o.status)) ||
    (o.etapasAlcanzadas ?? []).some((k) => cualificadas.includes(k));
  return cualifico ? 'CUALIFICADO' : 'SIN_PROCESAR';
}

const ORDEN: Record<FaseMarketing, number> = {
  SIN_PROCESAR: 0,
  CUALIFICADO: 1,
  CONVERTIDO: 2,
};

// ---------------------------------------------------------------------------
// Embudo único del Dashboard de marketing (2026-11-06)
// ---------------------------------------------------------------------------
// UN solo embudo para todo lo que llega: quien llenó el formulario y quien escribió por WhatsApp desde una landing
// con su código (una persona cuenta una sola vez). Los clics del botón de WhatsApp van aparte, como columna y como
// una línea bajo el embudo: un clic NO es un contacto hasta que la persona escribe (guía de medición, §12).
// A quien llegó por un clic se le atribuye el canal, la campaña, la landing y el servicio DEL CLIC, no «WhatsApp»
// (guía §11: la fuente se mantiene durante todo el proceso comercial).

// Etapas en las que ya hubo cotización (la guía de medición separa «calificado» de «cotización enviada»). Incluye
// «Propuesta enviada», la etapa propia que Gemeseg agregó entre En evaluación y En negociación.
export const ETAPAS_DE_COTIZACION = [...ETAPAS_COTIZADAS, 'PROPUESTA_ENVIADA'];

// ¿La oportunidad llegó a cotizarse? Tiene fecha de cotización, está o pasó por una etapa de cotización, o ya se
// aceptó (una venta siempre pasó por una cotización, aunque nadie llenara la fecha).
export function cotizoOportunidad(o: OportunidadParaFase): boolean {
  return (
    o.outcome === 'GANADA' ||
    o.quotedAt !== null ||
    (o.status !== null && ETAPAS_DE_COTIZACION.includes(o.status)) ||
    (o.etapasAlcanzadas ?? []).some((k) => ETAPAS_DE_COTIZACION.includes(k))
  );
}

export type AgruparEmbudo =
  | 'channel'
  | 'campana'
  | 'landing'
  | 'servicio'
  | 'grupo'
  | 'channel_servicio'
  | 'campana_servicio';
export const AGRUPACIONES_EMBUDO: AgruparEmbudo[] = [
  'channel',
  'campana',
  'landing',
  'servicio',
  'grupo',
  'channel_servicio',
  'campana_servicio',
];

// todos | whatsapp = quien llegó por el botón de una landing (con código) | otros = formulario y demás canales.
export type OrigenEmbudo = 'todos' | 'whatsapp' | 'otros';

interface Atributos {
  canal: string;
  campana: string | null;
  landing: string | null;
  servicio: string | null;
  grupo: string | null;
}

// Una persona que llegó en el periodo (un posible cliente) con la atribución que le toca.
export interface ContactoParaEmbudo extends Atributos {
  // Llegó por el botón de WhatsApp de una landing: su código quedó enlazado a un clic.
  porClic: boolean;
  // Fase de la oportunidad a la que pasó, o null si aún no pasó a ninguna.
  fase: FaseMarketing | null;
  // La oportunidad llegó a cotizarse (ver cotizoOportunidad).
  cotizo: boolean;
  // Monto cotizado de la oportunidad si se ganó; 0 en cualquier otro caso.
  vendido: number;
}

export interface ClicParaEmbudo extends Atributos {
  // El clic quedó enlazado a un posible cliente (la persona escribió y se anotó su código).
  escribio: boolean;
}

export interface FilaEmbudo {
  clave: string;
  // Solo en las agrupaciones de dos niveles (canal › servicio, campaña › servicio): el segundo nivel.
  subclave?: string;
  clics: number;
  contactos: number;
  cualificados: number;
  cotizaciones: number;
  convertidos: number;
  // Suma del monto cotizado de las oportunidades ganadas.
  vendido: number;
}

export interface TotalEmbudo extends FilaEmbudo {
  // Clics que terminaron en conversación, y contactos que llegaron por el botón de WhatsApp.
  escribieron: number;
  porWhatsapp: number;
  // % sobre el paso anterior (null si el anterior es 0).
  pctEscribieron: number | null;
  pctCualificados: number | null;
  pctCotizaciones: number | null;
  pctConvertidos: number | null;
}

export const SIN_DATO = 'Sin dato';

const pct = (parte: number, total: number) =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

const lleno = (v: string | null | undefined): string | null => {
  const t = (v ?? '').toString().trim();
  return !t || t.toLowerCase() === 'none' ? null : t;
};

// «monitoreo_vehiculos» y «Monitoreo vehiculos» son lo mismo: sin guiones bajos, con la primera en mayúscula.
export function textoDeServicio(v: string | null | undefined): string | null {
  const t = lleno(v);
  if (!t) return null;
  const limpio = t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const PALABRAS_VACIAS = ['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'y', 'en'];

// «Monitoreo de Vehículos» (el nombre de la tabla de landings) y «monitoreo_vehiculos» (el que manda el script de la
// landing) son el mismo servicio: se comparan sin tildes, mayúsculas, guiones bajos ni palabras como «de» o «para».
const claveDeNombre = (t: string) =>
  sinTildes(t)
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !PALABRAS_VACIAS.includes(w))
    .join(' ');

// Para cada nombre repetido deja el más completo (el más largo y, a igual largo, el que lleva tildes).
function etiquetasUnificadas(valores: (string | null | undefined)[]): (v: string | null | undefined) => string | null {
  const mejor = new Map<string, string>();
  // Una letra con tilde se descompone en dos al normalizar; sin tildes el largo no cambia.
  const tilde = (t: string) => t.normalize('NFD').length !== t.length;
  for (const v of valores) {
    const t = textoDeServicio(v);
    if (!t) continue;
    const k = claveDeNombre(t);
    const actual = mejor.get(k);
    if (!actual || t.length > actual.length || (t.length === actual.length && tilde(t) && !tilde(actual))) {
      mejor.set(k, t);
    }
  }
  return (v) => {
    const t = textoDeServicio(v);
    return t ? (mejor.get(claveDeNombre(t)) ?? t) : null;
  };
}

// Los contactos y clics con el servicio y el grupo ya unificados (la lista del filtro y la tabla usan los mismos).
function conNombresUnificados<A extends Atributos, B extends Atributos>(cs: A[], ks: B[]): { cs: A[]; ks: B[] } {
  const todos = [...cs, ...ks];
  const servicio = etiquetasUnificadas(todos.map((x) => x.servicio));
  const grupo = etiquetasUnificadas(todos.map((x) => x.grupo));
  const unir = <T extends Atributos>(x: T): T => ({ ...x, servicio: servicio(x.servicio), grupo: grupo(x.grupo) });
  return { cs: cs.map(unir), ks: ks.map(unir) };
}

// El clic guarda la ruta («/landing/monitoreo-vehiculos/») y el formulario solo el nombre
// («monitoreo-vehiculos»): las dos se comparan por el último tramo.
export function landingLimpia(v: string | null | undefined): string | null {
  const t = lleno(v);
  if (!t) return null;
  const ruta = t.split(/[?#]/)[0].replace(/\/+$/, '');
  return ruta.split('/').filter(Boolean).pop() ?? null;
}

// El canal de un clic sale con la misma regla que el de un formulario (gclid, fbclid, utm). Sin anuncio detrás
// (visita directa, búsqueda orgánica) el contacto es de «WhatsApp», no de «Formulario web».
export function canalDeClic(c: {
  utmSource: string | null;
  utmMedium: string | null;
  gclid?: string | null;
  fbclid?: string | null;
}): string {
  const canal = atribuirCanal({
    utm_source: c.utmSource,
    utm_medium: c.utmMedium,
    gclid: c.gclid,
    fbclid: c.fbclid,
  });
  return canal === 'WEB_FORM' ? 'WHATSAPP' : canal;
}

type Dimension = 'channel' | 'campana' | 'landing' | 'servicio' | 'grupo';
const NIVELES: Record<AgruparEmbudo, Dimension[]> = {
  channel: ['channel'],
  campana: ['campana'],
  landing: ['landing'],
  servicio: ['servicio'],
  grupo: ['grupo'],
  channel_servicio: ['channel', 'servicio'],
  campana_servicio: ['campana', 'servicio'],
};

const valorDe = (x: Atributos, d: Dimension): string => {
  switch (d) {
    case 'channel':
      return lleno(x.canal) ?? SIN_DATO;
    case 'campana':
      return lleno(x.campana) ?? SIN_DATO;
    case 'landing':
      return landingLimpia(x.landing) ?? SIN_DATO;
    case 'servicio':
      return textoDeServicio(x.servicio) ?? SIN_DATO;
    case 'grupo':
      return textoDeServicio(x.grupo) ?? SIN_DATO;
  }
};

const metricas = (cs: ContactoParaEmbudo[], ks: ClicParaEmbudo[]) => ({
  clics: ks.length,
  contactos: cs.length,
  cualificados: cs.filter((c) => c.fase && ORDEN[c.fase] >= 1).length,
  cotizaciones: cs.filter((c) => c.cotizo).length,
  convertidos: cs.filter((c) => c.fase && ORDEN[c.fase] >= 2).length,
  vendido: Math.round(cs.reduce((suma, c) => suma + c.vendido, 0) * 100) / 100,
});

// Servicios que aparecen en los contactos y en los clics (para el filtro «Servicio»), con «Sin dato» al final.
export function serviciosDelEmbudo(contactos: Atributos[], clics: Atributos[]): string[] {
  const nombres = new Set<string>();
  let sinDato = false;
  const u = conNombresUnificados(contactos, clics);
  for (const x of [...u.cs, ...u.ks]) {
    const s = textoDeServicio(x.servicio);
    if (s) nombres.add(s);
    else sinDato = true;
  }
  const lista = [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
  return sinDato ? [...lista, SIN_DATO] : lista;
}

export function embudoUnico(
  contactos: ContactoParaEmbudo[],
  clics: ClicParaEmbudo[],
  agrupar: AgruparEmbudo,
  filtros: { origen: OrigenEmbudo; servicio: string | null },
): { total: TotalEmbudo; filas: FilaEmbudo[] } {
  // Los nombres se unifican con TODO lo del periodo, antes de filtrar: así el filtro de servicio y la tabla coinciden.
  const unido = conNombresUnificados(contactos, clics);
  let cs = unido.cs;
  let ks = unido.ks;
  if (filtros.origen === 'whatsapp') {
    cs = cs.filter((c) => c.porClic);
  } else if (filtros.origen === 'otros') {
    // Un clic siempre es del botón de WhatsApp: no entra en «formulario y otros».
    cs = cs.filter((c) => !c.porClic);
    ks = [];
  }
  if (filtros.servicio) {
    const s = filtros.servicio;
    const delServicio = (x: Atributos) => (textoDeServicio(x.servicio) ?? SIN_DATO) === s;
    cs = cs.filter(delServicio);
    ks = ks.filter(delServicio);
  }

  const niveles = NIVELES[agrupar];
  const SEP = '\u0001';
  const grupos = new Map<string, { cs: ContactoParaEmbudo[]; ks: ClicParaEmbudo[] }>();
  const grupo = (x: Atributos) => {
    const k = niveles.map((d) => valorDe(x, d)).join(SEP);
    let g = grupos.get(k);
    if (!g) {
      g = { cs: [], ks: [] };
      grupos.set(k, g);
    }
    return g;
  };
  for (const c of cs) grupo(c).cs.push(c);
  for (const k of ks) grupo(k).ks.push(k);

  const filas = [...grupos.entries()].map(([k, g]) => {
    const [clave, subclave] = k.split(SEP);
    const fila: FilaEmbudo = { clave, ...metricas(g.cs, g.ks) };
    if (subclave !== undefined) fila.subclave = subclave;
    return fila;
  });
  // Lo más grande primero; con dos niveles, las filas del mismo primer nivel quedan juntas.
  const pesoDe = new Map<string, { contactos: number; clics: number }>();
  for (const f of filas) {
    const p = pesoDe.get(f.clave) ?? { contactos: 0, clics: 0 };
    p.contactos += f.contactos;
    p.clics += f.clics;
    pesoDe.set(f.clave, p);
  }
  filas.sort((a, b) => {
    const pa = pesoDe.get(a.clave)!;
    const pb = pesoDe.get(b.clave)!;
    return (
      pb.contactos - pa.contactos ||
      pb.clics - pa.clics ||
      a.clave.localeCompare(b.clave, 'es') ||
      b.contactos - a.contactos ||
      b.clics - a.clics ||
      (a.subclave ?? '').localeCompare(b.subclave ?? '', 'es')
    );
  });

  const m = metricas(cs, ks);
  const escribieron = ks.filter((k) => k.escribio).length;
  const total: TotalEmbudo = {
    clave: 'Total',
    ...m,
    escribieron,
    porWhatsapp: cs.filter((c) => c.porClic).length,
    pctEscribieron: pct(escribieron, m.clics),
    pctCualificados: pct(m.cualificados, m.contactos),
    pctCotizaciones: pct(m.cotizaciones, m.cualificados),
    pctConvertidos: pct(m.convertidos, m.cotizaciones),
  };
  return { total, filas };
}
