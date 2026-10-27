import { afterEach, describe, expect, it, vi } from 'vitest';
import { duracion, fechaLarga, hora, hoyEcuador, instanteLegible, sumarDias } from './bitacoraFechas';

afterEach(() => {
  vi.useRealTimers();
});

describe('hoyEcuador', () => {
  it('a las 04:59 UTC todavía es el día anterior en Ecuador', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T04:59:00Z'));
    expect(hoyEcuador()).toBe('2026-10-27');
  });

  it('a las 05:00 UTC empieza el día nuevo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T05:00:00Z'));
    expect(hoyEcuador()).toBe('2026-10-28');
  });
});

describe('sumarDias', () => {
  it('suma y resta días, también al cambiar de mes y de año', () => {
    expect(sumarDias('2026-10-27', 1)).toBe('2026-10-28');
    expect(sumarDias('2026-10-27', -1)).toBe('2026-10-26');
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('hora', () => {
  it('muestra la hora de Ecuador en formato de 24 horas', () => {
    expect(hora('2026-10-27T13:12:00Z')).toBe('08:12');
    expect(hora('2026-10-28T04:59:00Z')).toBe('23:59');
  });
});

describe('duracion', () => {
  it.each([
    [45, '45 min'],
    [60, '1 h'],
    [130, '2 h 10 min'],
    [195, '3 h 15 min'],
  ])('%i minutos → %s', (min, texto) => {
    expect(duracion(min)).toBe(texto);
  });
});

describe('fechaLarga', () => {
  it('escribe el día con mayúscula inicial, sin mayúsculas en cada palabra', () => {
    expect(fechaLarga('2026-10-27')).toBe('Martes, 27 de octubre de 2026');
  });
});

describe('instanteLegible', () => {
  it('dice «Hoy» para el día actual de Ecuador', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
    expect(instanteLegible('2026-10-27T13:12:00Z')).toBe('Hoy, 08:12');
  });

  it('para otro día escribe la fecha completa', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
    expect(instanteLegible('2026-10-26T15:00:00Z')).toBe('Lunes, 26 de octubre de 2026, 10:00');
  });

  it('un instante de las 20:00 de Ecuador (01:00 UTC del día siguiente) es del día de Ecuador', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T18:00:00Z'));
    expect(instanteLegible('2026-10-28T01:00:00Z')).toBe('Hoy, 20:00');
  });
});
