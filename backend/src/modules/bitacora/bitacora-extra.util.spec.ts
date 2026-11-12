import {
  calcularSaldo,
  cierreAutomatico,
  errorDeReglas,
  minutosActivos,
  minutosContados,
  minutosDeExtra,
} from './bitacora-extra.util';
import { validarTramos } from './bitacora-extension.util';

// Lunes a viernes de 08:00 a 17:00, hora de Ecuador (UTC-5).
const HORARIO = { dias: [1, 2, 3, 4, 5], inicio: '08:00', fin: '17:00' };

// Miércoles 28 de octubre de 2026. «hora(17, 5)» = 17:05 en Ecuador.
const hora = (h: number, m = 0): Date =>
  new Date(Date.UTC(2026, 9, 28, h + 5, m));

/** Un evento de actividad por minuto entre dos horas (ambas incluidas al inicio, excluida la final). */
const activoEntre = (desde: Date, hasta: Date) =>
  minutosActivos(
    Array.from(
      { length: Math.round((hasta.getTime() - desde.getTime()) / 60_000) },
      (_, i) => ({
        ocurridoEn: new Date(desde.getTime() + i * 60_000),
        fuente: 'EXTENSION',
        minutos: 1,
      }),
    ),
  );

describe('minutosActivos', () => {
  it('un tramo del navegador cubre todos sus minutos y una acción en la app, uno', () => {
    const activos = minutosActivos([
      { ocurridoEn: hora(17, 0), fuente: 'EXTENSION', minutos: 3 },
      { ocurridoEn: hora(17, 10), fuente: 'APP', minutos: null },
    ]);
    expect(activos.size).toBe(4);
  });
});

describe('cierreAutomatico', () => {
  it('se cierra sola cuando pasan los minutos de inactividad, terminando donde acabó la última actividad', () => {
    const activos = activoEntre(hora(17, 5), hora(17, 31));
    const r = cierreAutomatico({
      inicio: hora(17, 5),
      ahora: hora(17, 50),
      activos,
      horario: HORARIO,
      inactividadMinutos: 15,
    });
    expect(r?.motivo).toBe('INACTIVIDAD');
    expect(r?.fin.toISOString()).toBe(hora(17, 31).toISOString());
  });

  it('con una inactividad mayor sigue abierta (es configurable)', () => {
    const activos = activoEntre(hora(17, 5), hora(17, 31));
    const r = cierreAutomatico({
      inicio: hora(17, 5),
      ahora: hora(17, 50),
      activos,
      horario: HORARIO,
      inactividadMinutos: 30,
    });
    expect(r).toBeNull();
  });

  it('si llegó antes, se cierra cuando empieza el horario normal', () => {
    const activos = activoEntre(hora(7, 30), hora(8, 10));
    const r = cierreAutomatico({
      inicio: hora(7, 30),
      ahora: hora(8, 10),
      activos,
      horario: HORARIO,
      inactividadMinutos: 15,
    });
    expect(r?.motivo).toBe('HORARIO');
    expect(r?.fin.toISOString()).toBe(hora(8, 0).toISOString());
  });

  it('sigue vigente mientras haya actividad', () => {
    const activos = activoEntre(hora(17, 5), hora(18, 30));
    const r = cierreAutomatico({
      inicio: hora(17, 5),
      ahora: hora(18, 30),
      activos,
      horario: HORARIO,
      inactividadMinutos: 15,
    });
    expect(r).toBeNull();
  });

  it('tiene un tope de duración', () => {
    const inicio = hora(17, 0);
    const r = cierreAutomatico({
      inicio,
      ahora: new Date(inicio.getTime() + 12 * 3_600_000),
      activos: activoEntre(inicio, new Date(inicio.getTime() + 12 * 3_600_000)),
      horario: HORARIO,
      inactividadMinutos: 15,
      maximoMinutos: 120,
    });
    expect(r?.motivo).toBe('LIMITE');
    expect(r?.fin.toISOString()).toBe(hora(19, 0).toISOString());
  });
});

describe('minutosDeExtra', () => {
  it('al llegar antes solo cuentan los minutos anteriores al horario', () => {
    const activos = activoEntre(hora(7, 30), hora(8, 10));
    expect(
      minutosDeExtra({
        inicio: hora(7, 30),
        fin: hora(8, 10),
        activos,
        horario: HORARIO,
      }),
    ).toBe(30);
  });

  it('al quedarse después cuentan los minutos posteriores a la salida', () => {
    const activos = activoEntre(hora(16, 50), hora(17, 40));
    expect(
      minutosDeExtra({
        inicio: hora(16, 50),
        fin: hora(17, 40),
        activos,
        horario: HORARIO,
      }),
    ).toBe(40);
  });

  it('lo que no tiene actividad no cuenta, aunque la ventana estuviera abierta', () => {
    const activos = activoEntre(hora(17, 0), hora(17, 20));
    expect(
      minutosDeExtra({
        inicio: hora(17, 0),
        fin: hora(18, 0),
        activos,
        horario: HORARIO,
      }),
    ).toBe(20);
  });

  it('un sábado todo es tiempo extra', () => {
    const sabado = (h: number) => new Date(Date.UTC(2026, 9, 31, h + 5, 0));
    expect(
      minutosDeExtra({
        inicio: sabado(10),
        fin: sabado(11),
        activos: activoEntre(sabado(10), sabado(11)),
        horario: HORARIO,
      }),
    ).toBe(60);
  });
});

describe('tolerancia', () => {
  it('por debajo de la tolerancia no suma nada; desde ella, suma todo', () => {
    expect(minutosContados(5, 10)).toBe(0);
    expect(minutosContados(9, 10)).toBe(0);
    expect(minutosContados(10, 10)).toBe(10);
    expect(minutosContados(45, 10)).toBe(45);
    expect(minutosContados(3, 0)).toBe(3);
    expect(minutosContados(0, 0)).toBe(0);
  });
});

describe('calcularSaldo', () => {
  it('suma lo aprobado, resta lo que se debe y deja lo pendiente aparte', () => {
    const s = calcularSaldo(
      [
        { estado: 'APROBADA', minutosContados: 120 },
        { estado: 'APROBADA', minutosContados: 30 },
        { estado: 'PENDIENTE', minutosContados: 45 },
        { estado: 'RECHAZADA', minutosContados: 60 },
        { estado: 'SIN_TIEMPO', minutosContados: 0 },
      ],
      [{ minutos: 60 }, { minutos: 15 }],
    );
    expect(s).toEqual({
      abonadoMinutos: 150,
      deudaMinutos: 75,
      saldoMinutos: 75,
      pendienteMinutos: 45,
    });
  });

  it('el saldo puede ser negativo (debe horas)', () => {
    expect(calcularSaldo([], [{ minutos: 90 }]).saldoMinutos).toBe(-90);
  });
});

describe('errorDeReglas', () => {
  it('acepta valores dentro de los límites y rechaza el resto', () => {
    expect(errorDeReglas({ toleranciaMinutos: 10, inactividadMinutos: 15 })).toBeNull();
    expect(errorDeReglas({})).toBeNull();
    expect(errorDeReglas({ toleranciaMinutos: 61 })).toMatch(/tolerancia/);
    expect(errorDeReglas({ toleranciaMinutos: -1 })).toMatch(/tolerancia/);
    expect(errorDeReglas({ inactividadMinutos: 5 })).toMatch(/inactividad/);
    expect(errorDeReglas({ inactividadMinutos: 121 })).toMatch(/inactividad/);
  });
});

describe('validarTramos con ventanas de tiempo extra', () => {
  const ahora = hora(18, 30);
  const tramo = (h: number, m: number, minutos = 5) => ({
    dominio: 'ejemplo.com',
    inicio: hora(h, m).toISOString(),
    minutos,
  });

  it('fuera del horario se descarta si no hay ventana', () => {
    const r = validarTramos([tramo(18, 0)], HORARIO, null, ahora);
    expect(r.validos).toHaveLength(0);
    expect(r.descartados).toBe(1);
  });

  it('fuera del horario se acepta dentro de una ventana abierta', () => {
    const r = validarTramos([tramo(18, 0)], HORARIO, null, ahora, [
      { inicio: hora(17, 5), fin: null },
    ]);
    expect(r.validos).toHaveLength(1);
  });

  it('un tramo posterior al cierre de la ventana se descarta', () => {
    const r = validarTramos([tramo(18, 0)], HORARIO, null, ahora, [
      { inicio: hora(17, 5), fin: hora(17, 40) },
    ]);
    expect(r.validos).toHaveLength(0);
  });
});
