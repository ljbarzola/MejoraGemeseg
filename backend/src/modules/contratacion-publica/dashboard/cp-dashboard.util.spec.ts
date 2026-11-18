import {
  armarDashboard,
  cajaDeEntrega,
  faltantesDe,
  type ContratoFila,
  type EntidadFila,
} from './cp-dashboard.util';

const HOY = '2026-11-18';

const entidad = (p: Partial<EntidadFila> & { id: number }): EntidadFila => ({
  nombre: `Entidad ${p.id}`,
  tipo: 'PUBLICA',
  ruc: '1790000000001',
  direccion: 'Quito',
  sector: 'Ministerio',
  provincia: 'Pichincha',
  ...p,
});

const contrato = (p: Partial<ContratoFila> & { id: number; entidadId: number }): ContratoFila => ({
  numero: 'CE-2026-1',
  estado: 'ACTIVO',
  fechaInicio: '2026-01-01',
  fechaFin: '2026-12-31',
  valorTotal: 1000,
  administradorNombre: 'Ana',
  puestos: 2,
  ...p,
});

describe('faltantesDe', () => {
  it('una entidad completa con contrato completo no tiene faltantes', () => {
    expect(faltantesDe(entidad({ id: 1 }), [contrato({ id: 1, entidadId: 1 })])).toEqual([]);
  });

  it('nombra cada dato que falta, y el contrato «POR COMPLETAR» sin valor ni administrador', () => {
    const e = entidad({ id: 1, ruc: null, direccion: ' ', sector: null, provincia: null });
    const c = contrato({ id: 1, entidadId: 1, numero: 'POR COMPLETAR - Casa de la Cultura', valorTotal: null, administradorNombre: null });
    expect(faltantesDe(e, [c])).toEqual([
      'RUC', 'Dirección', 'Sector', 'Provincia', 'Número del contrato', 'Valor del contrato', 'Administrador del contrato',
    ]);
  });

  it('sin contrato activo dice «Contrato» y no inventa datos del contrato', () => {
    expect(faltantesDe(entidad({ id: 1 }), [contrato({ id: 1, entidadId: 1, estado: 'FINALIZADO' })])).toEqual(['Contrato']);
  });
});

describe('cajaDeEntrega', () => {
  it('reparte cada entrega en una sola caja', () => {
    expect(cajaDeEntrega({ entidadId: 1, estado: 'RECHAZADO', fechaLimite: '2026-11-10', entregadoDia: '2026-11-09' }, HOY)).toBe('rechazadas');
    expect(cajaDeEntrega({ entidadId: 1, estado: 'APROBADO', fechaLimite: '2026-11-10', entregadoDia: '2026-11-10' }, HOY)).toBe('aTiempo');
    expect(cajaDeEntrega({ entidadId: 1, estado: 'ENTREGADO', fechaLimite: '2026-11-10', entregadoDia: '2026-11-12' }, HOY)).toBe('atrasadas');
    expect(cajaDeEntrega({ entidadId: 1, estado: 'PENDIENTE', fechaLimite: '2026-11-17', entregadoDia: null }, HOY)).toBe('atrasadas');
    expect(cajaDeEntrega({ entidadId: 1, estado: 'PENDIENTE', fechaLimite: HOY, entregadoDia: null }, HOY)).toBe('pendientes');
  });
});

describe('armarDashboard', () => {
  const base = {
    hoy: HOY,
    entidades: [
      entidad({ id: 1, nombre: 'Ministerio' }),
      entidad({ id: 2, nombre: 'Kia', tipo: 'PRIVADA', sector: 'Comercio', provincia: 'Guayas' }),
      entidad({ id: 3, nombre: 'Sin datos', ruc: null, provincia: null }),
    ],
    contratos: [
      contrato({ id: 10, entidadId: 1, valorTotal: 315624, fechaFin: '2026-12-10', puestos: 6 }),
      contrato({ id: 20, entidadId: 2, valorTotal: 5000, fechaFin: '2027-06-30', puestos: 4 }),
      contrato({ id: 30, entidadId: 3, numero: 'POR COMPLETAR', valorTotal: null, fechaFin: '2026-11-30' }),
      contrato({ id: 40, entidadId: 3, estado: 'FINALIZADO', fechaFin: '2026-01-31', valorTotal: 99999 }),
    ],
    entregas: [
      { entidadId: 1, estado: 'APROBADO', fechaLimite: '2026-11-05', entregadoDia: '2026-11-04' },
      { entidadId: 1, estado: 'PENDIENTE', fechaLimite: '2026-11-10', entregadoDia: null },
      { entidadId: 99, estado: 'PENDIENTE', fechaLimite: '2026-11-10', entregadoDia: null },
    ],
    operaciones: {
      bitacoras: [
        { entidadId: 1, resultado: 'CON_ERRORES', hallazgosAbiertos: 2 },
        { entidadId: 1, resultado: 'CONFORME', hallazgosAbiertos: 0 },
      ],
      faltas: [
        { contratoId: 10, estado: 'CUBIERTA' },
        { contratoId: 10, estado: 'POR_CUBRIR' },
        { contratoId: 10, estado: 'ANULADA' },
      ],
      visitas: [{ contratoId: 20 }],
    },
  };

  it('las cifras de arriba cuentan solo contratos vigentes, y los por vencer por tramos', () => {
    const { kpis } = armarDashboard(base);
    expect(kpis).toMatchObject({
      entidades: 3, publicas: 2, privadas: 1, conContratoVigente: 3,
      porVencer30: 2, porVencer60: 2, porVencer90: 2,
      valorVigente: 320624, vigentesSinValor: 1,
    });
  });

  it('datos por completar: solo las entidades a las que les falta algo, la más incompleta primero', () => {
    const r = armarDashboard(base);
    expect(r.datosPorCompletar.map((x) => x.nombre)).toEqual(['Sin datos']);
    expect(r.datosPorCompletar[0].contratoId).toBe(30);
  });

  it('valor por entidad separa públicas y privadas y ordena de mayor a menor', () => {
    const { contratos } = armarDashboard(base);
    expect(contratos.valorPorEntidad.map((x) => x.nombre)).toEqual(['Ministerio', 'Kia']);
    expect(contratos.valorPublicas).toBe(315624);
    expect(contratos.valorPrivadas).toBe(5000);
    expect(contratos.porVencer.map((x) => x.dias)).toEqual([12, 22]);
  });

  it('entregas: ignora las de entidades fuera del filtro', () => {
    const { entregas } = armarDashboard(base);
    expect(entregas).toMatchObject({ total: 2, aTiempo: 1, atrasadas: 1, pendientes: 0, rechazadas: 0 });
  });

  it('mapa: cuenta entidades y puestos de contratos activos por provincia, y aparte las que no tienen provincia', () => {
    const { mapa } = armarDashboard(base);
    expect(mapa.sinProvincia).toBe(1);
    expect(mapa.provincias).toEqual(expect.arrayContaining([
      expect.objectContaining({ provincia: 'Pichincha', entidades: 1, puestos: 6 }),
      expect.objectContaining({ provincia: 'Guayas', entidades: 1, puestos: 4 }),
    ]));
  });

  it('operaciones: bitácoras con errores y hallazgos, faltas sin contar las anuladas, visitas por entidad', () => {
    const { operaciones } = armarDashboard(base);
    expect(operaciones!.bitacoras).toMatchObject({ total: 2, conErrores: 1, hallazgosAbiertos: 2 });
    expect(operaciones!.faltas).toMatchObject({ total: 2, cubiertas: 1, sinCubrir: 1, visitas: 1 });
  });

  it('sin permiso de Operaciones no arma esos bloques', () => {
    expect(armarDashboard({ ...base, operaciones: null }).operaciones).toBeNull();
  });
});
