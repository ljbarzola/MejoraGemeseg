// Datos que mandan las landings de gemeseg.com/landing/<slug>/ (2026-10-14).
// Funciones puras: el webhook las usa para guardar el servicio, la línea
// comercial, la situación y el consentimiento del contacto. Reemplazan lo que
// llevaba la hoja «CRM Comercial 2026» (pestañas Landings y Leads).

export interface LandingDef {
  slug: string;
  // Nombre EXACTO del servicio en el catálogo de la empresa (así el diálogo de
  // convertir lo preselecciona).
  servicio: string;
  // Agrupación comercial libre (en Gemeseg: Seguridad Física, Solutech o Monitoreo).
  linea: string;
}

// Tabla de landings de Gemeseg. Ya NO es un valor por defecto de todas las empresas:
// cada una tiene la suya (Ventas → Configuración, `SalesSetting` clave 'landings') y
// una empresa nueva empieza sin ninguna. Esta lista solo sirve para copiarla, una
// vez, a las empresas que ya usaban Ventas antes de que existiera la configuración
// (`VentasSchemaService.sembrarLandingsDeEmpresasExistentes`).
export const LANDINGS: LandingDef[] = [
  { slug: 'agentes-de-seguridad', servicio: 'Agentes de Seguridad', linea: 'Seguridad Física' },
  { slug: 'custodia-de-mercaderia', servicio: 'Custodia de Mercadería en Movimiento', linea: 'Seguridad Física' },
  { slug: 'seguridad-vip', servicio: 'Seguridad VIP', linea: 'Seguridad Física' },
  { slug: 'cableado-estructurado', servicio: 'Cableado Estructurado', linea: 'Solutech' },
  { slug: 'camaras-ia', servicio: 'Cámaras de Seguridad con IA', linea: 'Solutech' },
  { slug: 'cerco-electrico', servicio: 'Cerco Eléctrico', linea: 'Solutech' },
  { slug: 'control-accesos', servicio: 'Control de Accesos', linea: 'Solutech' },
  { slug: 'deteccion-incendios', servicio: 'Detección de Incendios', linea: 'Solutech' },
  { slug: 'monitoreo-alarmas', servicio: 'Monitoreo de Alarmas', linea: 'Monitoreo' },
  { slug: 'monitoreo-camaras', servicio: 'Monitoreo de Cámaras', linea: 'Monitoreo' },
  { slug: 'monitoreo-personal', servicio: 'Monitoreo de Personal', linea: 'Monitoreo' },
  { slug: 'monitoreo-vehiculos', servicio: 'Monitoreo de Vehículos', linea: 'Monitoreo' },
];

// Solo letras minúsculas, números y guiones: es lo único que lleva un slug.
export const limpiarSlug = (raw: unknown): string =>
  (raw ?? '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 80);

export const landingDe = (
  slug: string,
  landings: LandingDef[] = LANDINGS,
): LandingDef | undefined => landings.find((l) => l.slug === slug);

// La casilla de la landing manda un texto (p. ej. «Sí (Política 2026-10)») si
// está marcada y nada si no. «No consta» es lo honesto cuando no llega: no se
// afirma un «No» que nadie escribió.
export function normalizarConsentimiento(raw: unknown): {
  consentimiento: 'SI' | 'NO_CONSTA';
  politica?: string;
} {
  const t = (raw ?? '').toString().trim();
  if (!t || /^(no|false|0|off)$/i.test(t)) return { consentimiento: 'NO_CONSTA' };
  const version = /\(([^)]+)\)/.exec(t)?.[1]?.trim();
  return version
    ? { consentimiento: 'SI', politica: version.slice(0, 80) }
    : { consentimiento: 'SI' };
}

const texto = (v: unknown, max: number): string | undefined => {
  const t = (v ?? '').toString().trim();
  return t ? t.slice(0, max) : undefined;
};

export interface DatosLanding {
  extra: Record<string, string>;
  // Mensaje del lead: la situación que eligió (si la hay) y lo que escribió.
  message: string | undefined;
}

// Todo lo propio de una landing, listo para `SalesLead.extra`.
export function datosDeLanding(
  body: Record<string, unknown> | null | undefined,
  landings: LandingDef[] = LANDINGS,
): DatosLanding {
  const slug = limpiarSlug(body?.landing);
  const conocida = slug ? landingDe(slug, landings) : undefined;
  const extra: Record<string, string> = {};
  if (slug) extra.landing = slug;
  // El servicio sale de la tabla de landings; solo si no es una conocida se
  // usa el texto del formulario antiguo (landing de monitoreo con «servicio»).
  const servicio = conocida?.servicio ?? texto(body?.servicio, 120);
  if (servicio) extra.servicio = servicio;
  if (conocida) extra.lineaComercial = conocida.linea;
  const pageUrl = texto(body?.pageUrl, 300);
  if (pageUrl) extra.pageUrl = pageUrl;
  // El formulario la llama `necesidad`; el plugin de WordPress la reenvía como `tipo`.
  const necesidad = texto(body?.necesidad ?? body?.tipo, 200);
  if (necesidad) extra.necesidad = necesidad;
  const consentimiento = normalizarConsentimiento(body?.consentimiento);
  extra.consentimiento = consentimiento.consentimiento;
  if (consentimiento.politica) extra.politica = consentimiento.politica;
  const mensaje = texto(body?.message ?? body?.mensaje, 2000);
  const message = [necesidad && `Situación: ${necesidad}`, mensaje].filter(Boolean).join('\n');
  return { extra, message: message || undefined };
}
