import {
  evaluarEntrega,
  fechaLegible,
  normalizarLecturaEntrega,
  type LecturaEntrega,
} from './entrega-revision.util';

const base: LecturaEntrega = {
  legible: true,
  tipoDocumento: 'Certificado',
  seFirma: true,
  firmaOSello: 'SI',
  fechaVencimiento: null,
  periodoDesde: null,
  periodoHasta: null,
  observaciones: null,
};
const HOY = '2026-11-09';

describe('evaluarEntrega', () => {
  it('parece correcto si se lee, tiene firma y no está vencido', () => {
    const r = evaluarEntrega({ ...base, fechaVencimiento: '2026-12-31' }, HOY);
    expect(r.estado).toBe('PARECE_CORRECTO');
    expect(r.mensajeRechazo).toBe('');
  });

  it('pide revisar si debería llevar firma o sello y no se ve, o no está claro', () => {
    expect(evaluarEntrega({ ...base, firmaOSello: 'NO' }, HOY).estado).toBe('REVISAR');
    expect(evaluarEntrega({ ...base, firmaOSello: 'DUDOSO' }, HOY).motivos[0].texto).toMatch(/no está claro/i);
  });

  it('no exige firma a un documento que no se firma', () => {
    expect(evaluarEntrega({ ...base, seFirma: false, firmaOSello: 'NO' }, HOY).estado).toBe('PARECE_CORRECTO');
  });

  it('pide revisar si el vencimiento ya pasó, pero no si vence hoy o después', () => {
    expect(evaluarEntrega({ ...base, fechaVencimiento: '2026-11-08' }, HOY).motivos[0].texto).toMatch(/8 de noviembre de 2026/);
    expect(evaluarEntrega({ ...base, fechaVencimiento: HOY }, HOY).estado).toBe('PARECE_CORRECTO');
  });

  it('si no se lee, solo dice eso (no opina de la firma)', () => {
    const r = evaluarEntrega({ ...base, legible: false, firmaOSello: 'NO' }, HOY);
    expect(r.motivos).toHaveLength(1);
    expect(r.mensajeRechazo).toMatch(/no se lee bien/);
  });

  it('junta todos los motivos en el rechazo propuesto', () => {
    const r = evaluarEntrega({ ...base, firmaOSello: 'NO', fechaVencimiento: '2026-10-01' }, HOY);
    expect(r.motivos).toHaveLength(2);
    expect(r.mensajeRechazo).toMatch(/firma ni sello.*vencido/);
  });
});

describe('evaluarEntrega — periodo', () => {
  const sep = { anio: 2026, mes: 9 };
  const conPeriodo = (d: string, h: string): LecturaEntrega => ({ ...base, periodoDesde: d, periodoHasta: h });

  it('un periodo dentro del mes de la solicitud parece correcto', () => {
    const r = evaluarEntrega(conPeriodo('2026-09-01', '2026-09-30'), HOY, sep);
    expect(r.estado).toBe('PARECE_CORRECTO');
    expect(r.resumen).toMatch(/corresponde a la solicitud/);
  });

  it('un periodo que cruza de mes vale para los dos meses', () => {
    const l = conPeriodo('2026-08-24', '2026-09-23');
    expect(evaluarEntrega(l, HOY, sep).estado).toBe('PARECE_CORRECTO');
    expect(evaluarEntrega(l, HOY, { anio: 2026, mes: 8 }).estado).toBe('PARECE_CORRECTO');
  });

  it('un periodo que no toca el mes pide revisar y propone el rechazo', () => {
    const r = evaluarEntrega(conPeriodo('2026-07-30', '2026-08-29'), HOY, sep);
    expect(r.estado).toBe('REVISAR');
    expect(r.motivos[0].texto).toMatch(/septiembre de 2026/);
    expect(r.mensajeRechazo).toMatch(/periodo correcto/);
  });

  it('sin periodo en el documento, o sin solicitud, no se compara', () => {
    expect(evaluarEntrega(base, HOY, sep).estado).toBe('PARECE_CORRECTO');
    expect(evaluarEntrega(conPeriodo('2025-01-01', '2025-01-31'), HOY).estado).toBe('PARECE_CORRECTO');
  });
});

describe('evaluarEntrega — periodo con ciclo del contrato', () => {
  const doc: LecturaEntrega = { ...base, periodoDesde: '2026-08-24', periodoHasta: '2026-09-23' };
  const ciclo = (mes: number, desde: string, hasta: string, etiqueta: string) => ({ anio: 2026, mes, desde, hasta, etiqueta });

  it('el documento de su propio ciclo parece correcto', () => {
    expect(evaluarEntrega(doc, HOY, ciclo(9, '2026-08-24', '2026-09-23', '24 ago – 23 sep')).estado).toBe('PARECE_CORRECTO');
  });

  it('el documento del ciclo siguiente se detecta (con el mes calendario de agosto pasaba)', () => {
    const r = evaluarEntrega(doc, HOY, ciclo(8, '2026-07-24', '2026-08-23', '24 jul – 23 ago'));
    expect(r.estado).toBe('REVISAR');
    expect(r.motivos[0].texto).toMatch(/agosto de 2026 \(24 jul – 23 ago\)/);
    expect(evaluarEntrega(doc, HOY, { anio: 2026, mes: 8 }).estado).toBe('PARECE_CORRECTO');
  });
});

describe('normalizarLecturaEntrega', () => {
  it('no se fía de la forma de la respuesta', () => {
    expect(normalizarLecturaEntrega(null).legible).toBe(false);
    const l = normalizarLecturaEntrega({ legible: true, firmaOSello: 'quizá', fechaVencimiento: '2026-02-30' });
    expect(l.firmaOSello).toBe('DUDOSO');
    expect(l.fechaVencimiento).toBeNull();
  });

  it('descarta un periodo incompleto o al revés', () => {
    expect(normalizarLecturaEntrega({ legible: true, periodoDesde: '2026-09-01' }).periodoDesde).toBeNull();
    const al_reves = normalizarLecturaEntrega({ legible: true, periodoDesde: '2026-09-30', periodoHasta: '2026-09-01' });
    expect(al_reves.periodoHasta).toBeNull();
  });
});

describe('fechaLegible', () => {
  it('escribe día, mes y año', () => {
    expect(fechaLegible('2026-11-09')).toBe('9 de noviembre de 2026');
  });
});
