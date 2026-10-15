// Registro único de los canales por los que entra un lead (2026-10-14).
//
// Antes cada canal estaba repetido en la atribución, la etiqueta, el formulario
// de «Nuevo lead» y el filtro de la bandeja. Ahora todo sale de aquí: para
// sumar un canal nuevo (p. ej. TikTok Ads) basta con agregar una entrada y la
// pantalla de Leads lo ofrece, lo filtra, lo cuenta y lo reconoce al llegar.
// El frontend lee esta lista de `GET /ventas/entrantes/canales`.

export type GrupoCanal = 'ANUNCIO' | 'WEB' | 'DIRECTO';

export interface CampoCanal {
  // `campaign` va a la columna de campaña del lead; cualquier otra clave se
  // guarda en `SalesLead.extra`.
  key: string;
  label: string;
  ayuda?: string;
}

export interface CanalDef {
  key: string;
  label: string;
  grupo: GrupoCanal;
  // Datos propios de este canal que se piden al ingresar un lead a mano.
  campos: CampoCanal[];
  // Valor de «Fuente» del cliente cuando el lead se convierte.
  fuenteCliente: 'REFERIDO' | 'CAMPANA' | 'OTRO';
  // Cómo se reconoce un lead que llega de la web: parámetro con el identificador
  // de clic del anuncio (el más fuerte) y valores de utm_source que lo delatan.
  clicId?: string;
  utmSources?: string[];
  // true: utm_source solo tiene que CONTENER el valor («google_search»);
  // false: tiene que ser igual (evita que «ig» coincida dentro de otra palabra).
  utmParcial?: boolean;
  // Solo cuenta por utm_source si el medio no dice que es tráfico orgánico:
  // «google / organic» es una búsqueda común, no un anuncio.
  utmExigeNoOrganico?: boolean;
}

export const CANALES_REGISTRO: CanalDef[] = [
  {
    key: 'GOOGLE_ADS',
    label: 'Google Ads',
    grupo: 'ANUNCIO',
    fuenteCliente: 'CAMPANA',
    clicId: 'gclid',
    utmSources: ['google'],
    utmParcial: true,
    utmExigeNoOrganico: true,
    campos: [
      { key: 'campaign', label: 'Campaña' },
      {
        key: 'gclid',
        label: 'Identificador de clic (gclid)',
        ayuda: 'Opcional. Con él Google puede saber qué lead terminó en venta.',
      },
    ],
  },
  {
    key: 'META_ADS',
    label: 'Meta Ads',
    grupo: 'ANUNCIO',
    fuenteCliente: 'CAMPANA',
    clicId: 'fbclid',
    utmSources: ['facebook', 'instagram', 'meta', 'fb', 'ig'],
    campos: [{ key: 'campaign', label: 'Campaña o formulario' }],
  },
  {
    key: 'LINKEDIN_ADS',
    label: 'LinkedIn Ads',
    grupo: 'ANUNCIO',
    fuenteCliente: 'CAMPANA',
    clicId: 'li_fat_id',
    utmSources: ['linkedin'],
    utmParcial: true,
    campos: [{ key: 'campaign', label: 'Campaña' }],
  },
  {
    key: 'WEB_FORM',
    label: 'Formulario web',
    grupo: 'WEB',
    fuenteCliente: 'OTRO',
    campos: [{ key: 'landing', label: 'Página o landing' }],
  },
  {
    key: 'REFERIDO',
    label: 'Referido',
    grupo: 'DIRECTO',
    fuenteCliente: 'REFERIDO',
    campos: [{ key: 'referidoPor', label: 'Quién lo refirió' }],
  },
  {
    key: 'WHATSAPP',
    label: 'WhatsApp',
    grupo: 'DIRECTO',
    fuenteCliente: 'OTRO',
    campos: [],
  },
  {
    key: 'TELEFONO',
    label: 'Llamada',
    grupo: 'DIRECTO',
    fuenteCliente: 'OTRO',
    campos: [],
  },
  {
    key: 'EMAIL',
    label: 'Correo',
    grupo: 'DIRECTO',
    fuenteCliente: 'OTRO',
    campos: [],
  },
  {
    key: 'MANUAL',
    label: 'Ingreso manual',
    grupo: 'DIRECTO',
    fuenteCliente: 'OTRO',
    campos: [],
  },
];

export const CANALES_LEAD = CANALES_REGISTRO.map((c) => c.key);
export type CanalLead = string;

export const ETIQUETA_CANAL: Record<string, string> = Object.fromEntries(
  CANALES_REGISTRO.map((c) => [c.key, c.label]),
);

export const canalDef = (key: string | null | undefined): CanalDef | undefined =>
  CANALES_REGISTRO.find((c) => c.key === key);

// Identificadores de clic que algún canal usa (gclid, fbclid, li_fat_id...).
export const CLIC_IDS = CANALES_REGISTRO.flatMap((c) => (c.clicId ? [c.clicId] : []));
