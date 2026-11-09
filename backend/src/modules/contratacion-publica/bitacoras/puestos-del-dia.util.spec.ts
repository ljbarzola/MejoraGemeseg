import {
  armarPuestosDelDia,
  diasAnteriores,
  DIAS_VENTANA_BITACORAS,
  type EntradaPuestosDelDia,
} from './puestos-del-dia.util';

const codigos = {
  D: { nombre: 'Día', esDescanso: false, horaInicio: '07:00', horaFin: '19:00' },
  N: { nombre: 'Noche', esDescanso: false, horaInicio: '19:00', horaFin: '07:00' },
  L: { nombre: 'Libre', esDescanso: true, horaInicio: null, horaFin: null },
};

const puesto = (id: number, nombre: string, minimo = 1, contratoId = 1) => ({
  id,
  nombre,
  contratoId,
  contratoNumero: `CTR-${contratoId}`,
  entidadNombre: 'Hospital',
  minimo,
});

function entrada(parcial: Partial<EntradaPuestosDelDia> = {}): EntradaPuestosDelDia {
  return {
    fecha: '2026-11-05',
    puestos: [puesto(1, 'Garita')],
    horariosHoy: [{ contratoId: 1, estado: 'APROBADO' }],
    celdasHoy: [],
    codigos,
    celdasPasadas: [],
    bitacoras: [],
    ...parcial,
  };
}

describe('armarPuestosDelDia', () => {
  it('separa a quien debe estar hoy de quien tiene descanso, con las horas de su turno', () => {
    const { puestos } = armarPuestosDelDia(
      entrada({
        celdasHoy: [
          { puestoId: 1, cedula: '1', nombre: 'Godoy', codigo: 'D' },
          { puestoId: 1, cedula: '2', nombre: 'Toro', codigo: 'L' },
        ],
      }),
    );
    expect(puestos[0].trabajando).toEqual([
      { cedula: '1', nombre: 'Godoy', codigo: 'D', horaInicio: '07:00', horaFin: '19:00', ausencia: null },
    ]);
    expect(puestos[0].libres.map((l) => l.nombre)).toEqual(['Toro']);
    expect(puestos[0].cobertura).toBe('CUBIERTO');
  });

  it('marca «sin cubrir» cuando hay menos guardias trabajando que el mínimo', () => {
    const { puestos, resumen } = armarPuestosDelDia(
      entrada({
        puestos: [puesto(1, 'Garita', 2)],
        celdasHoy: [{ puestoId: 1, cedula: '1', nombre: 'Godoy', codigo: 'D' }],
      }),
    );
    expect(puestos[0].cobertura).toBe('SIN_CUBRIR');
    expect(resumen.sinCubrir).toBe(1);
  });

  it('un puesto sin horario que cubra hoy queda «sin horario»', () => {
    const { puestos, resumen } = armarPuestosDelDia(entrada({ horariosHoy: [] }));
    expect(puestos[0].cobertura).toBe('SIN_HORARIO');
    expect(puestos[0].horarioEstado).toBeNull();
    expect(resumen.sinHorario).toBe(1);
  });

  it('un horario sin aprobar se muestra, pero no cuenta como cubierto', () => {
    const { puestos } = armarPuestosDelDia(
      entrada({
        horariosHoy: [{ contratoId: 1, estado: 'BORRADOR' }],
        celdasHoy: [{ puestoId: 1, cedula: '1', nombre: 'Godoy', codigo: 'D' }],
      }),
    );
    expect(puestos[0].cobertura).toBe('HORARIO_NO_APROBADO');
  });

  it('si hay varios horarios que cubren hoy, manda el de mejor estado', () => {
    const { puestos } = armarPuestosDelDia(
      entrada({
        horariosHoy: [
          { contratoId: 1, estado: 'BORRADOR' },
          { contratoId: 1, estado: 'APROBADO' },
        ],
        celdasHoy: [{ puestoId: 1, cedula: '1', nombre: 'Godoy', codigo: 'D' }],
      }),
    );
    expect(puestos[0].horarioEstado).toBe('APROBADO');
  });

  describe('bitácoras por subir', () => {
    it('lista los días de la última semana con guardias trabajando y sin bitácora', () => {
      const { puestos } = armarPuestosDelDia(
        entrada({
          celdasPasadas: [
            { puestoId: 1, fecha: '2026-11-02', codigo: 'D' },
            { puestoId: 1, fecha: '2026-11-03', codigo: 'D' },
            { puestoId: 1, fecha: '2026-11-04', codigo: 'N' },
          ],
          bitacoras: [{ puestoId: 1, fechas: ['2026-11-03'] }],
        }),
      );
      expect(puestos[0].bitacorasSinSubir).toEqual(['2026-11-02', '2026-11-04']);
    });

    it('un día solo de descanso no pide bitácora', () => {
      const { puestos } = armarPuestosDelDia(
        entrada({ celdasPasadas: [{ puestoId: 1, fecha: '2026-11-04', codigo: 'L' }] }),
      );
      expect(puestos[0].bitacorasSinSubir).toEqual([]);
    });

    it('no mira más allá de la ventana ni el día de hoy', () => {
      const { puestos } = armarPuestosDelDia(
        entrada({
          celdasPasadas: [
            { puestoId: 1, fecha: '2026-10-20', codigo: 'D' },
            { puestoId: 1, fecha: '2026-11-05', codigo: 'D' },
          ],
        }),
      );
      expect(puestos[0].bitacorasSinSubir).toEqual([]);
    });

    it('las bitácoras de otro puesto no cubren este', () => {
      const { puestos } = armarPuestosDelDia(
        entrada({
          celdasPasadas: [{ puestoId: 1, fecha: '2026-11-04', codigo: 'D' }],
          bitacoras: [{ puestoId: 2, fechas: ['2026-11-04'] }],
        }),
      );
      expect(puestos[0].bitacorasSinSubir).toEqual(['2026-11-04']);
    });
  });

  describe('faltas registradas con «No llegó»', () => {
    const celdas = [
      { puestoId: 1, cedula: '1', nombre: 'Godoy', codigo: 'D' },
      { puestoId: 1, cedula: '2', nombre: 'Toro', codigo: 'D' },
    ];
    const falta = (estado: string, reemplazoNombre: string | null = null) => ({
      id: 9,
      puestoId: 1,
      cedula: '1',
      estado,
      motivo: 'NO_AVISO',
      hora: '07:10',
      nota: null,
      reemplazoNombre,
    });

    it('muestra la falta junto al guardia y no cuenta como cubierto si queda por debajo del mínimo', () => {
      const { puestos, resumen } = armarPuestosDelDia(
        entrada({ puestos: [puesto(1, 'Garita', 2)], celdasHoy: celdas, ausencias: [falta('POR_CUBRIR')] }),
      );
      expect(puestos[0].trabajando.find((g) => g.cedula === '1')?.ausencia?.estado).toBe('POR_CUBRIR');
      expect(puestos[0].cobertura).toBe('SIN_CUBRIR');
      expect(puestos[0].ausentesSinCubrir).toBe(1);
      expect(resumen.faltasSinCubrir).toBe(1);
    });

    it('una falta sin cubrir se avisa aunque el mínimo se cumpla con los demás', () => {
      const { puestos } = armarPuestosDelDia(entrada({ celdasHoy: celdas, ausencias: [falta('POR_CUBRIR')] }));
      expect(puestos[0].cobertura).toBe('CUBIERTO');
      expect(puestos[0].ausentesSinCubrir).toBe(1);
    });

    it('con reemplazo la falta cuenta como cubierta y ya no suma a las faltas sin cubrir', () => {
      const { puestos, resumen } = armarPuestosDelDia(
        entrada({ puestos: [puesto(1, 'Garita', 2)], celdasHoy: celdas, ausencias: [falta('CUBIERTA', 'Lara')] }),
      );
      expect(puestos[0].cobertura).toBe('CUBIERTO');
      expect(puestos[0].ausentesSinCubrir).toBe(0);
      expect(resumen.faltasSinCubrir).toBe(0);
    });

    it('el puesto con una falta sin cubrir sube arriba de los que están bien', () => {
      const { puestos } = armarPuestosDelDia(
        entrada({
          puestos: [puesto(2, 'A bien'), puesto(1, 'B con falta')],
          celdasHoy: [...celdas, { puestoId: 2, cedula: '5', nombre: 'Cinco', codigo: 'D' }],
          ausencias: [falta('POR_CUBRIR')],
        }),
      );
      expect(puestos.map((p) => p.puestoNombre)).toEqual(['B con falta', 'A bien']);
    });
  });

  it('ordena primero lo que pide atención: sin horario, sin cubrir, bitácoras por subir y al final lo que está bien', () => {
    const { puestos } = armarPuestosDelDia(
      entrada({
        puestos: [puesto(1, 'A bien'), puesto(2, 'B bitácoras'), puesto(3, 'C sin cubrir', 2), puesto(4, 'D sin horario', 1, 9)],
        celdasHoy: [
          { puestoId: 1, cedula: '1', nombre: 'Uno', codigo: 'D' },
          { puestoId: 2, cedula: '2', nombre: 'Dos', codigo: 'D' },
          { puestoId: 3, cedula: '3', nombre: 'Tres', codigo: 'D' },
        ],
        celdasPasadas: [{ puestoId: 2, fecha: '2026-11-04', codigo: 'D' }],
      }),
    );
    expect(puestos.map((p) => p.puestoNombre)).toEqual(['D sin horario', 'C sin cubrir', 'B bitácoras', 'A bien']);
  });

  it('sin puestos devuelve un resumen en cero', () => {
    expect(armarPuestosDelDia(entrada({ puestos: [] })).resumen).toEqual({
      fecha: '2026-11-05',
      puestos: 0,
      sinHorario: 0,
      sinCubrir: 0,
      faltasSinCubrir: 0,
      conBitacorasSinSubir: 0,
    });
  });
});

describe('diasAnteriores', () => {
  it('devuelve los n días anteriores, del más antiguo al más reciente, cruzando mes y año', () => {
    expect(diasAnteriores('2026-11-05', 3)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(diasAnteriores('2026-01-02', 3)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01']);
    expect(diasAnteriores('2026-11-05', DIAS_VENTANA_BITACORAS)).toHaveLength(7);
  });
});
