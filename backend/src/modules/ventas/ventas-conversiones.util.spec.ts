import {
  VIGENCIA_GCLID_DIAS,
  gclidDeLead,
  gclidVigente,
  hechosAcumulados,
  hechosDeEtapa,
} from './ventas-conversiones.util';
import { clavesCualificadas } from './ventas-marketing.util';

describe('hechosDeEtapa', () => {
  it('estar En evaluación, cotizar o negociar es cualificado', () => {
    expect(hechosDeEtapa('LEIDO', null)).toEqual(['CUALIFICADO']);
    expect(hechosDeEtapa('COTIZADO', null)).toEqual(['CUALIFICADO']);
    expect(hechosDeEtapa('NEGOCIACION', null)).toEqual(['CUALIFICADO']);
  });

  it('una etapa propia de la empresa (intermedia) también es cualificado', () => {
    const cualificadas = clavesCualificadas([
      { key: 'RECIBIDO', isInitial: true, isFinal: false },
      { key: 'PROPUESTA_ENVIADA', isInitial: false, isFinal: false },
      { key: 'RECHAZADO', isInitial: false, isFinal: true },
    ]);
    expect(hechosDeEtapa('PROPUESTA_ENVIADA', null, cualificadas)).toEqual(['CUALIFICADO']);
    expect(hechosDeEtapa('PROPUESTA_ENVIADA', null)).toEqual([]);
    expect(hechosDeEtapa('RECIBIDO', null, cualificadas)).toEqual([]);
    expect(hechosDeEtapa('RECHAZADO', 'PERDIDA', cualificadas)).toEqual([]);
  });

  it('aceptar es convertido, y también cualificado (el embudo es acumulado)', () => {
    expect(hechosDeEtapa('ACEPTADO', 'GANADA')).toEqual(['CUALIFICADO', 'CONVERTIDO']);
  });

  it('las demás etapas, y perder, no avisan nada a Google', () => {
    expect(hechosDeEtapa('RECIBIDO', null)).toEqual([]);
    expect(hechosDeEtapa('RECHAZADO', 'PERDIDA')).toEqual([]);
  });
});

describe('hechosAcumulados', () => {
  it('mira todo el camino: pasó por evaluación es cualificado aunque hoy esté perdida', () => {
    expect(hechosAcumulados(['RECIBIDO', 'LEIDO', 'RECHAZADO'], 'PERDIDA')).toEqual(['CUALIFICADO']);
    expect(hechosAcumulados(['RECIBIDO'], null)).toEqual([]);
    expect(hechosAcumulados(['RECIBIDO', 'RECHAZADO'], 'PERDIDA')).toEqual([]);
  });

  it('ganada es cualificada y convertida', () => {
    expect(hechosAcumulados(['RECIBIDO', 'ACEPTADO'], 'GANADA')).toEqual(['CUALIFICADO', 'CONVERTIDO']);
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
