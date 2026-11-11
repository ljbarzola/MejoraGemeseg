import {
  claveTenedor,
  cruzaMinimo,
  estadoPermiso,
  estadoStock,
  motivoNoSePuede,
  reposicionSugerida,
  saldoBodega,
  saldosPorTenedor,
  totalEntregado,
  type MovimientoCalculo,
} from './inventario.util';

const mov = (tipo: string, cantidad: number, tenedor: string | null = null): MovimientoCalculo => ({ tipo, cantidad, tenedor });

describe('claveTenedor', () => {
  it('prefiere al guardia sobre el puesto', () => {
    expect(claveTenedor({ guardiaCedula: '123', puestoId: 4 })).toBe('G:123');
    expect(claveTenedor({ puestoId: 4 })).toBe('P:4');
    expect(claveTenedor({})).toBeNull();
    expect(claveTenedor({ guardiaCedula: '  ' })).toBeNull();
  });
});

describe('saldos del kardex', () => {
  const movs = [
    mov('ENTRADA', 100),
    mov('ENTREGA', 30, 'G:1'),
    mov('ENTREGA', 20, 'P:7'),
    mov('DEVOLUCION', 10, 'G:1'),
    mov('BAJA', 5, 'P:7'), // sale de lo que tiene el puesto, no de la bodega
    mov('BAJA', 2), // sale de la bodega
    mov('AJUSTE', -3),
  ];

  it('calcula la bodega con entradas, entregas, devoluciones, bajas de bodega y ajustes', () => {
    // 100 - 30 - 20 + 10 - 2 - 3
    expect(saldoBodega(movs)).toBe(55);
  });

  it('calcula lo que tiene cada tenedor y descarta a quien devolvió todo', () => {
    const saldos = saldosPorTenedor(movs);
    expect(saldos.get('G:1')).toBe(20);
    expect(saldos.get('P:7')).toBe(15);
    expect(saldosPorTenedor([mov('ENTREGA', 5, 'G:9'), mov('DEVOLUCION', 5, 'G:9')]).has('G:9')).toBe(false);
  });

  it('suma lo entregado', () => {
    expect(totalEntregado(movs)).toBe(35);
  });
});

describe('estadoStock y reposición', () => {
  it('clasifica según mínimo y máximo', () => {
    expect(estadoStock(0, 5, 20)).toBe('SIN_STOCK');
    expect(estadoStock(5, 5, 20)).toBe('BAJO_MINIMO');
    expect(estadoStock(10, 5, 20)).toBe('NORMAL');
    expect(estadoStock(25, 5, 20)).toBe('SOBRE_MAXIMO');
    expect(estadoStock(3, 0, null)).toBe('NORMAL');
  });

  it('sugiere reponer hasta el máximo, o hasta el doble del mínimo si no hay máximo', () => {
    expect(reposicionSugerida(3, 5, 20)).toBe(17);
    expect(reposicionSugerida(3, 5, null)).toBe(7);
    expect(reposicionSugerida(10, 5, 20)).toBe(0);
    expect(reposicionSugerida(0, 0, null)).toBe(0);
  });

  it('avisa solo cuando el movimiento hace cruzar el mínimo', () => {
    expect(cruzaMinimo(8, 5, 5)).toBe(true);
    expect(cruzaMinimo(5, 3, 5)).toBe(false);
    expect(cruzaMinimo(3, 0, 0)).toBe(true);
    expect(cruzaMinimo(0, 0, 0)).toBe(false);
  });
});

describe('permiso del arma', () => {
  it('distingue vigente, por vencer, vencido y sin permiso', () => {
    expect(estadoPermiso(null, '2026-11-06')).toBe('SIN_PERMISO');
    expect(estadoPermiso('2026-11-05', '2026-11-06')).toBe('VENCIDO');
    expect(estadoPermiso('2026-11-06', '2026-11-06')).toBe('POR_VENCER');
    expect(estadoPermiso('2026-12-06', '2026-11-06')).toBe('POR_VENCER');
    expect(estadoPermiso('2026-12-07', '2026-11-06')).toBe('VIGENTE');
  });
});

describe('motivoNoSePuede', () => {
  it('no deja asignar un arma ya asignada, en mantenimiento o con el permiso vencido', () => {
    expect(motivoNoSePuede('ASIGNAR', 'DISPONIBLE', 'VIGENTE')).toBeNull();
    expect(motivoNoSePuede('ASIGNAR', 'DISPONIBLE', 'SIN_PERMISO')).toBeNull();
    expect(motivoNoSePuede('ASIGNAR', 'ASIGNADA', 'VIGENTE')).toMatch(/ya está asignada/);
    expect(motivoNoSePuede('ASIGNAR', 'MANTENIMIENTO', 'VIGENTE')).toMatch(/mantenimiento/);
    expect(motivoNoSePuede('ASIGNAR', 'DISPONIBLE', 'VENCIDO')).toMatch(/vencido/);
  });

  it('exige devolver antes de mandar a mantenimiento o dar de baja, y nada se hace sobre una baja', () => {
    expect(motivoNoSePuede('MANTENIMIENTO', 'ASIGNADA', 'VIGENTE')).toMatch(/devuélvela/);
    expect(motivoNoSePuede('BAJA', 'ASIGNADA', 'VIGENTE')).toMatch(/devuélvela/);
    expect(motivoNoSePuede('BAJA', 'DISPONIBLE', 'VIGENTE')).toBeNull();
    expect(motivoNoSePuede('REACTIVAR', 'MANTENIMIENTO', 'VIGENTE')).toBeNull();
    expect(motivoNoSePuede('DEVOLVER', 'BAJA', 'VIGENTE')).toMatch(/baja/);
  });
});
