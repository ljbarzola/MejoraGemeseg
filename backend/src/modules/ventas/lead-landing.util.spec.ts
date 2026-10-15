import { CANALES_REGISTRO, canalDef } from './lead-canales.const';
import {
  LANDINGS,
  datosDeLanding,
  limpiarSlug,
  normalizarConsentimiento,
} from './lead-landing.util';
import { DEFAULT_SUBSERVICIOS } from './ventas-subservicios.const';

describe('registro de canales', () => {
  it('no repite claves y todos tienen etiqueta', () => {
    const claves = CANALES_REGISTRO.map((c) => c.key);
    expect(new Set(claves).size).toBe(claves.length);
    expect(CANALES_REGISTRO.every((c) => c.label.length > 0)).toBe(true);
  });

  it('un canal desconocido no existe y uno conocido sí', () => {
    expect(canalDef('TIKTOK')).toBeUndefined();
    expect(canalDef('REFERIDO')?.fuenteCliente).toBe('REFERIDO');
    expect(canalDef('GOOGLE_ADS')?.fuenteCliente).toBe('CAMPANA');
  });
});

describe('landings', () => {
  it('cada landing apunta a un servicio que existe en el catálogo de fábrica', () => {
    const catalogo = Object.values(DEFAULT_SUBSERVICIOS)
      .flat()
      .map((s) => s.label);
    for (const l of LANDINGS) expect(catalogo).toContain(l.servicio);
  });

  it('limpiarSlug deja solo letras, números y guiones', () => {
    expect(limpiarSlug('Monitoreo-Alarmas')).toBe('monitoreo-alarmas');
    expect(limpiarSlug('../etc/passwd')).toBe('etcpasswd');
    expect(limpiarSlug(undefined)).toBe('');
  });
});

describe('normalizarConsentimiento', () => {
  it('casilla marcada con la política', () => {
    expect(normalizarConsentimiento('Sí (Política 2026-10)')).toEqual({
      consentimiento: 'SI',
      politica: 'Política 2026-10',
    });
  });

  it('sin valor o «no» es «no consta», nunca un «no» inventado', () => {
    expect(normalizarConsentimiento('')).toEqual({ consentimiento: 'NO_CONSTA' });
    expect(normalizarConsentimiento(undefined)).toEqual({ consentimiento: 'NO_CONSTA' });
    expect(normalizarConsentimiento('no')).toEqual({ consentimiento: 'NO_CONSTA' });
  });
});

describe('datosDeLanding', () => {
  it('una landing conocida pone servicio y línea comercial por su dirección', () => {
    const d = datosDeLanding({
      landing: 'monitoreo-alarmas',
      necesidad: 'Necesito instalar un sistema de alarma',
      message: 'Quiero cotizar',
      consentimiento: 'Sí (Política 2026-10)',
    });
    expect(d.extra).toMatchObject({
      landing: 'monitoreo-alarmas',
      servicio: 'Monitoreo de Alarmas',
      lineaComercial: 'Monitoreo',
      consentimiento: 'SI',
    });
    expect(d.message).toBe('Situación: Necesito instalar un sistema de alarma\nQuiero cotizar');
  });

  it('una landing antigua conserva el texto de «servicio» del formulario', () => {
    const d = datosDeLanding({ landing: 'monitoreo', servicio: 'Alarmas' });
    expect(d.extra.servicio).toBe('Alarmas');
    expect(d.extra.lineaComercial).toBeUndefined();
  });

  it('acepta la situación como `tipo` (así la reenvía el plugin de WordPress)', () => {
    const d = datosDeLanding({ landing: 'seguridad-vip', tipo: 'Seguridad para mi familia' });
    expect(d.extra.necesidad).toBe('Seguridad para mi familia');
    expect(d.message).toBe('Situación: Seguridad para mi familia');
  });

  it('sin consentimiento queda «no consta»', () => {
    expect(datosDeLanding({ landing: 'seguridad-vip' }).extra.consentimiento).toBe('NO_CONSTA');
  });
});
