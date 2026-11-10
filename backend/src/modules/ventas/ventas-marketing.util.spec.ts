import {
  canalDeClic,
  embudoUnico,
  faseMarketing,
  landingLimpia,
  serviciosDelEmbudo,
  textoDeServicio,
  type ClicParaEmbudo,
  type ContactoParaEmbudo,
} from './ventas-marketing.util';

const opp = (o: Partial<Parameters<typeof faseMarketing>[0]> = {}) => ({
  outcome: null,
  status: 'RECIBIDO',
  quotedAt: null,
  ...o,
});

describe('faseMarketing', () => {
  it('mientras nadie la evalúa está sin procesar', () => {
    expect(faseMarketing(opp())).toBe('SIN_PROCESAR');
  });

  it('desde En evaluación es cualificado, también cotizada y en negociación', () => {
    expect(faseMarketing(opp({ status: 'LEIDO' }))).toBe('CUALIFICADO');
    expect(faseMarketing(opp({ status: 'COTIZADO' }))).toBe('CUALIFICADO');
    expect(faseMarketing(opp({ status: 'NEGOCIACION' }))).toBe('CUALIFICADO');
  });

  it('una fecha de cotización basta para ser cualificado', () => {
    expect(faseMarketing(opp({ quotedAt: new Date('2026-10-01') }))).toBe('CUALIFICADO');
  });

  it('perdida después de evaluarse sigue siendo cualificado; perdida sin evaluarse no', () => {
    expect(
      faseMarketing(opp({ outcome: 'PERDIDA', status: 'RECHAZADO', etapasAlcanzadas: ['LEIDO', 'COTIZADO', 'RECHAZADO'] })),
    ).toBe('CUALIFICADO');
    expect(
      faseMarketing(opp({ outcome: 'PERDIDA', status: 'RECHAZADO', etapasAlcanzadas: ['LEIDO', 'RECHAZADO'] })),
    ).toBe('CUALIFICADO');
    expect(
      faseMarketing(opp({ outcome: 'PERDIDA', status: 'RECHAZADO', etapasAlcanzadas: ['RECHAZADO'] })),
    ).toBe('SIN_PROCESAR');
  });

  it('ganada es convertido', () => {
    expect(faseMarketing(opp({ outcome: 'GANADA', status: 'ACEPTADO' }))).toBe('CONVERTIDO');
  });
});

describe('textoDeServicio y landingLimpia', () => {
  it('deja el servicio legible y trata «none» como sin dato', () => {
    expect(textoDeServicio('monitoreo_vehiculos')).toBe('Monitoreo vehiculos');
    expect(textoDeServicio('  Agentes   de seguridad ')).toBe('Agentes de seguridad');
    expect(textoDeServicio('none')).toBeNull();
    expect(textoDeServicio(null)).toBeNull();
  });

  it('compara la landing del clic (ruta) con la del formulario (nombre) por su último tramo', () => {
    expect(landingLimpia('/landing/monitoreo-vehiculos/')).toBe('monitoreo-vehiculos');
    expect(landingLimpia('monitoreo-vehiculos')).toBe('monitoreo-vehiculos');
    expect(landingLimpia('https://gemeseg.com/landing/alarmas/?utm_source=x')).toBe('alarmas');
    expect(landingLimpia('')).toBeNull();
  });
});

describe('canalDeClic', () => {
  const clic = (o: Partial<Parameters<typeof canalDeClic>[0]>) => ({ utmSource: 'direct', utmMedium: 'none', ...o });

  it('usa la misma regla que el formulario: anuncio de Google, Meta o LinkedIn', () => {
    expect(canalDeClic(clic({ utmSource: 'google', utmMedium: 'cpc' }))).toBe('GOOGLE_ADS');
    expect(canalDeClic(clic({ fbclid: 'abc' }))).toBe('META_ADS');
    expect(canalDeClic(clic({ utmSource: 'linkedin', utmMedium: 'paid_social' }))).toBe('LINKEDIN_ADS');
  });

  it('sin anuncio detrás el contacto es de WhatsApp, no de «Formulario web»', () => {
    expect(canalDeClic(clic({}))).toBe('WHATSAPP');
    expect(canalDeClic(clic({ utmSource: 'google', utmMedium: 'organic' }))).toBe('WHATSAPP');
  });
});

describe('embudoUnico', () => {
  const contacto = (o: Partial<ContactoParaEmbudo> = {}): ContactoParaEmbudo => ({
    canal: 'WEB_FORM',
    campana: null,
    landing: null,
    servicio: null,
    grupo: null,
    porClic: false,
    fase: null,
    cotizo: false,
    vendido: 0,
    ...o,
  });
  const clic = (o: Partial<ClicParaEmbudo> = {}): ClicParaEmbudo => ({
    canal: 'GOOGLE_ADS',
    campana: 'monitoreo',
    landing: '/landing/monitoreo-vehiculos/',
    servicio: 'monitoreo_vehiculos',
    grupo: 'monitoreo',
    escribio: false,
    ...o,
  });
  const todos = { origen: 'todos' as const, servicio: null };

  // Dos personas llegaron por el botón de WhatsApp (una contrató), una por el formulario; hubo 4 clics.
  const contactos = [
    contacto({ canal: 'GOOGLE_ADS', servicio: 'monitoreo_vehiculos', grupo: 'monitoreo', porClic: true, fase: 'CONVERTIDO', cotizo: true, vendido: 1200 }),
    contacto({ canal: 'GOOGLE_ADS', servicio: 'monitoreo_vehiculos', grupo: 'monitoreo', porClic: true, fase: 'CUALIFICADO' }),
    contacto({ canal: 'WEB_FORM', servicio: 'Alarmas', fase: 'CUALIFICADO', cotizo: true }),
  ];
  const clics = [
    clic({ escribio: true }),
    clic({ escribio: true }),
    clic(),
    clic({ canal: 'META_ADS', servicio: 'camaras_ia', grupo: 'solutech' }),
  ];

  it('cuenta cada persona una sola vez y el clic aparte', () => {
    const { total } = embudoUnico(contactos, clics, 'channel', todos);
    expect(total).toMatchObject({ contactos: 3, clics: 4, cualificados: 3, cotizaciones: 2, convertidos: 1, vendido: 1200 });
    expect(total.porWhatsapp).toBe(2);
    expect(total.escribieron).toBe(2);
    expect(total.pctEscribieron).toBe(50);
    expect(total.pctCualificados).toBe(100);
    expect(total.pctCotizaciones).toBeCloseTo(66.7, 1);
    expect(total.pctConvertidos).toBe(50);
  });

  it('agrupa por canal: Google Ads junta los contactos del clic con sus clics', () => {
    const { filas } = embudoUnico(contactos, clics, 'channel', todos);
    expect(filas.map((f) => [f.clave, f.contactos, f.clics])).toEqual([
      ['GOOGLE_ADS', 2, 3],
      ['WEB_FORM', 1, 0],
      ['META_ADS', 0, 1],
    ]);
  });

  it('canal › servicio parte cada canal y deja juntas las filas del mismo canal', () => {
    const { filas } = embudoUnico(contactos, clics, 'channel_servicio', todos);
    expect(filas.map((f) => [f.clave, f.subclave, f.contactos, f.clics])).toEqual([
      ['GOOGLE_ADS', 'Monitoreo vehiculos', 2, 3],
      ['WEB_FORM', 'Alarmas', 1, 0],
      ['META_ADS', 'Camaras ia', 0, 1],
    ]);
  });

  it('agrupa por grupo de servicio y pone «Sin dato» a lo que no lo trae', () => {
    const { filas } = embudoUnico(contactos, clics, 'grupo', todos);
    expect(filas.map((f) => [f.clave, f.contactos])).toEqual([
      ['Monitoreo', 2],
      ['Sin dato', 1],
      ['Solutech', 0],
    ]);
  });

  it('el origen «whatsapp» deja solo a quien llegó por el botón; «otros» quita también los clics', () => {
    const wa = embudoUnico(contactos, clics, 'channel', { origen: 'whatsapp', servicio: null });
    expect(wa.total).toMatchObject({ contactos: 2, clics: 4 });
    const otros = embudoUnico(contactos, clics, 'channel', { origen: 'otros', servicio: null });
    expect(otros.total).toMatchObject({ contactos: 1, clics: 0 });
  });

  it('el filtro de servicio recorta contactos y clics, y el total se recalcula', () => {
    const r = embudoUnico(contactos, clics, 'channel', { origen: 'todos', servicio: 'Monitoreo vehiculos' });
    expect(r.total).toMatchObject({ contactos: 2, clics: 3 });
    expect(r.filas.map((f) => f.clave)).toEqual(['GOOGLE_ADS']);
  });

  it('junta «Monitoreo de Vehículos» (formulario) con «monitoreo_vehiculos» (clic) y deja el nombre más completo', () => {
    const cs = [
      contacto({ canal: 'WEB_FORM', servicio: 'Monitoreo de Vehículos', fase: 'CUALIFICADO' }),
      contacto({ canal: 'GOOGLE_ADS', servicio: 'monitoreo_vehiculos', porClic: true }),
    ];
    const ks = [clic({ servicio: 'monitoreo_vehiculos' })];
    expect(serviciosDelEmbudo(cs, ks)).toEqual(['Monitoreo de Vehículos']);
    const r = embudoUnico(cs, ks, 'servicio', todos);
    expect(r.filas).toEqual([expect.objectContaining({ clave: 'Monitoreo de Vehículos', contactos: 2, clics: 1 })]);
    const filtrado = embudoUnico(cs, ks, 'channel', { origen: 'todos', servicio: 'Monitoreo de Vehículos' });
    expect(filtrado.total).toMatchObject({ contactos: 2, clics: 1 });
  });

  it('sin nada no divide entre cero', () => {
    const r = embudoUnico([], [], 'channel', todos);
    expect(r.filas).toEqual([]);
    expect(r.total.pctCualificados).toBeNull();
    expect(r.total.pctEscribieron).toBeNull();
  });

  it('la lista de servicios del filtro sale ordenada y con «Sin dato» al final', () => {
    expect(serviciosDelEmbudo(contactos, clics)).toEqual(['Alarmas', 'Camaras ia', 'Monitoreo vehiculos']);
    expect(serviciosDelEmbudo([contacto()], clics)).toEqual(['Camaras ia', 'Monitoreo vehiculos', 'Sin dato']);
  });
});

describe('embudoUnico por ciudad', () => {
  const base = { canal: 'GOOGLE_ADS', campana: 'prueba', landing: 'camaras-ia', servicio: null, grupo: null };
  const contacto = (ciudad: string | null): ContactoParaEmbudo => ({
    ...base, ciudad, porClic: !!ciudad, fase: null, cotizo: false, vendido: 0,
  });
  const clic = (ciudad: string | null): ClicParaEmbudo => ({ ...base, ciudad, escribio: false });
  const todos = { origen: 'todos' as const, servicio: null };

  it('separa Loja y Guayaquil, y el formulario queda en «Sin dato»', () => {
    const r = embudoUnico(
      [contacto('Loja'), contacto(null)],
      [clic('Loja'), clic('Guayaquil'), clic('Guayaquil')],
      'ciudad',
      todos,
    );
    const por = Object.fromEntries(r.filas.map((f) => [f.clave, f]));
    expect(por['Guayaquil'].clics).toBe(2);
    expect(por['Loja'].clics).toBe(1);
    expect(por['Loja'].contactos).toBe(1);
    expect(por['Sin dato'].contactos).toBe(1);
  });

  it('el filtro de ciudad deja solo lo de esa ciudad', () => {
    const r = embudoUnico(
      [contacto('Loja'), contacto(null)],
      [clic('Loja'), clic('Guayaquil')],
      'ciudad_campana',
      { ...todos, ciudad: 'Loja' },
    );
    expect(r.total.clics).toBe(1);
    expect(r.total.contactos).toBe(1);
    expect(r.filas[0].subclave).toBe('prueba');
  });
});
