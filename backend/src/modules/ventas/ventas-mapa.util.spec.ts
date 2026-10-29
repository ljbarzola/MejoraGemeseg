import { agruparMapa, vistaValida, type FilaMapa } from './ventas-mapa.util';

const fila = (p: Partial<FilaMapa>): FilaMapa => ({
  locationName: null,
  locationLat: null,
  locationLng: null,
  locationCity: null,
  locationProvince: null,
  quotedAmount: null,
  outcome: null,
  closedAt: null,
  ...p,
});

describe('vistaValida', () => {
  it('acepta las vistas conocidas y cae en «todas»', () => {
    expect(vistaValida('cotizadas')).toBe('cotizadas');
    expect(vistaValida('x')).toBe('todas');
    expect(vistaValida(undefined)).toBe('todas');
  });
});

describe('agruparMapa', () => {
  it('sin oportunidades: todas las provincias quedan por trabajar', () => {
    const r = agruparMapa([]);
    expect(r.total).toBe(0);
    expect(r.puntos).toEqual([]);
    expect(r.provincias).toEqual([]);
    expect(r.provinciasSinOportunidades).toHaveLength(24);
  });

  it('agrupa por ciudad aunque el nombre cambie de tildes o mayúsculas, y suma montos', () => {
    const r = agruparMapa([
      fila({ locationLat: -2.17, locationLng: -79.92, locationCity: 'Guayaquil', locationProvince: 'Guayas', quotedAmount: 1000, locationName: 'Sugar Coffee' }),
      fila({ locationLat: -2.19, locationLng: -79.88, locationCity: 'GUAYAQUIL', locationProvince: 'Guayas', quotedAmount: 500.5, outcome: 'GANADA', closedAt: new Date() }),
      fila({ locationLat: -0.18, locationLng: -78.47, locationCity: 'Quito', locationProvince: 'Pichincha', outcome: 'PERDIDA', closedAt: new Date() }),
    ]);
    expect(r.conUbicacion).toBe(3);
    expect(r.puntos).toHaveLength(2);
    const gye = r.puntos[0];
    expect(gye).toMatchObject({ provincia: 'Guayas', total: 2, aceptadas: 1, abiertas: 1, perdidas: 0, montoCotizado: 1500.5 });
    expect(gye.lat).toBeCloseTo(-2.18, 5);
    expect(gye.lugares).toEqual(['Sugar Coffee']);
    expect(r.provincias.map((p) => [p.provincia, p.total])).toEqual([['Guayas', 2], ['Pichincha', 1]]);
    expect(r.provinciasSinOportunidades).not.toContain('Guayas');
    expect(r.provinciasSinOportunidades).toHaveLength(22);
  });

  it('entrega cada oportunidad por separado (para el mapa de calor), con su estado y monto', () => {
    const r = agruparMapa([
      fila({ locationLat: -2.17, locationLng: -79.92, locationProvince: 'Guayas', quotedAmount: 1000, locationName: 'Sugar Coffee' }),
      fila({ locationLat: -2.18, locationLng: -79.91, locationProvince: 'Guayas', outcome: 'GANADA', closedAt: new Date() }),
      fila({ locationLat: -0.18, locationLng: -78.47, locationProvince: 'Pichincha', outcome: 'PERDIDA', closedAt: new Date() }),
      fila({}),
    ]);
    expect(r.oportunidades).toHaveLength(3);
    expect(r.oportunidades.map((o) => o.estado)).toEqual(['abierta', 'aceptada', 'perdida']);
    expect(r.oportunidades[0]).toMatchObject({ monto: 1000, lugar: 'Sugar Coffee', provincia: 'Guayas' });
    expect(r.oportunidades[1].monto).toBe(0);
  });

  it('cuenta aparte las que no tienen ubicación', () => {
    const r = agruparMapa([fila({}), fila({ locationLat: -2.17, locationLng: -79.92, locationProvince: 'Guayas' })]);
    expect(r).toMatchObject({ total: 2, conUbicacion: 1, sinUbicacion: 1 });
    expect(r.puntos[0].ciudad).toBeNull();
  });

  it('sin ciudad agrupa por provincia (el mismo corte que el filtro Provincia + «Sin ciudad» de la lista)', () => {
    const r = agruparMapa([
      fila({ locationLat: -2.171, locationLng: -79.921, locationProvince: 'Guayas' }),
      fila({ locationLat: -2.172, locationLng: -79.922, locationProvince: 'Guayas' }),
      fila({ locationLat: -2.4, locationLng: -79.9, locationProvince: 'Guayas' }),
      fila({ locationLat: -0.18, locationLng: -78.47, locationProvince: 'Pichincha' }),
    ]);
    expect(r.puntos.map((p) => [p.provincia, p.ciudad, p.total])).toEqual([['Guayas', null, 3], ['Pichincha', null, 1]]);
  });

  it('el total de cada burbuja es la suma de sus oportunidades y cuadra con el de su provincia', () => {
    const r = agruparMapa([
      fila({ locationLat: -2.17, locationLng: -79.92, locationCity: 'Guayaquil', locationProvince: 'Guayas' }),
      fila({ locationLat: -2.2, locationLng: -79.9, locationCity: 'Daule', locationProvince: 'Guayas' }),
      fila({ locationLat: -2.3, locationLng: -79.8, locationProvince: 'Guayas' }),
    ]);
    const guayas = r.provincias.find((p) => p.provincia === 'Guayas')!;
    expect(r.puntos.filter((p) => p.provincia === 'Guayas').reduce((n, p) => n + p.total, 0)).toBe(guayas.total);
  });

  it('cada oportunidad lleva su id (para abrirla en la lista)', () => {
    const r = agruparMapa([fila({ id: 42, locationLat: -2.17, locationLng: -79.92, locationProvince: 'Guayas' })]);
    expect(r.oportunidades[0].id).toBe(42);
  });
});
