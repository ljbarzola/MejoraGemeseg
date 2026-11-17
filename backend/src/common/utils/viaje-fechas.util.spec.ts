import {
  diasDelMes,
  dondeFechaViaje,
  esMesValido,
  etiquetaMes,
  mesDeViaje,
  rangoDiasEcuador,
  ultimosMeses,
} from './viaje-fechas.util';

describe('viaje-fechas.util', () => {
  it('un viaje cuenta en el día y mes de Ecuador de su salida, o de su registro si no tiene salida', () => {
    // 2026-09-01 02:00 UTC = 2026-08-31 21:00 en Ecuador
    expect(mesDeViaje({ fechaHoraSalida: new Date('2026-09-01T02:00:00Z'), createdAt: new Date('2026-10-01T00:00:00Z') })).toBe('2026-08');
    expect(mesDeViaje({ fechaHoraSalida: null, createdAt: new Date('2026-10-15T12:00:00Z') })).toBe('2026-10');
  });

  it('el rango de días cubre desde las 00:00 de Ecuador del primer día hasta el último instante del último', () => {
    const r = rangoDiasEcuador('2026-08-01', '2026-08-31');
    expect(r.gte?.toISOString()).toBe('2026-08-01T05:00:00.000Z');
    expect(r.lte?.toISOString()).toBe('2026-09-01T04:59:59.999Z');
  });

  it('sin rango no filtra; con rango mira la salida y, si falta, el registro', () => {
    expect(dondeFechaViaje({})).toEqual({});
    const r = rangoDiasEcuador('2026-08-01', '2026-08-31');
    expect(dondeFechaViaje(r)).toEqual({ OR: [{ fechaHoraSalida: r }, { fechaHoraSalida: null, createdAt: r }] });
  });

  it('meses: validación, últimos N, días del mes y etiqueta', () => {
    expect(esMesValido('2026-11')).toBe(true);
    expect(esMesValido('2026-13')).toBe(false);
    expect(esMesValido('26-11')).toBe(false);
    expect(ultimosMeses('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(diasDelMes('2028-02')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(etiquetaMes('2026-11')).toBe('nov 26');
  });
});
