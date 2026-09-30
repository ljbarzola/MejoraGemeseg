import { calcularPatronRotacion } from './patron-rotacion.util';

const TRAMOS_2D2N2L = [
  { codigoTurno: 'D', dias: 2 },
  { codigoTurno: 'N', dias: 2 },
  { codigoTurno: 'L', dias: 2 },
];

function porGuardia(
  celdas: { cedula: string; fecha: string; codigoTurno: string }[],
  cedula: string,
) {
  return celdas
    .filter((c) => c.cedula === cedula)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((c) => c.codigoTurno);
}

describe('calcularPatronRotacion', () => {
  it('3 guardias, cobertura 1, patrón 2D-2N-2L: cobertura completa cada día (1D+1N+1L)', () => {
    const resultado = calcularPatronRotacion({
      tramos: TRAMOS_2D2N2L,
      coberturaSimultanea: 1,
      ordenGuardias: [
        { cedula: 'G1', nombreGuardia: 'Guardia 1' },
        { cedula: 'G2', nombreGuardia: 'Guardia 2' },
        { cedula: 'G3', nombreGuardia: 'Guardia 3' },
      ],
      fechaInicioCiclo: '2026-01-01',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-08',
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.cicloLongitud).toBe(6);
    expect(resultado.numGrupos).toBe(3);
    expect(resultado.desfaseDias).toBe(2);

    expect(porGuardia(resultado.celdas, 'G1')).toEqual([
      'D',
      'D',
      'N',
      'N',
      'L',
      'L',
      'D',
      'D',
    ]);
    expect(porGuardia(resultado.celdas, 'G2')).toEqual([
      'L',
      'L',
      'D',
      'D',
      'N',
      'N',
      'L',
      'L',
    ]);
    expect(porGuardia(resultado.celdas, 'G3')).toEqual([
      'N',
      'N',
      'L',
      'L',
      'D',
      'D',
      'N',
      'N',
    ]);

    // cobertura completa: cada día, exactamente 1 D + 1 N + 1 L entre los 3 guardias
    const porFecha = new Map<string, string[]>();
    for (const c of resultado.celdas) {
      porFecha.set(c.fecha, [...(porFecha.get(c.fecha) || []), c.codigoTurno]);
    }
    for (const codigos of porFecha.values()) {
      expect(codigos.sort()).toEqual(['D', 'L', 'N']);
    }
  });

  it('6 guardias, cobertura 2, mismo patrón: 2 guardias simultáneos por turno cada día', () => {
    const resultado = calcularPatronRotacion({
      tramos: TRAMOS_2D2N2L,
      coberturaSimultanea: 2,
      ordenGuardias: [
        { cedula: 'G1', nombreGuardia: 'Guardia 1' },
        { cedula: 'G2', nombreGuardia: 'Guardia 2' },
        { cedula: 'G3', nombreGuardia: 'Guardia 3' },
        { cedula: 'G4', nombreGuardia: 'Guardia 4' },
        { cedula: 'G5', nombreGuardia: 'Guardia 5' },
        { cedula: 'G6', nombreGuardia: 'Guardia 6' },
      ],
      fechaInicioCiclo: '2026-01-01',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-08',
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.numGrupos).toBe(3);
    expect(resultado.desfaseDias).toBe(2);

    expect(porGuardia(resultado.celdas, 'G1')).toEqual(
      porGuardia(resultado.celdas, 'G2'),
    );
    expect(porGuardia(resultado.celdas, 'G3')).toEqual(
      porGuardia(resultado.celdas, 'G4'),
    );
    expect(porGuardia(resultado.celdas, 'G5')).toEqual(
      porGuardia(resultado.celdas, 'G6'),
    );

    const porFecha = new Map<string, string[]>();
    for (const c of resultado.celdas) {
      porFecha.set(c.fecha, [...(porFecha.get(c.fecha) || []), c.codigoTurno]);
    }
    for (const codigos of porFecha.values()) {
      expect(codigos.sort()).toEqual(['D', 'D', 'L', 'L', 'N', 'N']);
    }
  });

  it('rechaza cobertura que no es múltiplo de la cantidad de guardias', () => {
    const resultado = calcularPatronRotacion({
      tramos: TRAMOS_2D2N2L,
      coberturaSimultanea: 2,
      ordenGuardias: Array.from({ length: 5 }, (_, i) => ({
        cedula: `G${i + 1}`,
        nombreGuardia: `Guardia ${i + 1}`,
      })),
      fechaInicioCiclo: '2026-01-01',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-08',
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toMatch(/múltiplo de la cobertura simultánea/);
  });

  it('rechaza un ciclo que no se puede repartir en partes iguales entre los grupos', () => {
    const resultado = calcularPatronRotacion({
      tramos: [{ codigoTurno: 'D', dias: 5 }],
      coberturaSimultanea: 1,
      ordenGuardias: [
        { cedula: 'G1', nombreGuardia: 'Guardia 1' },
        { cedula: 'G2', nombreGuardia: 'Guardia 2' },
      ],
      fechaInicioCiclo: '2026-01-01',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-08',
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toMatch(/no se puede repartir en partes iguales/);
  });

  it('rechaza tramos vacíos', () => {
    const resultado = calcularPatronRotacion({
      tramos: [],
      coberturaSimultanea: 1,
      ordenGuardias: [{ cedula: 'G1', nombreGuardia: 'Guardia 1' }],
      fechaInicioCiclo: '2026-01-01',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-08',
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toMatch(/al menos un tramo/);
  });

  it('rechaza cédulas repetidas en el orden de guardias', () => {
    const resultado = calcularPatronRotacion({
      tramos: TRAMOS_2D2N2L,
      coberturaSimultanea: 1,
      ordenGuardias: [
        { cedula: 'G1', nombreGuardia: 'Guardia 1' },
        { cedula: 'G1', nombreGuardia: 'Guardia 1 duplicado' },
      ],
      fechaInicioCiclo: '2026-01-01',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-08',
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toMatch(/repetidos/);
  });

  it('rechaza cobertura simultánea mayor a la cantidad de guardias', () => {
    const resultado = calcularPatronRotacion({
      tramos: TRAMOS_2D2N2L,
      coberturaSimultanea: 3,
      ordenGuardias: [{ cedula: 'G1', nombreGuardia: 'Guardia 1' }],
      fechaInicioCiclo: '2026-01-01',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-08',
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toMatch(/no puede ser mayor/);
  });
});
