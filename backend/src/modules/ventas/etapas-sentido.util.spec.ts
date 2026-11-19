import {
  etapaDeReapertura,
  tipoDeCambio,
  validarCambioDeEtapa,
  type EtapaOrden,
} from './etapas-sentido.util';

const FABRICA: EtapaOrden[] = [
  { key: 'RECIBIDO', label: 'Recibido', order: 1, isFinal: false },
  { key: 'LEIDO', label: 'En evaluación', order: 2, isFinal: false },
  { key: 'COTIZADO', label: 'Cotizado', order: 3, isFinal: false },
  { key: 'NEGOCIACION', label: 'Negociación', order: 4, isFinal: false },
  { key: 'ACEPTADO', label: 'Aceptado', order: 5, isFinal: true },
  { key: 'RECHAZADO', label: 'Perdido', order: 6, isFinal: true },
];
const e = (key: string) => FABRICA.find((x) => x.key === key)!;

describe('validarCambioDeEtapa', () => {
  it('permite avanzar, saltando etapas', () => {
    expect(validarCambioDeEtapa(e('RECIBIDO'), false, e('COTIZADO'), FABRICA).ok).toBe(true);
    expect(validarCambioDeEtapa(e('LEIDO'), false, e('RECHAZADO'), FABRICA).ok).toBe(true);
  });

  it('permite volver a una etapa anterior si está abierta', () => {
    expect(validarCambioDeEtapa(e('NEGOCIACION'), false, e('LEIDO'), FABRICA).ok).toBe(true);
  });

  it('permite reabrir una cerrada a la etapa que se elija', () => {
    expect(validarCambioDeEtapa(e('ACEPTADO'), true, e('COTIZADO'), FABRICA).ok).toBe(true);
    expect(validarCambioDeEtapa(e('RECHAZADO'), true, e('RECIBIDO'), FABRICA).ok).toBe(true);
  });

  it('permite corregir Aceptada ⇄ Perdida', () => {
    expect(validarCambioDeEtapa(e('ACEPTADO'), true, e('RECHAZADO'), FABRICA).ok).toBe(true);
    expect(validarCambioDeEtapa(e('RECHAZADO'), true, e('ACEPTADO'), FABRICA).ok).toBe(true);
  });

  it('rechaza quedarse en la misma etapa', () => {
    expect(validarCambioDeEtapa(e('COTIZADO'), false, e('COTIZADO'), FABRICA).ok).toBe(false);
  });

  it('rechaza una etapa que la empresa no tiene', () => {
    const ajena: EtapaOrden = { key: 'OTRA', label: 'Otra', order: 9, isFinal: false };
    expect(validarCambioDeEtapa(e('RECIBIDO'), false, ajena, FABRICA).ok).toBe(false);
  });

  it('una oportunidad sin etapa puede empezar en cualquiera', () => {
    expect(validarCambioDeEtapa(null, false, e('COTIZADO'), FABRICA).ok).toBe(true);
  });
});

describe('tipoDeCambio', () => {
  it('distingue avance, retroceso, reapertura y corrección', () => {
    expect(tipoDeCambio(e('LEIDO'), false, e('COTIZADO'))).toBe('AVANCE');
    expect(tipoDeCambio(e('NEGOCIACION'), false, e('LEIDO'))).toBe('RETROCESO');
    expect(tipoDeCambio(e('ACEPTADO'), true, e('COTIZADO'))).toBe('REAPERTURA');
    expect(tipoDeCambio(e('ACEPTADO'), true, e('RECHAZADO'))).toBe('CORRECCION');
  });
});

describe('etapaDeReapertura', () => {
  it('sugiere «En evaluación» de fábrica', () => {
    expect(etapaDeReapertura(FABRICA)?.key).toBe('LEIDO');
  });

  it('sin esa etapa, cae en la primera abierta tras la inicial', () => {
    const sin = FABRICA.filter((x) => x.key !== 'LEIDO');
    expect(etapaDeReapertura(sin)?.key).toBe('COTIZADO');
  });
});
