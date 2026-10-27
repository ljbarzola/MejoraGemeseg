import {
  esFechaValida,
  hoyEcuador,
  minutosDelDia,
  rangoDia,
  sumarDias,
} from './bitacora-fecha.util';

describe('bitacora-fecha.util (días de Ecuador, UTC-5)', () => {
  describe('hoyEcuador', () => {
    it('a las 04:59 UTC en Ecuador todavía es el día anterior', () => {
      expect(hoyEcuador(new Date('2026-10-28T04:59:00Z'))).toBe('2026-10-27');
    });

    it('a las 05:00 UTC empieza el día nuevo en Ecuador', () => {
      expect(hoyEcuador(new Date('2026-10-28T05:00:00Z'))).toBe('2026-10-28');
    });

    it('un evento de las 20:00 en Guayaquil es del mismo día aunque en UTC ya sea el siguiente', () => {
      expect(hoyEcuador(new Date('2026-10-28T01:00:00Z'))).toBe('2026-10-27');
    });
  });

  describe('esFechaValida', () => {
    it.each(['2026-10-27', '2024-02-29', '2026-12-31'])('acepta %s', (f) => {
      expect(esFechaValida(f)).toBe(true);
    });

    it.each([
      '',
      '27/10/2026',
      '2026-1-5',
      '2026-13-45',
      '2026-02-30',
      '2025-02-29',
      'hoy',
    ])('rechaza "%s"', (f) => {
      expect(esFechaValida(f)).toBe(false);
    });
  });

  describe('rangoDia', () => {
    it('va de las 00:00 de Ecuador (05:00 UTC) a las 00:00 del día siguiente', () => {
      const { desde, hasta } = rangoDia('2026-10-27');
      expect(desde.toISOString()).toBe('2026-10-27T05:00:00.000Z');
      expect(hasta.toISOString()).toBe('2026-10-28T05:00:00.000Z');
    });

    it('un evento de las 23:59 de Ecuador cae dentro del día y el de las 00:00 del siguiente, fuera', () => {
      const { desde, hasta } = rangoDia('2026-10-27');
      const ultimo = new Date('2026-10-28T04:59:00Z');
      const siguiente = new Date('2026-10-28T05:00:00Z');
      expect(ultimo >= desde && ultimo < hasta).toBe(true);
      expect(siguiente >= desde && siguiente < hasta).toBe(false);
    });
  });

  describe('sumarDias', () => {
    it('suma y resta días, también al cambiar de mes y de año', () => {
      expect(sumarDias('2026-10-27', 1)).toBe('2026-10-28');
      expect(sumarDias('2026-10-27', -6)).toBe('2026-10-21');
      expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
      expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
    });
  });

  describe('minutosDelDia (hora de Ecuador)', () => {
    it('cuenta desde las 00:00 de Ecuador', () => {
      expect(minutosDelDia(new Date('2026-10-27T13:12:00Z'))).toBe(8 * 60 + 12);
      expect(minutosDelDia(new Date('2026-10-28T05:00:00Z'))).toBe(0);
      expect(minutosDelDia(new Date('2026-10-28T04:59:00Z'))).toBe(1439);
    });
  });
});
