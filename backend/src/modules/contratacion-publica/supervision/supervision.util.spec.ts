import {
  diasDelRango,
  diasSegunModo,
  diasSinVisita,
  estadoDelDia,
  fechaDeVisitaNoPermitida,
  horaValida,
  resumirCumplimiento,
} from './supervision.util';

describe('días del cronograma', () => {
  it('lista los días del rango, ambos incluidos, aunque cruce de mes', () => {
    expect(diasDelRango('2026-08-30', '2026-09-02')).toEqual(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
  });

  it('el relleno rápido por modo', () => {
    // 2026-11-02 es lunes
    expect(diasSegunModo('LUN_VIE', '2026-11-02', '2026-11-08')).toHaveLength(5);
    expect(diasSegunModo('FIN_SEMANA', '2026-11-02', '2026-11-08')).toEqual(['2026-11-07', '2026-11-08']);
    expect(diasSegunModo('TODOS', '2026-11-02', '2026-11-08')).toHaveLength(7);
    expect(diasSegunModo('NINGUNO', '2026-11-02', '2026-11-08')).toEqual([]);
  });
});

describe('estadoDelDia', () => {
  const hoy = '2026-11-10';
  it('planeada con visita = cumplida; sin visita y ya pasó = sin visita; hoy o futuro = pendiente', () => {
    expect(estadoDelDia({ planificado: true, visitas: 1, fecha: '2026-11-05', hoy })).toBe('CUMPLIDA');
    expect(estadoDelDia({ planificado: true, visitas: 0, fecha: '2026-11-05', hoy })).toBe('SIN_VISITA');
    expect(estadoDelDia({ planificado: true, visitas: 0, fecha: hoy, hoy })).toBe('PENDIENTE');
    expect(estadoDelDia({ planificado: true, visitas: 0, fecha: '2026-11-20', hoy })).toBe('PENDIENTE');
  });

  it('una visita en un día no planeado es extra; sin plan ni visita no hay estado', () => {
    expect(estadoDelDia({ planificado: false, visitas: 2, fecha: '2026-11-05', hoy })).toBe('EXTRA');
    expect(estadoDelDia({ planificado: false, visitas: 0, fecha: '2026-11-05', hoy })).toBeNull();
  });
});

describe('resumirCumplimiento', () => {
  it('el porcentaje cuenta solo lo que ya pasó', () => {
    const r = resumirCumplimiento(['CUMPLIDA', 'CUMPLIDA', 'SIN_VISITA', 'PENDIENTE', 'EXTRA', null]);
    expect(r).toEqual({ planificadas: 4, cumplidas: 2, sinVisita: 1, pendientes: 1, extras: 1, cumplimiento: 67 });
  });
  it('sin días pasados no hay porcentaje', () => {
    expect(resumirCumplimiento(['PENDIENTE']).cumplimiento).toBeNull();
  });
});

describe('reglas de la visita', () => {
  it('no se registra una visita futura ni de hace más de 3 días', () => {
    expect(fechaDeVisitaNoPermitida('2026-11-11', '2026-11-10')).toMatch(/todavía no llega/);
    expect(fechaDeVisitaNoPermitida('2026-11-06', '2026-11-10')).toMatch(/últimos 3 días/);
    expect(fechaDeVisitaNoPermitida('2026-11-07', '2026-11-10')).toBeNull();
    expect(fechaDeVisitaNoPermitida('2026-11-10', '2026-11-10')).toBeNull();
  });

  it('valida la hora', () => {
    expect(horaValida('07:30')).toBe(true);
    expect(horaValida('7:30')).toBe(true);
    expect(horaValida('25:00')).toBe(false);
    expect(horaValida(730)).toBe(false);
  });
});

describe('diasSinVisita', () => {
  it('lista los días planeados de los últimos n días que no tuvieron visita (sin contar hoy)', () => {
    const r = diasSinVisita({
      planeados: ['2026-11-04', '2026-11-05', '2026-11-08', '2026-11-09', '2026-11-10'],
      conVisita: new Set(['2026-11-05', '2026-11-09']),
      hoy: '2026-11-10',
      n: 5,
    });
    expect(r).toEqual(['2026-11-08']);
  });
});
