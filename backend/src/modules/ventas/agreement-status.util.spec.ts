import {
  calcularEstadoContrato,
  parseDiaContrato,
  problemaFechaCancelacion,
  sumarDias,
} from './agreement-status.util';

// 12:00 UTC = 07:00 en Ecuador: el mismo día en ambos husos.
const ahora = new Date('2026-10-07T12:00:00.000Z');
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('calcularEstadoContrato', () => {
  const base = { status: 'ACTIVO', startDate: dia('2026-01-01') };

  it('sin fecha de fin está vigente', () => {
    expect(calcularEstadoContrato({ ...base, endDate: null }, ahora)).toBe(
      'VIGENTE',
    );
  });

  it('vigente cuando falta más de 30 días', () => {
    expect(
      calcularEstadoContrato({ ...base, endDate: dia('2026-12-31') }, ahora),
    ).toBe('VIGENTE');
  });

  it('por vencer dentro de los 30 días, incluido el día 30 y el último día', () => {
    expect(
      calcularEstadoContrato({ ...base, endDate: dia('2026-11-06') }, ahora),
    ).toBe('POR_VENCER');
    expect(
      calcularEstadoContrato({ ...base, endDate: dia('2026-10-07') }, ahora),
    ).toBe('POR_VENCER');
  });

  it('vencido el día después del fin', () => {
    expect(
      calcularEstadoContrato({ ...base, endDate: dia('2026-10-06') }, ahora),
    ).toBe('VENCIDO');
  });

  it('por iniciar si empieza en el futuro', () => {
    expect(
      calcularEstadoContrato(
        { status: 'ACTIVO', startDate: dia('2026-11-01'), endDate: null },
        ahora,
      ),
    ).toBe('POR_INICIAR');
  });

  it('cancelado y renovado mandan sobre las fechas', () => {
    const vencido = {
      startDate: dia('2025-01-01'),
      endDate: dia('2025-12-31'),
    };
    expect(
      calcularEstadoContrato({ status: 'CANCELADO', ...vencido }, ahora),
    ).toBe('CANCELADO');
    expect(
      calcularEstadoContrato({ status: 'RENOVADO', ...vencido }, ahora),
    ).toBe('RENOVADO');
  });

  it('usa el día de Ecuador, no el de UTC, cerca de medianoche', () => {
    // 02:00 UTC del 8 de octubre = 21:00 del 7 en Ecuador: el contrato que
    // termina el 7 todavía no venció.
    const tarde = new Date('2026-10-08T02:00:00.000Z');
    expect(
      calcularEstadoContrato({ ...base, endDate: dia('2026-10-07') }, tarde),
    ).toBe('POR_VENCER');
  });
});

describe('parseDiaContrato', () => {
  it('lee un día real', () => {
    expect(parseDiaContrato('2026-10-07')?.toISOString()).toBe(
      '2026-10-07T00:00:00.000Z',
    );
  });

  it('rechaza días que no existen y formatos raros', () => {
    expect(parseDiaContrato('2026-02-31')).toBeNull();
    expect(parseDiaContrato('07/10/2026')).toBeNull();
    expect(parseDiaContrato('')).toBeNull();
    expect(parseDiaContrato(undefined)).toBeNull();
  });
});

describe('sumarDias', () => {
  it('pasa de mes y de año', () => {
    expect(sumarDias(dia('2026-12-31'), 1).toISOString().slice(0, 10)).toBe(
      '2027-01-01',
    );
  });
});

describe('problemaFechaCancelacion', () => {
  const inicio = dia('2026-01-01');

  it('acepta una cancelación pasada, entre el inicio y hoy (contrato anterior a la app)', () => {
    expect(problemaFechaCancelacion(dia('2026-02-01'), inicio, ahora)).toBeNull();
    expect(problemaFechaCancelacion(dia('2026-01-01'), inicio, ahora)).toBeNull();
    expect(problemaFechaCancelacion(dia('2026-10-07'), inicio, ahora)).toBeNull();
  });

  it('rechaza una cancelación anterior al inicio del contrato, con las fechas en el mensaje', () => {
    expect(problemaFechaCancelacion(dia('2025-12-31'), inicio, ahora)).toBe(
      'El contrato empezó el 01/01/2026: no pudo cancelarse antes, el 31/12/2025.',
    );
  });

  it('rechaza una cancelación futura', () => {
    expect(problemaFechaCancelacion(dia('2026-10-08'), inicio, ahora)).toContain(
      'no puede ser futura',
    );
  });
});
