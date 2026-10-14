// Clasificación de un contacto entrante. A la web también escriben postulantes,
// proveedores y spam, no solo prospectos de servicio. La sugerencia por palabras
// clave ayuda a la persona que clasifica, pero NUNCA se aplica sola: siempre la
// confirma alguien (un error aquí descartaría o convertiría a quien no debía).

export const MOTIVOS_CONTACTO = [
  'SERVICIO',
  'EMPLEO',
  'PROVEEDOR',
  'OTRO',
  'SPAM',
] as const;
export type MotivoContacto = (typeof MOTIVOS_CONTACTO)[number];

export const ETIQUETA_MOTIVO_CONTACTO: Record<MotivoContacto, string> = {
  SERVICIO: 'Servicio',
  EMPLEO: 'Empleo',
  PROVEEDOR: 'Proveedor',
  OTRO: 'Otro',
  SPAM: 'Spam',
};

// Canales de entrada.
export const CANALES_LEAD = [
  'WEB_FORM',
  'GOOGLE_ADS',
  'META_ADS',
  'LINKEDIN_ADS',
  'EMAIL',
  'MANUAL',
] as const;
export type CanalLead = (typeof CANALES_LEAD)[number];

export const ETIQUETA_CANAL: Record<CanalLead, string> = {
  WEB_FORM: 'Formulario web',
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta Ads',
  LINKEDIN_ADS: 'LinkedIn Ads',
  EMAIL: 'Correo',
  MANUAL: 'Ingreso manual',
};

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Palabras (sin tildes). Se busca como texto contenido; "trabaj" cubre trabajo,
// trabajar, trabajadores, etc.
const EMPLEO = [
  'vacante',
  'empleo',
  'hoja de vida',
  'curriculum',
  'postul',
  'busco trabajo',
  'buscando trabajo',
  'oferta laboral',
  'quiero trabajar',
  'trabajar con ustedes',
  'trabajar en',
  'cv ',
  ' cv',
];
const PROVEEDOR = [
  'proveedor',
  'ofrecemos',
  'les ofrezco',
  'les ofrecemos',
  'catalogo',
  'alianza comercial',
  'distribuidor',
  'nuestros productos',
  'nuestros servicios de',
];
const SERVICIO = [
  'cotiz',
  'presupuesto',
  'guardia',
  'seguridad',
  'monitoreo',
  'camara',
  'alarma',
  'custodia',
  'vigilancia',
  'contratar',
  'necesito',
  'requiero',
  'servicio de',
];
const SPAM = ['http://', 'https://', 'www.', 'bitcoin', 'casino', 'crypto', 'seo '];

// Devuelve el motivo más probable o null si no hay indicios claros.
export function sugerirMotivoContacto(texto: string): MotivoContacto | null {
  const t = ` ${sinTildes(texto || '')} `;
  const cuenta = (palabras: string[]) =>
    palabras.filter((p) => t.includes(p)).length;
  const puntaje: [MotivoContacto, number][] = [
    ['EMPLEO', cuenta(EMPLEO)],
    ['PROVEEDOR', cuenta(PROVEEDOR)],
    ['SERVICIO', cuenta(SERVICIO)],
    ['SPAM', cuenta(SPAM)],
  ];
  // El empleo gana a "servicio" cuando ambos aparecen: "quiero trabajar en
  // seguridad" menciona seguridad pero es una postulación.
  const mejor = puntaje.sort((a, b) => b[1] - a[1])[0];
  if (mejor[1] === 0) return null;
  const empleo = puntaje.find((p) => p[0] === 'EMPLEO')![1];
  if (empleo > 0 && empleo >= (puntaje.find((p) => p[0] === 'SERVICIO')![1] ?? 0)) {
    return 'EMPLEO';
  }
  return mejor[0];
}

// Solo los dígitos, y los últimos 9 (el número sin código de país ni el cero
// inicial), para comparar "+593 99 123 4567" con "099 123 4567".
export function normalizarTelefono(raw: string | null | undefined): string {
  const d = (raw || '').replace(/\D/g, '');
  return d.length > 9 ? d.slice(-9) : d;
}

export const normalizarCorreo = (raw: string | null | undefined): string =>
  (raw || '').trim().toLowerCase();
