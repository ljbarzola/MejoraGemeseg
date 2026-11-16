import {
  buscarMeta,
  calcularAvances,
  cumplimiento,
  resolverPeriodo,
  vendedorDelAlcance,
  type FilaMeta,
} from './ventas-metas.util';

describe('resolverPeriodo', () => {
  it('reconoce «Este mes» (del 1 a hoy) con avance del ritmo', () => {
    const p = resolverPeriodo('2026-11-01', '2026-11-15', '2026-11-15');
    expect(p).toMatchObject({ periodo: 'MES', year: 2026, month: 11, inicio: '2026-11-01', fin: '2026-11-30' });
    expect(p!.ritmo).toBeCloseTo(0.5, 5);
  });

  it('un mes pasado ya cumplido tiene ritmo 1', () => {
    const p = resolverPeriodo('2026-10-01', '2026-10-31', '2026-11-15');
    expect(p).toMatchObject({ periodo: 'MES', month: 10 });
    expect(p!.ritmo).toBe(1);
  });

  it('reconoce «Este año» y la semana de un lunes', () => {
    expect(resolverPeriodo('2026-01-01', '2026-11-15', '2026-11-15')).toMatchObject({ periodo: 'ANIO', year: 2026, month: 0 });
    // 2026-11-09 es lunes.
    expect(resolverPeriodo('2026-11-09', '2026-11-12', '2026-11-12')).toMatchObject({ periodo: 'SEMANA', month: 11 });
  });

  it('con pista resuelve la ambigüedad de enero y descarta rangos sueltos', () => {
    expect(resolverPeriodo('2026-01-01', '2026-01-10', '2026-01-10', 'anio')).toMatchObject({ periodo: 'ANIO' });
    expect(resolverPeriodo('2026-01-01', '2026-01-10', '2026-01-10', 'mes')).toMatchObject({ periodo: 'MES' });
    expect(resolverPeriodo('2026-08-18', '2026-11-15', '2026-11-15', 'ninguno')).toBeNull();
    expect(resolverPeriodo('2026-08-18', '2026-11-15', '2026-11-15')).toBeNull();
  });

  it('rechaza fechas inválidas o invertidas', () => {
    expect(resolverPeriodo('2026-11-15', '2026-11-01', '2026-11-15')).toBeNull();
    expect(resolverPeriodo('no', '2026-11-01', '2026-11-15')).toBeNull();
  });
});

describe('buscarMeta', () => {
  const filas: FilaMeta[] = [
    { userId: null, kind: 'MONTO', periodKind: 'MES', year: 2026, month: 11, target: 30000 },
    { userId: 7, kind: 'MONTO', periodKind: 'MES', year: 2026, month: 11, target: 10000 },
    { userId: null, kind: 'MONTO', periodKind: 'ANIO', year: 2026, month: 0, target: 360000 },
  ];
  it('usa la meta del mes, la del año o la mensual entre 4 para la semana', () => {
    const mes = { periodo: 'MES', year: 2026, month: 11 } as const;
    expect(buscarMeta(filas, null, 'MONTO', mes)).toBe(30000);
    expect(buscarMeta(filas, 7, 'MONTO', mes)).toBe(10000);
    expect(buscarMeta(filas, null, 'MONTO', { periodo: 'SEMANA', year: 2026, month: 11 })).toBe(7500);
    expect(buscarMeta(filas, null, 'MONTO', { periodo: 'ANIO', year: 2026, month: 0 })).toBe(360000);
  });
  it('devuelve null si no hay meta fijada', () => {
    expect(buscarMeta(filas, 8, 'MONTO', { periodo: 'MES', year: 2026, month: 11 })).toBeNull();
    expect(buscarMeta(filas, null, 'IMPACTOS', { periodo: 'MES', year: 2026, month: 11 })).toBeNull();
  });
});

describe('cumplimiento', () => {
  it('calcula porcentaje y brecha, y colorea según el ritmo', () => {
    expect(cumplimiento(1000, 500, 0.5)).toMatchObject({ pct: 50, brecha: 500, estado: 'VERDE' });
    expect(cumplimiento(1000, 450, 0.5)).toMatchObject({ estado: 'AMARILLO' });
    expect(cumplimiento(1000, 200, 0.5)).toMatchObject({ estado: 'ROJO' });
    expect(cumplimiento(1000, 1200, 1)).toMatchObject({ pct: 120, brecha: -200, estado: 'VERDE' });
    expect(cumplimiento(1000, 900, 1)).toMatchObject({ estado: 'AMARILLO' });
  });
  it('sin meta (o meta 0) no hay porcentaje', () => {
    expect(cumplimiento(null, 500, 1)).toMatchObject({ pct: null, brecha: null, estado: 'SIN_META' });
    expect(cumplimiento(0, 500, 1)).toMatchObject({ pct: null, estado: 'SIN_META' });
  });
});

describe('calcularAvances', () => {
  const v = (id: number, cliente: number, vendedor: number | null, monto: number | null, dia: string) => ({
    id,
    salesClientId: cliente,
    assignedUserId: vendedor,
    quotedAmount: monto,
    dia,
  });
  it('suma monto e impactos y cuenta el cliente nuevo una sola vez, para el vendedor de su primera venta', () => {
    const r = calcularAvances(
      [v(1, 100, 7, 1000, '2026-11-10'), v(2, 100, 8, 500, '2026-11-03'), v(3, 200, 7, null, '2026-11-12')],
      new Set<number>(),
    );
    expect(r.empresa).toMatchObject({ MONTO: 1500, IMPACTOS: 3, CLIENTES_NUEVOS: 2, sinMonto: 1 });
    // El cliente 100 compró primero (día 3) con el vendedor 8.
    expect(r.porVendedor.get(8)).toMatchObject({ CLIENTES_NUEVOS: 1, IMPACTOS: 1, MONTO: 500 });
    expect(r.porVendedor.get(7)).toMatchObject({ CLIENTES_NUEVOS: 1, IMPACTOS: 2, MONTO: 1000 });
  });
  it('un cliente con compra previa no es nuevo y lo sin responsable suma a la empresa', () => {
    const r = calcularAvances([v(1, 100, null, 300, '2026-11-02')], new Set([100]));
    expect(r.empresa).toMatchObject({ MONTO: 300, IMPACTOS: 1, CLIENTES_NUEVOS: 0 });
    expect(r.porVendedor.get(0)).toMatchObject({ IMPACTOS: 1 });
  });
});

describe('vendedorDelAlcance', () => {
  it('sigue la regla de la analítica', () => {
    expect(vendedorDelAlcance({ userId: 5, role: 'EMPLOYEE' })).toBe(5);
    expect(vendedorDelAlcance({ userId: 5, role: 'EMPLOYEE', alcance: '9' })).toBe(5);
    expect(vendedorDelAlcance({ userId: 5, role: 'EMPLOYEE', alcance: 'all' })).toBeNull();
    expect(vendedorDelAlcance({ userId: 1, role: 'MANAGER' })).toBeNull();
    expect(vendedorDelAlcance({ userId: 1, role: 'MANAGER', alcance: '9' })).toBe(9);
    expect(vendedorDelAlcance({ userId: 1, role: 'ADMIN', alcance: 'mine' })).toBe(1);
  });
});
