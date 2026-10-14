import {
  embudoMarketing,
  faseMarketing,
  type LeadParaEmbudo,
} from './ventas-marketing.util';

const opp = (o: Partial<Parameters<typeof faseMarketing>[0]> = {}) => ({
  outcome: null,
  status: 'RECIBIDO',
  quotedAt: null,
  ...o,
});

describe('faseMarketing', () => {
  it('antes de cotizar está sin procesar', () => {
    expect(faseMarketing(opp())).toBe('SIN_PROCESAR');
    expect(faseMarketing(opp({ status: 'LEIDO' }))).toBe('SIN_PROCESAR');
  });

  it('desde Cotizada es cualificado, también en negociación', () => {
    expect(faseMarketing(opp({ status: 'COTIZADO' }))).toBe('CUALIFICADO');
    expect(faseMarketing(opp({ status: 'NEGOCIACION' }))).toBe('CUALIFICADO');
  });

  it('una fecha de cotización basta para ser cualificado', () => {
    expect(faseMarketing(opp({ quotedAt: new Date('2026-10-01') }))).toBe('CUALIFICADO');
  });

  it('perdida después de cotizar sigue siendo cualificado; perdida sin cotizar no', () => {
    expect(
      faseMarketing(opp({ outcome: 'PERDIDA', status: 'RECHAZADO', etapasAlcanzadas: ['LEIDO', 'COTIZADO', 'RECHAZADO'] })),
    ).toBe('CUALIFICADO');
    expect(
      faseMarketing(opp({ outcome: 'PERDIDA', status: 'RECHAZADO', etapasAlcanzadas: ['LEIDO', 'RECHAZADO'] })),
    ).toBe('SIN_PROCESAR');
  });

  it('ganada es convertido', () => {
    expect(faseMarketing(opp({ outcome: 'GANADA', status: 'ACEPTADO' }))).toBe('CONVERTIDO');
  });
});

describe('embudoMarketing', () => {
  const lead = (
    channel: string,
    fase: LeadParaEmbudo['fase'],
    extra: Partial<LeadParaEmbudo> = {},
  ): LeadParaEmbudo => ({ channel, campaign: null, landing: null, fase, ...extra });

  it('es acumulado: un convertido también cuenta como cualificado', () => {
    const r = embudoMarketing(
      [lead('GOOGLE_ADS', 'CONVERTIDO'), lead('GOOGLE_ADS', 'CUALIFICADO'), lead('GOOGLE_ADS', null), lead('GOOGLE_ADS', 'SIN_PROCESAR')],
      'channel',
    );
    expect(r.total).toMatchObject({ leads: 4, cualificados: 2, convertidos: 1 });
    expect(r.total.pctCualificados).toBe(50);
    expect(r.total.pctConvertidos).toBe(50);
  });

  it('agrupa por canal, campaña o landing y pone «Sin dato» a lo que no lo trae', () => {
    const leads = [
      lead('WEB_FORM', 'CUALIFICADO', { landing: 'monitoreo' }),
      lead('WEB_FORM', null, { landing: 'monitoreo' }),
      lead('GOOGLE_ADS', null),
    ];
    const r = embudoMarketing(leads, 'landing');
    expect(r.filas.map((f) => [f.clave, f.leads])).toEqual([
      ['monitoreo', 2],
      ['Sin dato', 1],
    ]);
  });

  it('sin leads no divide entre cero', () => {
    const r = embudoMarketing([], 'channel');
    expect(r.total.pctCualificados).toBeNull();
    expect(r.filas).toEqual([]);
  });
});
