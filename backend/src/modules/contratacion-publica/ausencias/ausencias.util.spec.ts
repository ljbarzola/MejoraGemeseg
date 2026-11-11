import { aplicarAusencias, conflictoReemplazo, diaLegible, fechaNoPermitida } from './ausencias.util';

describe('fechaNoPermitida', () => {
  it('acepta hoy y hasta 7 días atrás, y rechaza el futuro y lo más antiguo', () => {
    expect(fechaNoPermitida('2026-11-06', '2026-11-06')).toBeNull();
    expect(fechaNoPermitida('2026-10-30', '2026-11-06')).toBeNull();
    expect(fechaNoPermitida('2026-10-29', '2026-11-06')).toMatch(/bitácora/);
    expect(fechaNoPermitida('2026-11-07', '2026-11-06')).toMatch(/todavía no llega/);
  });
});

describe('diaLegible', () => {
  it('escribe el día y el mes', () => {
    expect(diaLegible('2026-11-06')).toBe('6 de noviembre');
    expect(diaLegible('2026-01-02')).toBe('2 de enero');
  });
});

describe('conflictoReemplazo', () => {
  const base = {
    reemplazoCedula: '9',
    ausenteCedula: '1',
    trabajando: new Set<string>(),
    ausentes: new Set<string>(['1']),
    cubriendo: new Set<string>(),
  };

  it('deja cubrir a quien está libre', () => {
    expect(conflictoReemplazo(base)).toBeNull();
  });

  it('no deja que quien faltó se cubra a sí mismo', () => {
    expect(conflictoReemplazo({ ...base, reemplazoCedula: '1' })).toMatch(/no puede ser quien faltó/);
  });

  it('no deja a quien ya trabaja ese día, a quien también faltó ni a quien ya cubre otra falta', () => {
    expect(conflictoReemplazo({ ...base, trabajando: new Set(['9']) })).toMatch(/turno de trabajo/);
    expect(conflictoReemplazo({ ...base, ausentes: new Set(['1', '9']) })).toMatch(/también tiene una falta/);
    expect(conflictoReemplazo({ ...base, cubriendo: new Set(['9']) })).toMatch(/ya está cubriendo/);
  });
});

describe('aplicarAusencias', () => {
  const celdas = [
    { fecha: '2026-11-06', cedula: '1', nombre: 'Toro', codigo: 'D' },
    { fecha: '2026-11-06', cedula: '2', nombre: 'Godoy', codigo: 'L' },
    { fecha: '2026-11-07', cedula: '1', nombre: 'Toro', codigo: 'D' },
  ];

  it('pasa el turno a quien cubre y quita su celda de descanso', () => {
    const r = aplicarAusencias(celdas, [
      { fecha: '2026-11-06', cedula: '1', estado: 'CUBIERTA', reemplazoCedula: '2', reemplazoNombre: 'Godoy' },
    ]);
    expect(r).toEqual([
      { fecha: '2026-11-06', cedula: '2', nombre: 'Godoy', codigo: 'D' },
      { fecha: '2026-11-07', cedula: '1', nombre: 'Toro', codigo: 'D' },
    ]);
  });

  it('sin reemplazo nadie ocupa el turno', () => {
    const r = aplicarAusencias(celdas, [
      { fecha: '2026-11-06', cedula: '1', estado: 'POR_CUBRIR', reemplazoCedula: null, reemplazoNombre: null },
    ]);
    expect(r.map((c) => `${c.fecha}|${c.cedula}`)).toEqual(['2026-11-06|2', '2026-11-07|1']);
  });

  it('sin faltas deja el horario igual', () => {
    expect(aplicarAusencias(celdas, [])).toBe(celdas);
  });
});
