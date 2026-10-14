import type { CanalLead } from './lead-triage.util';

// Atribución y servicio de un lead que llega desde una landing (2026-10-08).
// Son funciones puras: la atribución decide el CANAL con lo que el sitio mande
// (UTM, gclid, fbclid, li_fat_id) y la sugerencia de servicios solo PRESELECCIONA
// en el diálogo de convertir; nunca se aplica sola.

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export interface Atribucion {
  utm_source?: string | null;
  utm_medium?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  li_fat_id?: string | null;
}

const lleno = (v: string | null | undefined) => !!(v ?? '').toString().trim();

// Un identificador de clic es la prueba más fuerte; si no hay, se mira el
// utm_source que el anuncio tenga configurado; sin nada es el formulario web
// común (visita directa, búsqueda orgánica, enlace en redes sin etiquetar).
export function atribuirCanal(a: Atribucion): CanalLead {
  if (lleno(a.gclid)) return 'GOOGLE_ADS';
  if (lleno(a.fbclid)) return 'META_ADS';
  if (lleno(a.li_fat_id)) return 'LINKEDIN_ADS';
  const fuente = sinTildes((a.utm_source ?? '').toString());
  const medio = sinTildes((a.utm_medium ?? '').toString());
  const pagado = ['cpc', 'ppc', 'paid', 'paidsocial', 'paid_social', 'display'].some(
    (m) => medio.includes(m),
  );
  if (fuente.includes('google') && (pagado || medio === '')) return 'GOOGLE_ADS';
  if (['facebook', 'instagram', 'meta', 'fb', 'ig'].includes(fuente)) return 'META_ADS';
  if (fuente.includes('linkedin')) return 'LINKEDIN_ADS';
  return 'WEB_FORM';
}

// Qué palabras del campo «servicio» de una landing apuntan a qué servicio del
// catálogo de la empresa (por nombre exacto, sin tildes ni mayúsculas).
const REGLAS_SERVICIO: { palabras: string[]; servicio: string }[] = [
  { palabras: ['alarma'], servicio: 'Monitoreo de Alarmas' },
  { palabras: ['video', 'camara'], servicio: 'Monitoreo de Cámaras' },
  { palabras: ['vehiculo', 'flota', 'bienes muebles', 'carga'], servicio: 'Monitoreo de Vehículos' },
  { palabras: ['persona', 'guardias en linea', 'personal'], servicio: 'Monitoreo de Personal' },
  { palabras: ['cableado'], servicio: 'Cableado Estructurado' },
  { palabras: ['control de acceso'], servicio: 'Control de Accesos' },
  { palabras: ['incendio'], servicio: 'Detección de Incendios' },
  { palabras: ['cerco electrico'], servicio: 'Cerco Eléctrico' },
  { palabras: ['custodia'], servicio: 'Custodia de Mercadería en Movimiento' },
  { palabras: ['agentes de seguridad', 'guardia de seguridad'], servicio: 'Agentes de Seguridad' },
];

// "Varios servicios" no apunta a ninguno: devuelve [].
export function sugerirServicios(
  texto: string | null | undefined,
  catalogo: { id: number; name: string }[],
): number[] {
  const t = sinTildes(texto ?? '');
  if (!t || t.includes('varios')) return [];
  const ids = new Set<number>();
  for (const regla of REGLAS_SERVICIO) {
    if (!regla.palabras.some((p) => t.includes(p))) continue;
    const meta = sinTildes(regla.servicio);
    const s = catalogo.find((c) => sinTildes(c.name) === meta);
    if (s) ids.add(s.id);
  }
  // El nombre completo de un servicio también cuenta.
  for (const c of catalogo) {
    if (t.includes(sinTildes(c.name))) ids.add(c.id);
  }
  return [...ids];
}

// Campos de atribución que el sitio puede mandar (todos opcionales). Se
// guardan en `SalesLead.extra`. Devuelve solo los que traen valor.
export const CAMPOS_ATRIBUCION = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'li_fat_id',
] as const;

export function extraerAtribucion(body: Record<string, unknown> | null | undefined) {
  const salida: Record<string, string> = {};
  for (const k of CAMPOS_ATRIBUCION) {
    const v = (body?.[k] ?? '').toString().trim();
    if (v) salida[k] = v.slice(0, 300);
  }
  return salida;
}
