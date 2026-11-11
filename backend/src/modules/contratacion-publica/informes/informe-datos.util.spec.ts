import {
  conclusionSugerida,
  descripcionPuestos,
  duracionTexto,
  fechaConDia,
  fechaDelInforme,
  fechaTexto,
  limitesDelMes,
  periodoTexto,
} from './informe-datos.util';

describe('fechas en el estilo de los informes', () => {
  it('escribe la fecha como «24 de septiembre del 2026»', () => {
    expect(fechaTexto('2026-09-24')).toBe('24 de septiembre del 2026');
    expect(fechaConDia('2026-03-24')).toBe('martes, 24 de marzo del 2026');
  });

  it('el periodo cruza de mes, está en un solo mes o cruza de año', () => {
    expect(periodoTexto('2026-08-24', '2026-09-23')).toBe('24 de agosto al 23 de septiembre del 2026');
    expect(periodoTexto('2026-09-01', '2026-09-30')).toBe('1 al 30 de septiembre del 2026');
    expect(periodoTexto('2026-12-24', '2027-01-23')).toBe('24 de diciembre del 2026 al 23 de enero del 2027');
  });

  it('el informe se fecha el día después de terminar el periodo', () => {
    expect(fechaDelInforme('2026-09-23')).toBe('2026-09-24');
    expect(fechaDelInforme('2026-09-30')).toBe('2026-10-01');
  });

  it('límites del mes, con febrero bisiesto', () => {
    expect(limitesDelMes(2026, 9)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(limitesDelMes(2028, 2).hasta).toBe('2028-02-29');
  });

  it('duración del contrato en meses (o en días si es corto)', () => {
    expect(duracionTexto('2026-03-24', '2026-11-23')).toBe('8 meses');
    expect(duracionTexto('2026-01-01', '2026-01-31')).toBe('1 mes');
    expect(duracionTexto('2026-01-01', '2026-01-10')).toBe('10 días');
  });
});

describe('descripcionPuestos', () => {
  it('cuenta los puestos por tipo de turno', () => {
    expect(descripcionPuestos([{ tipoTurno: '24H' }])).toBe('01 puesto de guardia armada de 24 horas');
    expect(descripcionPuestos([{ tipoTurno: '24H' }, { tipoTurno: '24H' }])).toBe('02 puestos de guardia armada de 24 horas');
    expect(descripcionPuestos([{ tipoTurno: '12H' }, { tipoTurno: '24H' }])).toBe(
      '01 puesto de guardia armada de 12 horas y 01 puesto de guardia armada de 24 horas',
    );
  });
});

describe('conclusionSugerida', () => {
  const base = { periodo: '24 de agosto al 23 de septiembre del 2026', puestos: 1 };

  it('sin bitácoras no concluye nada', () => {
    expect(conclusionSugerida({ ...base, bitacoras: 0, novedades: [] })).toBeNull();
  });

  it('con bitácoras y sin novedades relevantes usa la frase de siempre', () => {
    const t = conclusionSugerida({
      ...base,
      bitacoras: 3,
      novedades: [{ fecha: '2026-09-01', puesto: 'A', texto: 'Ronda', categoria: 'RONDA', gravedad: 'BAJA' }],
    });
    expect(t).toMatch(/^No se han registrado novedades relevantes en el puesto asignado/);
    expect(t).toMatch(/24 de agosto al 23 de septiembre del 2026\.$/);
  });

  it('lista las novedades relevantes, en orden de fecha', () => {
    const t = conclusionSugerida({
      ...base,
      puestos: 2,
      bitacoras: 2,
      novedades: [
        { fecha: '2026-09-10', puesto: 'Norte', texto: 'Se dañó la puerta', categoria: 'INCIDENTE', gravedad: 'MEDIA' },
        { fecha: '2026-09-02', puesto: 'Sur', texto: 'Falla de radio', categoria: 'EQUIPOS', gravedad: 'BAJA' },
        { fecha: '2026-09-05', puesto: 'Sur', texto: 'Acceso normal', categoria: 'ACCESO', gravedad: 'BAJA' },
      ],
    })!;
    expect(t).toMatch(/2 novedad\(es\) relevante\(s\) en los puestos asignados/);
    expect(t.indexOf('2 de septiembre')).toBeLessThan(t.indexOf('10 de septiembre'));
    expect(t).not.toMatch(/Acceso normal/);
  });
});
