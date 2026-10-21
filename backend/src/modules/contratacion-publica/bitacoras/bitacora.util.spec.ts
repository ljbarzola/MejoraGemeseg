import {
  diferenciaMinutos,
  esFechaISO,
  normalizarHora,
  normalizarLectura,
} from './bitacora.util';
import {
  emparejarGuardia,
  similitudNombrePersona,
  similitudTexto,
} from './nombre-guardia.util';

describe('normalizarHora', () => {
  it.each([
    ['8', '08:00'],
    ['8:30', '08:30'],
    ['08:05', '08:05'],
    ['8h30', '08:30'],
    ['20.15', '20:15'],
    ['8 pm', '20:00'],
    ['12 am', '00:00'],
    ['24:00', '00:00'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(normalizarHora(entrada)).toBe(esperado);
  });

  it.each(['', 'mañana', '25:00', '10:75', null, undefined])(
    'descarta %p',
    (v) => {
      expect(normalizarHora(v)).toBeNull();
    },
  );
});

describe('diferenciaMinutos', () => {
  it('cuenta la vuelta a medianoche', () => {
    expect(diferenciaMinutos('23:50', '00:10')).toBe(20);
    expect(diferenciaMinutos('08:00', '08:45')).toBe(45);
  });
});

describe('esFechaISO', () => {
  it('solo fechas reales', () => {
    expect(esFechaISO('2026-09-28')).toBe(true);
    expect(esFechaISO('2026-02-30')).toBe(false);
    expect(esFechaISO('28/09/2026')).toBe(false);
  });
});

describe('normalizarLectura', () => {
  it('limpia lo que devuelve el modelo y avisa de lo que descarta', () => {
    const l = normalizarLectura({
      esBitacora: true,
      puesto: ' Garita   norte ',
      fechas: ['2026-09-28', 'ayer'],
      registros: [
        {
          fecha: '2026-09-28',
          guardia: 'Juan Pérez',
          horaEntrada: '8',
          horaSalida: '20:00',
        },
        {
          fecha: 'mal',
          guardia: 'Sin fecha',
          horaEntrada: '8',
          horaSalida: '9',
        },
        { fecha: '2026-09-28', guardia: '', horaEntrada: '8', horaSalida: '9' },
      ],
      novedades: [
        {
          fecha: '2026-09-28',
          hora: '14:30',
          texto: 'Ingresó camión de reparto',
          categoria: 'VEHICULOS',
        },
        { texto: 'Algo raro', categoria: 'INVENTADA' },
        { texto: '   ' },
      ],
    });
    expect(l.puesto).toBe('Garita norte');
    expect(l.fechas).toEqual(['2026-09-28']);
    expect(l.registros).toHaveLength(1);
    expect(l.registros[0].horaEntrada).toBe('08:00');
    expect(l.novedades.map((n) => n.categoria)).toEqual(['VEHICULOS', 'OTRO']);
    expect(l.observaciones).toContain('2 línea(s)');
  });

  it('una respuesta que no es un objeto no rompe', () => {
    expect(normalizarLectura('basura')).toEqual({
      esBitacora: true,
      puesto: null,
      fechas: [],
      registros: [],
      novedades: [],
      observaciones: null,
    });
  });

  it('respeta que el modelo diga que no es una bitácora', () => {
    expect(normalizarLectura({ esBitacora: false }).esBitacora).toBe(false);
  });
});

describe('emparejarGuardia', () => {
  const guardias = [
    { cedula: '1', nombre: 'Pérez Mora Juan Carlos' },
    { cedula: '2', nombre: 'Gómez Ruiz Pedro' },
  ];

  it('Nombre Apellido contra Apellidos Nombres', () => {
    expect(emparejarGuardia('Juan Pérez', guardias).guardia?.cedula).toBe('1');
    expect(emparejarGuardia('Pedro Gomez', guardias).guardia?.cedula).toBe('2');
  });

  it('tolera una letra mal leída', () => {
    expect(emparejarGuardia('Juan Peres', guardias).guardia?.cedula).toBe('1');
  });

  it('un nombre ajeno no coincide con nadie', () => {
    expect(emparejarGuardia('Luis Mendoza', guardias).guardia).toBeNull();
  });

  it('un solo nombre de pila no alcanza para estar seguro', () => {
    const e = emparejarGuardia('Juan', guardias);
    expect(e.guardia?.cedula).toBe('1');
    expect(e.coincidencia).toBeLessThan(0.85);
  });

  it('dos nombres tan parecidos que no se puede decidir', () => {
    const e = emparejarGuardia('Juan Pérez', [
      guardias[0],
      { cedula: '4', nombre: 'Pérez Lara Juan Pablo' },
    ]);
    expect(e.ambiguo).toBe(true);
  });
});

describe('similitudes', () => {
  it('nombres de persona', () => {
    expect(similitudNombrePersona('Ana Salazar', 'Salazar Vera Ana')).toBe(1);
    expect(similitudNombrePersona('Ana Salazar', 'Gómez Ruiz Pedro')).toBe(0);
  });
  it('texto libre', () => {
    expect(similitudTexto('GARITA NORTE', 'Garita Norte - planta')).toBe(1);
    expect(similitudTexto('Bodega central', 'Garita norte')).toBe(0);
  });
});
