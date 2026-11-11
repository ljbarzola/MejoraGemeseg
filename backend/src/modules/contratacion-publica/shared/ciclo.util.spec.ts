import { cicloDelMes, cicloTextoCorto, corteDeEntidad, corteValido } from './ciclo.util';

describe('cicloDelMes', () => {
  it('con corte 24, el ciclo de septiembre va del 24 de agosto al 23 de septiembre', () => {
    expect(cicloDelMes(2026, 9, 24)).toEqual({ desde: '2026-08-24', hasta: '2026-09-23', esCiclo: true });
  });

  it('con corte 30, el ciclo de agosto va del 30 de julio al 29 de agosto', () => {
    expect(cicloDelMes(2026, 8, 30)).toEqual({ desde: '2026-07-30', hasta: '2026-08-29', esCiclo: true });
  });

  it('el ciclo de enero empieza en diciembre del año anterior', () => {
    expect(cicloDelMes(2027, 1, 24)).toEqual({ desde: '2026-12-24', hasta: '2027-01-23', esCiclo: true });
  });

  it('sin corte, o con corte 1, es el mes calendario', () => {
    expect(cicloDelMes(2026, 9, null)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30', esCiclo: false });
    expect(cicloDelMes(2026, 2, 1)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28', esCiclo: false });
    expect(cicloDelMes(2026, 9, 0).esCiclo).toBe(false);
  });

  it('un corte que el mes no tiene se ajusta al último día', () => {
    // corte 31: el ciclo de abril empieza el 31 de marzo y termina el 30 de abril (30 es el último día)
    expect(cicloDelMes(2026, 4, 31)).toEqual({ desde: '2026-03-31', hasta: '2026-04-30', esCiclo: true });
    // el ciclo de marzo con corte 31 empieza el último día de febrero
    expect(cicloDelMes(2026, 3, 31).desde).toBe('2026-02-28');
  });
});

describe('cicloTextoCorto', () => {
  it('escribe el ciclo en corto', () => {
    expect(cicloTextoCorto(cicloDelMes(2026, 9, 24))).toBe('24 ago – 23 sep');
    expect(cicloTextoCorto(cicloDelMes(2027, 1, 24))).toBe('24 dic 2026 – 23 ene 2027');
  });
});

describe('corteDeEntidad', () => {
  it('toma el corte que comparten los contratos', () => {
    expect(corteDeEntidad([24, 24, null])).toEqual({ dia: 24, conflicto: false });
  });
  it('sin cortes, o con cortes distintos, no hay ciclo único', () => {
    expect(corteDeEntidad([null, 1])).toEqual({ dia: null, conflicto: false });
    expect(corteDeEntidad([24, 30])).toEqual({ dia: null, conflicto: true });
  });
  it('valida el día de corte', () => {
    expect(corteValido(31)).toBe(true);
    expect(corteValido(32)).toBe(false);
    expect(corteValido(2.5)).toBe(false);
    expect(corteValido('24')).toBe(false);
  });
});
