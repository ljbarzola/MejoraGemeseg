import {
  diasEntre,
  estaVencida,
  extraerIdArchivoDrive,
  fechaDesdeTexto,
  formatoFecha,
  hoyEcuador,
  tocaRecordatorio,
  trasladarFechaAMes,
  ultimoDiaDelMes,
} from './entregas.util';

const f = (texto: string) => fechaDesdeTexto(texto);

describe('entregas.util', () => {
  describe('hoyEcuador', () => {
    it('usa la fecha de Ecuador, no la UTC (a las 22:00 en Ecuador ya es el día siguiente en UTC)', () => {
      // 2026-10-02 03:30 UTC = 2026-10-01 22:30 en Ecuador (UTC-5)
      expect(
        hoyEcuador(new Date('2026-10-02T03:30:00Z')).toISOString().slice(0, 10),
      ).toBe('2026-10-01');
    });
  });

  describe('diasEntre', () => {
    it('cuenta días enteros, con signo', () => {
      expect(diasEntre(f('2026-10-01'), f('2026-10-04'))).toBe(3);
      expect(diasEntre(f('2026-10-04'), f('2026-10-01'))).toBe(-3);
      expect(diasEntre(f('2026-10-01'), f('2026-10-01'))).toBe(0);
    });
  });

  describe('trasladarFechaAMes', () => {
    it('mantiene el día del mes', () => {
      expect(
        trasladarFechaAMes(f('2026-09-25'), 2026, 10)
          .toISOString()
          .slice(0, 10),
      ).toBe('2026-10-25');
    });

    it('si el mes nuevo es más corto, usa su último día (31 de agosto -> 30 de septiembre)', () => {
      expect(
        trasladarFechaAMes(f('2026-08-31'), 2026, 9).toISOString().slice(0, 10),
      ).toBe('2026-09-30');
    });

    it('febrero respeta los años bisiestos', () => {
      expect(
        trasladarFechaAMes(f('2027-01-31'), 2028, 2).toISOString().slice(0, 10),
      ).toBe('2028-02-29');
      expect(
        trasladarFechaAMes(f('2027-01-31'), 2027, 2).toISOString().slice(0, 10),
      ).toBe('2027-02-28');
    });

    it('cruza de año', () => {
      expect(
        trasladarFechaAMes(f('2026-12-15'), 2027, 1).toISOString().slice(0, 10),
      ).toBe('2027-01-15');
    });
  });

  describe('ultimoDiaDelMes', () => {
    it('devuelve el último día de cada mes', () => {
      expect(ultimoDiaDelMes(2026, 9)).toBe(30);
      expect(ultimoDiaDelMes(2026, 10)).toBe(31);
      expect(ultimoDiaDelMes(2028, 2)).toBe(29);
    });
  });

  describe('estaVencida', () => {
    const hoy = f('2026-10-01');
    it('vence solo si ya pasó la fecha y falta algo por hacer', () => {
      expect(estaVencida('PENDIENTE', f('2026-09-30'), hoy)).toBe(true);
      expect(estaVencida('RECHAZADO', f('2026-09-30'), hoy)).toBe(true);
    });
    it('el mismo día del límite todavía no está vencida', () => {
      expect(estaVencida('PENDIENTE', f('2026-10-01'), hoy)).toBe(false);
    });
    it('lo entregado o aprobado nunca figura vencido', () => {
      expect(estaVencida('ENTREGADO', f('2026-09-01'), hoy)).toBe(false);
      expect(estaVencida('APROBADO', f('2026-09-01'), hoy)).toBe(false);
    });
  });

  describe('tocaRecordatorio', () => {
    const hoy = f('2026-10-01');

    it('recuerda a 3 días del límite y el mismo día', () => {
      expect(tocaRecordatorio('PENDIENTE', f('2026-10-04'), null, hoy)).toBe(
        true,
      );
      expect(tocaRecordatorio('PENDIENTE', f('2026-10-01'), null, hoy)).toBe(
        true,
      );
    });

    it('no recuerda en otros días', () => {
      expect(tocaRecordatorio('PENDIENTE', f('2026-10-02'), null, hoy)).toBe(
        false,
      );
      expect(tocaRecordatorio('PENDIENTE', f('2026-10-03'), null, hoy)).toBe(
        false,
      );
      expect(tocaRecordatorio('PENDIENTE', f('2026-10-05'), null, hoy)).toBe(
        false,
      );
      expect(tocaRecordatorio('PENDIENTE', f('2026-09-30'), null, hoy)).toBe(
        false,
      );
    });

    it('un rechazado también se recuerda', () => {
      expect(tocaRecordatorio('RECHAZADO', f('2026-10-04'), null, hoy)).toBe(
        true,
      );
    });

    it('lo entregado o aprobado no se recuerda', () => {
      expect(tocaRecordatorio('ENTREGADO', f('2026-10-04'), null, hoy)).toBe(
        false,
      );
      expect(tocaRecordatorio('APROBADO', f('2026-10-01'), null, hoy)).toBe(
        false,
      );
    });

    it('no repite el mismo día', () => {
      // recordado hoy a las 10:00 en Ecuador (15:00 UTC)
      expect(
        tocaRecordatorio(
          'PENDIENTE',
          f('2026-10-01'),
          new Date('2026-10-01T15:00:00Z'),
          hoy,
        ),
      ).toBe(false);
    });

    it('un recordatorio de otro día no impide el de hoy', () => {
      expect(
        tocaRecordatorio(
          'PENDIENTE',
          f('2026-10-01'),
          new Date('2026-09-28T15:00:00Z'),
          hoy,
        ),
      ).toBe(true);
    });
  });

  describe('formatoFecha', () => {
    it('muestra día/mes/año', () => {
      expect(formatoFecha(f('2026-09-05'))).toBe('05/09/2026');
    });
  });
});

describe('extraerIdArchivoDrive', () => {
  it('saca el id de un enlace de archivo de Drive', () => {
    expect(
      extraerIdArchivoDrive('https://drive.google.com/file/d/1AbC_d-9/view?usp=sharing'),
    ).toBe('1AbC_d-9');
  });

  it('saca el id de un enlace con ?id=', () => {
    expect(
      extraerIdArchivoDrive('https://drive.google.com/open?id=1AbC_d-9'),
    ).toBe('1AbC_d-9');
  });

  it('devuelve null si no es un enlace de archivo de Drive', () => {
    expect(extraerIdArchivoDrive('https://ejemplo.com/documento.pdf')).toBeNull();
    expect(extraerIdArchivoDrive('')).toBeNull();
  });
});
