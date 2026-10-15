import {
  VIGENCIA_GCLID_DIAS,
  gclidDeLead,
  gclidVigente,
  hechosDeEtapa,
} from './ventas-conversiones.util';

describe('hechosDeEtapa', () => {
  it('cotizar o negociar es cualificado', () => {
    expect(hechosDeEtapa('COTIZADO', null)).toEqual(['CUALIFICADO']);
    expect(hechosDeEtapa('NEGOCIACION', null)).toEqual(['CUALIFICADO']);
  });

  it('aceptar es convertido, y también cualificado (el embudo es acumulado)', () => {
    expect(hechosDeEtapa('ACEPTADO', 'GANADA')).toEqual(['CUALIFICADO', 'CONVERTIDO']);
  });

  it('las demás etapas, y perder, no avisan nada a Google', () => {
    expect(hechosDeEtapa('RECIBIDO', null)).toEqual([]);
    expect(hechosDeEtapa('LEIDO', null)).toEqual([]);
    expect(hechosDeEtapa('RECHAZADO', 'PERDIDA')).toEqual([]);
  });
});

describe('gclidVigente', () => {
  const llegada = new Date('2026-07-01T12:00:00Z');

  it('vale mientras no pasen los 90 días', () => {
    expect(gclidVigente(llegada, new Date('2026-07-31T12:00:00Z'))).toBe(true);
    const limite = new Date(llegada.getTime() + VIGENCIA_GCLID_DIAS * 86_400_000);
    expect(gclidVigente(llegada, limite)).toBe(true);
  });

  it('pasados los 90 días ya no vale', () => {
    const tarde = new Date(llegada.getTime() + (VIGENCIA_GCLID_DIAS + 1) * 86_400_000);
    expect(gclidVigente(llegada, tarde)).toBe(false);
  });
});

describe('gclidDeLead', () => {
  it('lee el gclid y recorta espacios', () => {
    expect(gclidDeLead({ gclid: '  abc123 ' })).toBe('abc123');
  });

  it('sin gclid, vacío o de otro tipo devuelve null', () => {
    expect(gclidDeLead({})).toBeNull();
    expect(gclidDeLead({ gclid: '   ' })).toBeNull();
    expect(gclidDeLead({ gclid: 5 })).toBeNull();
    expect(gclidDeLead(null)).toBeNull();
  });
});
