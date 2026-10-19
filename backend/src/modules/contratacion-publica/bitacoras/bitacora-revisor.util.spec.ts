import {
  revisarBitacora,
  type CodigoTurnoInfo,
  type EntradaRevision,
} from './bitacora-revisor.util';

const JUAN = { cedula: '1', nombre: 'Pérez Mora Juan Carlos' };
const PEDRO = { cedula: '2', nombre: 'Gómez Ruiz Pedro' };
const ANA = { cedula: '3', nombre: 'Salazar Vera Ana' };

const codigos: Record<string, CodigoTurnoInfo> = {
  D: {
    nombre: 'Día',
    esDescanso: false,
    horaInicio: '08:00',
    horaFin: '20:00',
  },
  N: {
    nombre: 'Noche',
    esDescanso: false,
    horaInicio: '20:00',
    horaFin: '08:00',
  },
  L: { nombre: 'Libre', esDescanso: true, horaInicio: null, horaFin: null },
};

function base(extra: Partial<EntradaRevision> = {}): EntradaRevision {
  return {
    fechas: ['2026-09-28'],
    registros: [],
    guardiasPuesto: [JUAN, PEDRO, ANA],
    celdas: [
      { fecha: '2026-09-28', cedula: '1', nombre: JUAN.nombre, codigo: 'D' },
      { fecha: '2026-09-28', cedula: '2', nombre: PEDRO.nombre, codigo: 'L' },
      { fecha: '2026-09-28', cedula: '3', nombre: ANA.nombre, codigo: 'N' },
    ],
    horarioPorFecha: { '2026-09-28': 'APROBADO' },
    codigos,
    contrato: { fechaInicio: '2026-01-01', fechaFin: '2026-12-31' },
    puestoNombre: 'Garita norte',
    entidadNombre: 'Municipio de Ejemplo',
    puestoLeido: null,
    fechasYaCargadas: {},
    ...extra,
  };
}

const linea = (
  guardia: string,
  entrada: string | null,
  salida: string | null,
  legible = true,
) => ({
  fecha: '2026-09-28',
  guardia,
  horaEntrada: entrada,
  horaSalida: salida,
  legible,
});

const tipos = (e: EntradaRevision) =>
  revisarBitacora(e).hallazgos.map((h) => h.tipo);

describe('revisarBitacora', () => {
  it('conforme: estuvieron quienes debían, en su horario', () => {
    const r = revisarBitacora(
      base({
        registros: [
          linea('Juan Pérez', '08:00', '20:00'),
          linea('Ana Salazar', '20:00', '08:00'),
        ],
      }),
    );
    expect(r.hallazgos).toEqual([]);
    expect(r.resultado).toBe('CONFORME');
  });

  it('el caso de la usuaria: el horario decía Juan y la bitácora trae a Pedro (que estaba libre)', () => {
    const r = revisarBitacora(
      base({
        registros: [
          linea('Pedro Gómez', '08:00', '20:00'),
          linea('Ana Salazar', '20:00', '08:00'),
        ],
      }),
    );
    const h = r.hallazgos.find((x) => x.tipo === 'GUARDIA_DISTINTO');
    expect(h).toBeDefined();
    expect(h!.severidad).toBe('ALTA');
    expect(h!.mensaje).toContain('28/09');
    expect(h!.mensaje).toContain('Pérez Mora Juan Carlos');
    expect(h!.mensaje).toContain('Gómez Ruiz Pedro');
    expect(h!.mensaje).toContain('Libre (L)');
    expect(h!.mensaje).toContain('turno D de 08:00 a 20:00');
    // Es UN hallazgo, no uno por la ausencia de Juan y otro por la presencia de Pedro.
    expect(r.hallazgos.filter((x) => x.severidad === 'ALTA')).toHaveLength(1);
    expect(r.resultado).toBe('CON_ERRORES');
  });

  it('un guardia que le tocaba y no aparece', () => {
    expect(
      tipos(base({ registros: [linea('Ana Salazar', '20:00', '08:00')] })),
    ).toEqual(['GUARDIA_AUSENTE']);
  });

  it('alguien que no es del puesto reemplazando al guardia', () => {
    const r = revisarBitacora(
      base({
        registros: [
          linea('Luis Mendoza', '08:00', '20:00'),
          linea('Ana Salazar', '20:00', '08:00'),
        ],
      }),
    );
    expect(r.hallazgos.map((h) => h.tipo)).toEqual(['GUARDIA_DISTINTO']);
    expect(r.hallazgos[0].mensaje).toContain(
      'no es ninguno de los guardias asignados',
    );
  });

  it('un guardia de más, sin nadie a quien reemplazar', () => {
    const r = revisarBitacora(
      base({
        registros: [
          linea('Juan Pérez', '08:00', '20:00'),
          linea('Ana Salazar', '20:00', '08:00'),
          linea('Pedro Gómez', '08:00', '20:00'),
        ],
      }),
    );
    expect(r.hallazgos.map((h) => h.tipo)).toEqual(['GUARDIA_NO_PROGRAMADO']);
  });

  it('horas fuera de la tolerancia del turno', () => {
    const r = revisarBitacora(
      base({
        registros: [
          linea('Juan Pérez', '08:00', '10:00'),
          linea('Ana Salazar', '20:10', '08:00'),
        ],
      }),
    );
    expect(r.hallazgos.map((h) => h.tipo)).toEqual(['HORARIO_DISTINTO']);
    expect(r.hallazgos[0].mensaje).toContain('08:00–10:00');
    expect(r.hallazgos[0].mensaje).toContain('turno D de 08:00 a 20:00');
    expect(r.resultado).toBe('A_REVISAR');
  });

  it('el turno de noche cruza la medianoche sin dar falsos errores', () => {
    const r = revisarBitacora(
      base({
        registros: [
          linea('Juan Pérez', '08:00', '20:00'),
          linea('Ana Salazar', '19:50', '08:20'),
        ],
      }),
    );
    expect(r.hallazgos).toEqual([]);
  });

  it('sin horas leídas avisa pero no es un error', () => {
    const r = revisarBitacora(
      base({
        registros: [
          linea('Juan Pérez', null, null),
          linea('Ana Salazar', '20:00', '08:00'),
        ],
      }),
    );
    expect(r.hallazgos.map((h) => h.tipo)).toEqual(['SIN_HORAS']);
    expect(r.hallazgos[0].severidad).toBe('BAJA');
  });

  it('sin horario cargado ese día no inventa errores', () => {
    const r = revisarBitacora(
      base({
        horarioPorFecha: {},
        registros: [linea('Juan Pérez', '08:00', '20:00')],
      }),
    );
    expect(r.hallazgos.map((h) => h.tipo)).toEqual(['NO_HORARIO']);
    expect(r.resultado).toBe('SIN_COMPARAR');
  });

  it('un horario en borrador se compara, pero se avisa', () => {
    const r = revisarBitacora(
      base({
        horarioPorFecha: { '2026-09-28': 'BORRADOR' },
        registros: [
          linea('Juan Pérez', '08:00', '20:00'),
          linea('Ana Salazar', '20:00', '08:00'),
        ],
      }),
    );
    expect(r.hallazgos.map((h) => h.tipo)).toEqual(['HORARIO_NO_APROBADO']);
    expect(r.resultado).toBe('A_REVISAR');
  });

  it('un nombre corto que podría ser de dos guardias se marca ambiguo', () => {
    const r = revisarBitacora(
      base({
        guardiasPuesto: [
          JUAN,
          { cedula: '4', nombre: 'Pérez Lara Juan Pablo' },
          ANA,
        ],
        registros: [
          linea('Juan Pérez', '08:00', '20:00'),
          linea('Ana Salazar', '20:00', '08:00'),
        ],
      }),
    );
    expect(r.hallazgos.map((h) => h.tipo)).toContain('NOMBRE_AMBIGUO');
  });

  it('una línea marcada ilegible se avisa', () => {
    const r = revisarBitacora(
      base({
        registros: [
          linea('Juan Pérez', '08:00', '20:00', false),
          linea('Ana Salazar', '20:00', '08:00'),
        ],
      }),
    );
    expect(r.hallazgos.map((h) => h.tipo)).toEqual(['LECTURA_DUDOSA']);
  });

  it('la hoja dice otro puesto', () => {
    const r = revisarBitacora(
      base({
        puestoLeido: 'Bodega central',
        registros: [
          linea('Juan Pérez', '08:00', '20:00'),
          linea('Ana Salazar', '20:00', '08:00'),
        ],
      }),
    );
    expect(r.hallazgos.map((h) => h.tipo)).toEqual(['PUESTO_DISTINTO']);
  });

  it('el puesto escrito casi igual no molesta', () => {
    const r = revisarBitacora(
      base({
        puestoLeido: 'GARITA NORTE',
        registros: [
          linea('Juan Pérez', '08:00', '20:00'),
          linea('Ana Salazar', '20:00', '08:00'),
        ],
      }),
    );
    expect(r.hallazgos).toEqual([]);
  });

  it('fecha fuera del contrato y fecha ya cargada', () => {
    const r = revisarBitacora(
      base({
        contrato: { fechaInicio: '2026-10-01', fechaFin: '2026-12-31' },
        fechasYaCargadas: { '2026-09-28': 7 },
        registros: [
          linea('Juan Pérez', '08:00', '20:00'),
          linea('Ana Salazar', '20:00', '08:00'),
        ],
      }),
    );
    expect(r.hallazgos.map((h) => h.tipo).sort()).toEqual([
      'FECHA_FUERA_DE_CONTRATO',
      'FECHA_YA_CARGADA',
    ]);
  });

  it('las claves de los hallazgos son estables entre revisiones', () => {
    const e = base({
      registros: [
        linea('Pedro Gómez', '08:00', '20:00'),
        linea('Ana Salazar', '20:00', '08:00'),
      ],
    });
    const a = revisarBitacora(e).hallazgos.map((h) => h.clave);
    const b = revisarBitacora(e).hallazgos.map((h) => h.clave);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('devuelve lo que decía el horario para mostrarlo junto a lo leído', () => {
    const r = revisarBitacora(base({ registros: [] }));
    expect(
      r.esperadoPorFecha['2026-09-28'].map((e) => `${e.nombre}:${e.codigo}`),
    ).toEqual([
      'Pérez Mora Juan Carlos:D',
      'Gómez Ruiz Pedro:L',
      'Salazar Vera Ana:N',
    ]);
  });
});
