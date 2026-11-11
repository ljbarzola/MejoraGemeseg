import {
  cedulaDeHallazgoAusente,
  diaAnterior,
  MAX_SUGERENCIAS,
  sugerirReemplazos,
  type EntradaReemplazo,
} from './reemplazo-sugerido.util';

const codigos = {
  D: { nombre: 'Día', esDescanso: false, horaInicio: '07:00', horaFin: '19:00' },
  N: { nombre: 'Noche', esDescanso: false, horaInicio: '19:00', horaFin: '07:00' },
  L: { nombre: 'Libre', esDescanso: true, horaInicio: null, horaFin: null },
};

const g = (cedula: string, nombre: string, puestoId = 1, puestoNombre = 'Garita') => ({
  cedula,
  nombre,
  puestoId,
  puestoNombre,
});

function entrada(parcial: Partial<EntradaReemplazo> = {}): EntradaReemplazo {
  return {
    fecha: '2026-08-18',
    puestoId: 1,
    ausenteCedula: '22',
    guardias: [],
    celdas: [],
    codigos,
    presentes: [],
    ...parcial,
  };
}

describe('sugerirReemplazos', () => {
  it('propone a quien tenía descanso ese día y no a quien tenía turno', () => {
    const r = sugerirReemplazos(
      entrada({
        guardias: [g('23', 'Lara'), g('26', 'Ruiz')],
        celdas: [
          { fecha: '2026-08-18', cedula: '23', codigo: 'L' },
          { fecha: '2026-08-18', cedula: '26', codigo: 'D' },
        ],
      }),
    );
    expect(r.map((x) => x.nombre)).toEqual(['Lara']);
    expect(r[0].motivo).toBe('Tenía descanso (L) ese día');
  });

  it('no propone a quien faltó ni a quien ya aparece en la bitácora', () => {
    const r = sugerirReemplazos(
      entrada({
        guardias: [g('21', 'Toro'), g('22', 'Godoy'), g('23', 'Lara')],
        presentes: ['21'],
      }),
    );
    expect(r.map((x) => x.nombre)).toEqual(['Lara']);
  });

  it('quien no tiene ninguna celda ese día se propone, como «sin turno»', () => {
    const r = sugerirReemplazos(entrada({ guardias: [g('24', 'Cedeño')] }));
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe('No tenía turno ese día');
  });

  it('ordena: mismo puesto antes que otro, descanso antes que sin turno, sin aviso antes que con aviso', () => {
    const r = sugerirReemplazos(
      entrada({
        guardias: [
          g('30', 'Otro puesto libre', 2, 'Emergencia'),
          g('31', 'Mismo puesto sin turno'),
          g('32', 'Mismo puesto libre con aviso'),
          g('33', 'Mismo puesto libre'),
        ],
        celdas: [
          { fecha: '2026-08-18', cedula: '30', codigo: 'L' },
          { fecha: '2026-08-18', cedula: '32', codigo: 'L' },
          { fecha: '2026-08-17', cedula: '32', codigo: 'N' },
          { fecha: '2026-08-18', cedula: '33', codigo: 'L' },
        ],
      }),
    );
    expect(r.map((x) => x.nombre)).toEqual([
      'Mismo puesto libre',
      'Mismo puesto libre con aviso',
      'Mismo puesto sin turno',
      'Otro puesto libre',
    ]);
  });

  it('avisa cuando el guardia trabajó de noche el día anterior, y no cuando fue de día', () => {
    const r = sugerirReemplazos(
      entrada({
        guardias: [g('40', 'De noche'), g('41', 'De día')],
        celdas: [
          { fecha: '2026-08-18', cedula: '40', codigo: 'L' },
          { fecha: '2026-08-17', cedula: '40', codigo: 'N' },
          { fecha: '2026-08-18', cedula: '41', codigo: 'L' },
          { fecha: '2026-08-17', cedula: '41', codigo: 'D' },
        ],
      }),
    );
    expect(r.find((x) => x.nombre === 'De noche')?.aviso).toMatch(/turno de noche/);
    expect(r.find((x) => x.nombre === 'De día')?.aviso).toBeNull();
  });

  it('un guardia repetido en dos puestos aparece una sola vez', () => {
    const r = sugerirReemplazos(entrada({ guardias: [g('50', 'Doble'), g('50', 'Doble', 2, 'Emergencia')] }));
    expect(r).toHaveLength(1);
  });

  it(`devuelve como mucho ${MAX_SUGERENCIAS}`, () => {
    const guardias = Array.from({ length: 12 }, (_, i) => g(String(100 + i), `Guardia ${i}`));
    expect(sugerirReemplazos(entrada({ guardias }))).toHaveLength(MAX_SUGERENCIAS);
  });

  it('si todos tienen turno, no propone a nadie', () => {
    const r = sugerirReemplazos(
      entrada({
        guardias: [g('60', 'Uno'), g('61', 'Dos')],
        celdas: [
          { fecha: '2026-08-18', cedula: '60', codigo: 'D' },
          { fecha: '2026-08-18', cedula: '61', codigo: 'N' },
        ],
      }),
    );
    expect(r).toEqual([]);
  });
});

describe('diaAnterior', () => {
  it('resta un día, también al cambiar de mes y de año', () => {
    expect(diaAnterior('2026-08-18')).toBe('2026-08-17');
    expect(diaAnterior('2026-09-01')).toBe('2026-08-31');
    expect(diaAnterior('2026-01-01')).toBe('2025-12-31');
  });
});

describe('cedulaDeHallazgoAusente', () => {
  it('saca la cédula de la clave del hallazgo de ausencia', () => {
    expect(cedulaDeHallazgoAusente('GUARDIA_AUSENTE|2026-08-18|1700000022')).toBe('1700000022');
  });

  it('devuelve null para otros tipos de hallazgo', () => {
    expect(cedulaDeHallazgoAusente('GUARDIA_DISTINTO|2026-08-18|1>x')).toBeNull();
    expect(cedulaDeHallazgoAusente('NO_HORARIO|2026-08-18|')).toBeNull();
  });
});
