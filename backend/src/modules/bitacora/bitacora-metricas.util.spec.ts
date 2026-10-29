import {
  calcularMetricas,
  desdeDelPeriodo,
  EventoMetrica,
  resolverPeriodo,
} from './bitacora-metricas.util';

// Ecuador = UTC-5: 08:00 de Ecuador son las 13:00 UTC.
const ev = (
  userId: number,
  utc: string,
  fuente = 'APP',
  modulo = 'tasks',
): EventoMetrica => ({
  userId,
  fuente,
  modulo,
  ocurridoEn: new Date(utc),
});

describe('resolverPeriodo', () => {
  it.each([7, 14, 30, '14', '30'])('acepta %p', (v) => {
    expect(resolverPeriodo(v)).toBe(Number(v));
  });

  it.each([undefined, null, '', 'abc', 5, 60, -7])(
    'cualquier otra cosa (%p) vuelve a 7 días',
    (v) => {
      expect(resolverPeriodo(v)).toBe(7);
    },
  );
});

describe('desdeDelPeriodo', () => {
  it('el período termina hoy y empieza N-1 días antes', () => {
    expect(desdeDelPeriodo(7, '2026-10-27')).toBe('2026-10-21');
    expect(desdeDelPeriodo(30, '2026-10-27')).toBe('2026-09-28');
    expect(desdeDelPeriodo(1, '2026-10-27')).toBe('2026-10-27');
  });
});

describe('calcularMetricas', () => {
  const eventos = [
    ev(1, '2026-10-26T13:00:00Z'), // 08:00 del 26
    ev(1, '2026-10-26T22:00:00Z', 'GOOGLE', 'drive'), // 17:00 del 26
    ev(2, '2026-10-26T14:00:00Z', 'APP', 'ventas'), // 09:00 del 26
    ev(1, '2026-10-27T13:30:00Z'), // 08:30 del 27
    ev(1, '2026-10-25T15:00:00Z'), // 25: fuera del período
  ];
  const m = calcularMetricas(eventos, '2026-10-26', 2, 5);

  it('cuenta por día las personas con actividad y los eventos de la app y de Google', () => {
    expect(m.porDia).toEqual([
      {
        fecha: '2026-10-26',
        personasConActividad: 2,
        eventosApp: 2,
        eventosGoogle: 1,
        eventosWeb: 0,
      },
      {
        fecha: '2026-10-27',
        personasConActividad: 1,
        eventosApp: 1,
        eventosGoogle: 0,
        eventosWeb: 0,
      },
    ]);
  });

  it('los sitios web de la extensión se cuentan aparte y también cuentan como actividad', () => {
    const conWeb = calcularMetricas(
      [
        ev(1, '2026-10-26T13:00:00Z'),
        ev(2, '2026-10-26T14:00:00Z', 'EXTENSION', 'web'),
        ev(2, '2026-10-26T14:05:00Z', 'EXTENSION', 'web'),
        ev(3, '2026-10-27T15:00:00Z', 'EXTENSION', 'web'),
      ],
      '2026-10-26',
      2,
      3,
    );
    expect(conWeb.porDia[0]).toMatchObject({
      personasConActividad: 2,
      eventosApp: 1,
      eventosGoogle: 0,
      eventosWeb: 2,
    });
    // Una persona que solo navegó ese día también cuenta como «con actividad».
    expect(conWeb.porDia[1]).toMatchObject({
      personasConActividad: 1,
      eventosWeb: 1,
    });
    expect(conWeb.resumen.eventos).toBe(4);
    expect(conWeb.resumen.diasConActividad).toBe(2);
    expect(conWeb.porModulo[0]).toEqual({
      modulo: 'web',
      etiqueta: 'Navegador',
      eventos: 3,
    });
  });

  it('ignora lo que cae fuera del período', () => {
    expect(m.resumen.eventos).toBe(4);
  });

  it('promedio diario de personas con actividad y días con actividad', () => {
    expect(m.resumen.promedioPersonasConActividad).toBe(1.5);
    expect(m.resumen.diasConActividad).toBe(2);
  });

  it('hora media de la primera y de la última actividad de cada persona en cada día', () => {
    // Primeras: 08:00, 09:00, 08:30 → 08:30. Últimas: 17:00, 09:00, 08:30 → 11:30.
    expect(m.resumen.horaMediaInicio).toBe('08:30');
    expect(m.resumen.horaMediaFin).toBe('11:30');
  });

  it('eventos por hora del día de Ecuador', () => {
    expect(m.porHora).toHaveLength(24);
    expect(m.porHora[8]).toBe(2);
    expect(m.porHora[9]).toBe(1);
    expect(m.porHora[17]).toBe(1);
    expect(m.porHora.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('eventos por módulo, de mayor a menor, con su nombre legible', () => {
    expect(m.porModulo).toEqual([
      { modulo: 'tasks', etiqueta: 'Tareas', eventos: 2 },
      { modulo: 'drive', etiqueta: 'Drive', eventos: 1 },
      { modulo: 'ventas', etiqueta: 'Ventas y CRM', eventos: 1 },
    ]);
  });

  it('devuelve el rango y las personas con hoja activa que se le pasaron', () => {
    expect(m).toMatchObject({
      dias: 2,
      desde: '2026-10-26',
      hasta: '2026-10-27',
      personasActivas: 5,
    });
  });

  it('un evento de las 23:59 de Ecuador cuenta en ese día y no en el siguiente', () => {
    const r = calcularMetricas(
      [ev(1, '2026-10-28T04:59:00Z')],
      '2026-10-27',
      2,
      1,
    );
    expect(r.porDia[0].eventosApp).toBe(1);
    expect(r.porDia[1].eventosApp).toBe(0);
    expect(r.porHora[23]).toBe(1);
  });

  it('sin eventos no inventa nada: ceros y horas medias nulas', () => {
    const r = calcularMetricas([], '2026-10-21', 7, 0);
    expect(r.porDia).toHaveLength(7);
    expect(r.porDia.every((d) => d.eventosApp + d.eventosGoogle === 0)).toBe(
      true,
    );
    expect(r.resumen).toEqual({
      eventos: 0,
      promedioPersonasConActividad: 0,
      horaMediaInicio: null,
      horaMediaFin: null,
      diasConActividad: 0,
    });
    expect(r.porModulo).toEqual([]);
  });

  it('muestra como mucho los 8 módulos con más eventos', () => {
    const muchos = Array.from({ length: 10 }, (_, i) =>
      ev(1, '2026-10-26T13:00:00Z', 'APP', `mod${i}`),
    );
    expect(calcularMetricas(muchos, '2026-10-26', 1, 1).porModulo).toHaveLength(
      8,
    );
  });
});
