import {
  calcularCicloVida,
  graciaSugerida,
  type ContratoParaCiclo,
} from './client-lifecycle.util';

// 12:00 UTC = 07:00 en Ecuador, el mismo día en ambos husos.
const ahora = new Date('2026-10-07T12:00:00.000Z');
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

const contrato = (
  inicio: string,
  fin: string | null,
  extra: Partial<ContratoParaCiclo> = {},
): ContratoParaCiclo => ({
  status: 'ACTIVO',
  startDate: dia(inicio),
  endDate: fin ? dia(fin) : null,
  graceDays: 30,
  ...extra,
});

const sinMovimiento = {
  oportunidades: [],
  ultimaActividad: null,
  seguimientoVencido: false,
};

describe('calcularCicloVida', () => {
  it('sin contratos ni oportunidades es prospecto', () => {
    expect(calcularCicloVida({ ...sinMovimiento, contratos: [] }, ahora).ciclo).toBe('PROSPECTO');
  });

  it('con una oportunidad abierta sigue siendo prospecto', () => {
    const r = calcularCicloVida(
      {
        ...sinMovimiento,
        contratos: [],
        oportunidades: [{ closedAt: null, outcome: null }],
      },
      ahora,
    );
    expect(r.ciclo).toBe('PROSPECTO');
  });

  it('perdido solo si todas las oportunidades se perdieron y nunca contrató', () => {
    const perdida = { closedAt: dia('2026-09-01'), outcome: 'PERDIDA' };
    expect(
      calcularCicloVida({ ...sinMovimiento, contratos: [], oportunidades: [perdida, perdida] }, ahora).ciclo,
    ).toBe('PERDIDO');
    expect(
      calcularCicloVida(
        { ...sinMovimiento, contratos: [], oportunidades: [perdida, { closedAt: null, outcome: null }] },
        ahora,
      ).ciclo,
    ).toBe('PROSPECTO');
  });

  it('con contrato vigente y sin señales es cliente', () => {
    const r = calcularCicloVida(
      { ...sinMovimiento, contratos: [contrato('2026-01-01', '2027-12-31')], ultimaActividad: dia('2026-10-01') },
      ahora,
    );
    expect(r).toEqual({ ciclo: 'CLIENTE', razones: [] });
  });

  it('contrato por vencer lo pone en riesgo', () => {
    const r = calcularCicloVida(
      { ...sinMovimiento, contratos: [contrato('2026-01-01', '2026-10-20')], ultimaActividad: dia('2026-10-01') },
      ahora,
    );
    expect(r.ciclo).toBe('EN_RIESGO');
    expect(r.razones).toContain('Contrato por vencer');
  });

  it('más de 60 días sin actividad lo pone en riesgo; exactamente 60 no', () => {
    const base = { ...sinMovimiento, contratos: [contrato('2026-01-01', '2027-12-31')] };
    expect(calcularCicloVida({ ...base, ultimaActividad: dia('2026-08-07') }, ahora).ciclo).toBe('EN_RIESGO'); // 61 días
    expect(calcularCicloVida({ ...base, ultimaActividad: dia('2026-08-08') }, ahora).ciclo).toBe('CLIENTE'); // 60 días exactos
    expect(calcularCicloVida({ ...base, ultimaActividad: dia('2026-08-09') }, ahora).ciclo).toBe('CLIENTE'); // 59 días
  });

  it('seguimiento vencido lo pone en riesgo', () => {
    const r = calcularCicloVida(
      {
        ...sinMovimiento,
        contratos: [contrato('2026-01-01', '2027-12-31')],
        ultimaActividad: dia('2026-10-05'),
        seguimientoVencido: true,
      },
      ahora,
    );
    expect(r.razones).toContain('Seguimiento vencido');
  });

  it('vencido dentro de los días de gracia sigue en riesgo; pasada la gracia es ex-cliente', () => {
    // fin 2026-09-20 + 30 días de gracia = 2026-10-20 (hoy 10-07: en gracia)
    expect(
      calcularCicloVida({ ...sinMovimiento, contratos: [contrato('2025-09-21', '2026-09-20')] }, ahora).ciclo,
    ).toBe('EN_RIESGO');
    // fin 2026-08-01 + 30 = 2026-08-31 (ya pasó)
    expect(
      calcularCicloVida({ ...sinMovimiento, contratos: [contrato('2025-08-02', '2026-08-01')] }, ahora).ciclo,
    ).toBe('EX_CLIENTE');
  });

  it('la gracia es la de cada contrato', () => {
    const c = contrato('2025-08-02', '2026-08-01', { graceDays: 90 });
    expect(calcularCicloVida({ ...sinMovimiento, contratos: [c] }, ahora).ciclo).toBe('EN_RIESGO');
  });

  it('un contrato cancelado cuenta como ex-cliente', () => {
    const c = contrato('2026-01-01', '2027-12-31', { status: 'CANCELADO' });
    expect(calcularCicloVida({ ...sinMovimiento, contratos: [c] }, ahora).ciclo).toBe('EX_CLIENTE');
  });

  it('un contrato renovado deja al cliente en el estado del contrato que lo sigue', () => {
    const viejo = contrato('2025-01-01', '2025-12-31', { status: 'RENOVADO' });
    const nuevo = contrato('2026-01-01', '2027-12-31');
    expect(
      calcularCicloVida({ ...sinMovimiento, contratos: [viejo, nuevo], ultimaActividad: dia('2026-10-01') }, ahora).ciclo,
    ).toBe('CLIENTE');
  });
});

describe('calcularCicloVida: aceptó pero aún sin contrato', () => {
  const ganada = (cierre: string, historica = false) => ({
    closedAt: dia(cierre),
    outcome: 'GANADA',
    historica,
  });

  it('una oportunidad ganada sin contratos ya es cliente, por contratar', () => {
    const r = calcularCicloVida(
      { ...sinMovimiento, contratos: [], oportunidades: [ganada('2026-10-05')] },
      ahora,
    );
    expect(r.ciclo).toBe('CLIENTE');
    expect(r.contratoPendiente).toBe(true);
  });

  it('una oportunidad histórica ganada también cuenta mientras no haya contrato', () => {
    const r = calcularCicloVida(
      { ...sinMovimiento, contratos: [], oportunidades: [ganada('2026-10-05', true)] },
      ahora,
    );
    expect(r.ciclo).toBe('CLIENTE');
    expect(r.contratoPendiente).toBe(true);
  });

  it('con contrato vigente no queda pendiente', () => {
    const r = calcularCicloVida(
      {
        ...sinMovimiento,
        contratos: [contrato('2026-09-01', '2027-09-01')],
        oportunidades: [ganada('2026-08-20')],
        ultimaActividad: dia('2026-10-01'),
      },
      ahora,
    );
    expect(r.ciclo).toBe('CLIENTE');
    expect(r.contratoPendiente).toBeUndefined();
  });

  it('aceptó otro servicio después de que venció su último contrato: cliente por contratar', () => {
    const r = calcularCicloVida(
      {
        ...sinMovimiento,
        contratos: [contrato('2025-01-01', '2025-12-31', { graceDays: 15 })],
        oportunidades: [ganada('2026-10-01')],
      },
      ahora,
    );
    expect(r.ciclo).toBe('CLIENTE');
    expect(r.contratoPendiente).toBe(true);
  });

  it('la aceptación histórica no revive a un ex-cliente', () => {
    const r = calcularCicloVida(
      {
        ...sinMovimiento,
        contratos: [contrato('2025-01-01', '2025-12-31', { graceDays: 15 })],
        oportunidades: [ganada('2026-10-01', true)],
      },
      ahora,
    );
    expect(r.ciclo).toBe('EX_CLIENTE');
  });

  it('una aceptación anterior al contrato no lo marca pendiente', () => {
    const r = calcularCicloVida(
      {
        ...sinMovimiento,
        contratos: [contrato('2025-01-01', '2025-12-31', { graceDays: 15 })],
        oportunidades: [ganada('2024-12-20')],
      },
      ahora,
    );
    expect(r.ciclo).toBe('EX_CLIENTE');
  });
});

describe('graciaSugerida', () => {
  it('30 días si dura 6 meses o más, 15 si menos, 30 si no vence', () => {
    expect(graciaSugerida(dia('2026-01-01'), dia('2026-12-31'))).toBe(30);
    expect(graciaSugerida(dia('2026-01-01'), dia('2026-03-31'))).toBe(15);
    expect(graciaSugerida(dia('2026-01-01'), null)).toBe(30);
  });
});
