import { combinarDireccion, direccionDeLead } from './lead-datos.util';
import { extraServicioRequerido } from './ventas-servicios.util';

describe('combinarDireccion', () => {
  it('junta dirección y ciudad, y no repite la ciudad si ya viene dentro', () => {
    expect(combinarDireccion('Av. Amazonas 123', 'Quito')).toBe('Av. Amazonas 123, Quito');
    expect(combinarDireccion('Av. Amazonas 123, Quito', 'quito')).toBe('Av. Amazonas 123, Quito');
  });

  it('con una sola de las dos, devuelve esa; con ninguna, null', () => {
    expect(combinarDireccion('  Calle 5  ', undefined)).toBe('Calle 5');
    expect(combinarDireccion(undefined, 'Guayaquil')).toBe('Guayaquil');
    expect(combinarDireccion('', '  ')).toBeNull();
    expect(combinarDireccion(null, null)).toBeNull();
  });

  it('limpia espacios de más y tiene tope', () => {
    expect(combinarDireccion('Calle   10\n y  Sucre', null)).toBe('Calle 10 y Sucre');
    expect(combinarDireccion('x'.repeat(500), null)!.length).toBe(300);
  });

  it('ignora lo que no es texto', () => {
    expect(combinarDireccion(123 as unknown, {} as unknown)).toBeNull();
  });
});

describe('direccionDeLead', () => {
  it('lee extra.direccion', () => {
    expect(direccionDeLead({ direccion: ' Av. Colón 45 ', gclid: 'x' })).toBe('Av. Colón 45');
  });
  it('sin dirección o con un extra raro, null', () => {
    expect(direccionDeLead({})).toBeNull();
    expect(direccionDeLead(null)).toBeNull();
    expect(direccionDeLead('texto')).toBeNull();
  });
});

describe('extraServicioRequerido — «Servicio requerido» de la ficha', () => {
  it('reconoce los servicios del catálogo de fábrica y arma categoría y sub-servicios', () => {
    expect(extraServicioRequerido(['Agentes de Seguridad', 'Seguridad VIP'])).toEqual({
      servicio_requerido: 'SEGURIDAD_FISICA',
      servicio_requerido__sub: 'AGENTES_DE_SEGURIDAD,SEGURIDAD_VIP',
    });
  });

  it('no distingue mayúsculas ni espacios', () => {
    expect(extraServicioRequerido(['  monitoreo de cámaras '])).toMatchObject({
      servicio_requerido: 'MONITOREO',
      servicio_requerido__sub: 'MONITOREO_DE_CAMARAS',
    });
  });

  it('de varias categorías gana la que tiene más servicios, con solo los suyos', () => {
    const r = extraServicioRequerido(['Agentes de Seguridad', 'Monitoreo de Cámaras', 'Monitoreo de Alarmas']);
    expect(r.servicio_requerido).toBe('MONITOREO');
    expect(r.servicio_requerido__sub.split(',').sort()).toEqual(['MONITOREO_DE_ALARMAS', 'MONITOREO_DE_CAMARAS']);
  });

  it('un servicio propio de la empresa (sin clave de fábrica) no llena la ficha: queda solo en la oportunidad', () => {
    expect(extraServicioRequerido(['Servicio inventado por la empresa'])).toEqual({});
    expect(extraServicioRequerido([])).toEqual({});
  });
});
