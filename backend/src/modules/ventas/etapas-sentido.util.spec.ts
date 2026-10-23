import { etapaDeReapertura, validarCambioDeEtapa, type EtapaOrden } from './etapas-sentido.util';

const FABRICA: EtapaOrden[] = [
  { key: 'RECIBIDO', label: 'Nueva', order: 0, isFinal: false },
  { key: 'LEIDO', label: 'En evaluación', order: 1, isFinal: false },
  { key: 'COTIZADO', label: 'Cotizada', order: 2, isFinal: false },
  { key: 'NEGOCIACION', label: 'En negociación', order: 3, isFinal: false },
  { key: 'ACEPTADO', label: 'Aceptada', order: 4, isFinal: true },
  { key: 'RECHAZADO', label: 'Perdida', order: 5, isFinal: true },
];
const e = (key: string) => FABRICA.find((x) => x.key === key)!;

describe('validarCambioDeEtapa', () => {
  it('una abierta avanza a la siguiente', () => {
    expect(validarCambioDeEtapa(e('RECIBIDO'), false, e('LEIDO'), FABRICA).ok).toBe(true);
  });

  it('una abierta puede saltar etapas hacia adelante, incluso a cerrar', () => {
    expect(validarCambioDeEtapa(e('RECIBIDO'), false, e('COTIZADO'), FABRICA).ok).toBe(true);
    expect(validarCambioDeEtapa(e('LEIDO'), false, e('RECHAZADO'), FABRICA).ok).toBe(true);
  });

  it('una abierta no vuelve a una etapa anterior', () => {
    const r = validarCambioDeEtapa(e('NEGOCIACION'), false, e('LEIDO'), FABRICA);
    expect(r.ok).toBe(false);
  });

  it('una cerrada solo se reabre a «En evaluación»', () => {
    expect(validarCambioDeEtapa(e('ACEPTADO'), true, e('LEIDO'), FABRICA).ok).toBe(true);
    expect(validarCambioDeEtapa(e('RECHAZADO'), true, e('LEIDO'), FABRICA).ok).toBe(true);
  });

  it('una cerrada no pasa a otra etapa ni de Aceptada a Perdida', () => {
    expect(validarCambioDeEtapa(e('ACEPTADO'), true, e('COTIZADO'), FABRICA).ok).toBe(false);
    expect(validarCambioDeEtapa(e('ACEPTADO'), true, e('RECHAZADO'), FABRICA).ok).toBe(false);
    expect(validarCambioDeEtapa(e('RECHAZADO'), true, e('ACEPTADO'), FABRICA).ok).toBe(false);
  });

  it('sin etapa actual cualquier destino sirve', () => {
    expect(validarCambioDeEtapa(null, false, e('COTIZADO'), FABRICA).ok).toBe(true);
  });
});

describe('etapaDeReapertura', () => {
  it('usa «En evaluación» cuando existe', () => {
    expect(etapaDeReapertura(FABRICA)?.key).toBe('LEIDO');
  });

  it('si la empresa la quitó, usa la primera abierta después de la inicial', () => {
    const sin = FABRICA.filter((x) => x.key !== 'LEIDO');
    expect(etapaDeReapertura(sin)?.key).toBe('COTIZADO');
  });
});
